#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::path::{Path, PathBuf};
use tauri::Manager;
mod save;


#[derive(serde::Serialize)]
struct Document { path: String, name: String, content: String, snapshot: String }
fn markdown(path: &Path) -> bool { path.extension().and_then(|x|x.to_str()).map(|x|matches!(x.to_ascii_lowercase().as_str(),"md"|"markdown"|"mdown"|"mkd")).unwrap_or(false) }
fn load(path: &Path) -> Result<Document,String> {
    if !markdown(path) { return Err("Please choose a Markdown file (.md or .markdown).".into()); }
    let path = path.canonicalize().map_err(|e|format!("Could not open file: {e}"))?;
    if std::fs::metadata(&path).map_err(|e|e.to_string())?.len()>20*1024*1024 {return Err("This file exceeds Leaf's 20 MB limit.".into());}
    let content = std::fs::read_to_string(&path).map_err(|e|format!("Could not read UTF-8 Markdown: {e}"))?;
    Ok(Document {name:path.file_name().unwrap_or_default().to_string_lossy().into(),path:path.to_string_lossy().into(),content:content.trim_start_matches('\u{feff}').into(),snapshot:content})
}
#[tauri::command]
fn read_document(path: String) -> Result<Document,String> { load(Path::new(&path)) }
#[tauri::command]
fn startup_document() -> Result<Option<Document>,String> {std::env::args_os().nth(1).map(|p|load(Path::new(&p))).transpose()}
#[tauri::command]
async fn pick_document() -> Result<Option<Document>,String> {let file=rfd::AsyncFileDialog::new().add_filter("Markdown",&["md","markdown","mdown","mkd"]).pick_file().await;file.map(|f|load(f.path())).transpose()}
fn relative_path(document_path: &str, relative: &str) -> Result<PathBuf,String> { let base=Path::new(document_path).canonicalize().map_err(|e|e.to_string())?;let parent=base.parent().ok_or("Missing parent directory")?;let rel=Path::new(relative);if rel.is_absolute(){return Err("Use a relative file link.".into());}parent.join(rel).canonicalize().map_err(|e|e.to_string()) }
#[tauri::command]
fn resolve_document(document_path: String, relative: String) -> Result<String,String> {let path=relative_path(&document_path,&relative)?;if !markdown(&path){return Err("This link is not a Markdown document.".into());}Ok(path.to_string_lossy().into())}
#[tauri::command]
fn resolve_image(app: tauri::AppHandle, document_path:String, relative:String) -> Result<String,String> {let path=relative_path(&document_path,&relative)?;let root=Path::new(&document_path).canonicalize().map_err(|e|e.to_string())?;if !path.starts_with(root.parent().ok_or("Missing folder")?){return Err("Image must be inside the document folder.".into());}let ext=path.extension().and_then(|e|e.to_str()).unwrap_or("").to_ascii_lowercase();if !matches!(ext.as_str(),"png"|"jpg"|"jpeg"|"gif"|"webp"|"bmp"|"avif"){return Err("Unsupported image format".into());}app.asset_protocol_scope().allow_file(&path).map_err(|e|e.to_string())?;Ok(path.to_string_lossy().into())}
#[tauri::command]
fn open_link(url:String) -> Result<(),String> {if !url.starts_with("https://")&&!url.starts_with("http://"){return Err("Only web links are supported.".into());}open::that_detached(url).map_err(|e|e.to_string())}
fn main() {tauri::Builder::default().invoke_handler(tauri::generate_handler![read_document,startup_document,pick_document,resolve_document,resolve_image,open_link,save::save_document,save::save_document_as]).run(tauri::generate_context!()).expect("Failed to start Leaf");}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_unicode_and_spaced_paths_and_strips_bom() {
        let folder = std::env::temp_dir().join(format!("leaf-test-{}",std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let path=folder.join("Hello reader 日本語.MD");
        std::fs::write(&path,"\u{feff}# Hello 🌿").unwrap();
        let doc=load(&path).unwrap();
        assert_eq!(doc.content,"# Hello 🌿");
        assert_eq!(doc.name,"Hello reader 日本語.MD");
        assert!(resolve_document(path.to_string_lossy().into(),"missing.md".into()).is_err());
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&folder).unwrap();
    }
    #[test]
    fn rejects_non_markdown_and_missing_files() {
        assert!(load(Path::new("anything.exe")).is_err());
        assert!(load(Path::new("missing-file.md")).is_err());
        assert!(open_link("javascript:alert(1)".into()).is_err());
    }
}
