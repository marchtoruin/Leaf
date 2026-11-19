use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use super::{load, markdown, Document};

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
const LIMIT: usize = 20 * 1024 * 1024;

fn snapshot(path: &Path) -> io::Result<String> {
    if fs::metadata(path)?.len() > LIMIT as u64 {
        return Err(io::Error::other("File exceeds Leaf's 20 MB limit."));
    }
    fs::read_to_string(path)
}

fn write_checked(path: &Path, content: &str, expected: Option<&str>) -> Result<Document, String> {
    if !markdown(path) {
        return Err("Choose a Markdown filename (.md, .markdown, .mdown, or .mkd).".into());
    }

    let prefix = expected.filter(|text| text.starts_with('\u{feff}')).map_or("", |_| "\u{feff}");
    if content.len() + prefix.len() > LIMIT {
        return Err("This file exceeds Leaf's 20 MB limit.".into());
    }

    let (temporary, mut file) = loop {
        let id = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let temporary = path.with_file_name(format!(".leaf-{}-{id}.tmp", std::process::id()));
        match OpenOptions::new().create_new(true).write(true).open(&temporary) {
            Ok(file) => break (temporary, file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not prepare save: {error}")),
        }
    };

    let written = (|| {
        file.write_all(prefix.as_bytes())?;
        file.write_all(content.as_bytes())?;
        file.sync_all()
    })();
    drop(file);

    let result = (|| {
        written.map_err(|error| format!("Could not write the draft: {error}"))?;
        if let Some(expected) = expected {
            let current = snapshot(path).map_err(|error| {
                format!("Could not verify the original file: {error}. Use Save As to keep your edits.")
            })?;
            if current != expected {
                return Err("This file changed on disk. Use Save As to keep your edits in another file.".into());
            }
            fs::rename(&temporary, path)
        } else {
            fs::hard_link(&temporary, path)
        }
        .map_err(|error| format!("Could not save the document: {error}"))?;
        load(path)
    })();

    let _ = fs::remove_file(&temporary);
    result
}

#[tauri::command]
pub fn save_document(path: String, content: String, expected: String) -> Result<Document, String> {
    write_checked(Path::new(&path), &content, Some(&expected))
}

#[tauri::command]
pub async fn save_document_as(name: String, content: String) -> Result<Option<Document>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_file_name(&name)
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd"])
        .save_file()
        .await;
    let Some(file) = file else { return Ok(None) };
    let mut path = file.path().to_path_buf();
    if path.extension().is_none() {
        path.set_extension("md");
        return write_checked(&path, &content, None).map(Some);
    }
    match snapshot(&path) {
        Ok(existing) => {
            let path = path.canonicalize().map_err(|error| error.to_string())?;
            write_checked(&path, &content, Some(&existing))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => write_checked(&path, &content, None),
        Err(error) => Err(format!("Could not prepare Save As: {error}")),
    }
    .map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_atomically_and_rejects_a_stale_snapshot() {
        let folder = std::env::temp_dir().join(format!("leaf-save-test-{}", std::process::id()));
        fs::create_dir(&folder).unwrap();
        let path = folder.join("Notes.md");
        let first = write_checked(&path, "# First", None).unwrap();
        assert!(write_checked(&path, "# Another", None).is_err());
        let second = save_document(first.path.clone(), "# Second".into(), first.snapshot.clone()).unwrap();
        assert_eq!(second.content, "# Second");
        assert!(save_document(first.path, "# Stale".into(), first.snapshot).is_err());
        assert_eq!(snapshot(&path).unwrap(), "# Second");
        assert_eq!(fs::read_dir(&folder).unwrap().count(), 1);
        fs::remove_file(&path).unwrap();
        fs::remove_dir(&folder).unwrap();
    }
}
