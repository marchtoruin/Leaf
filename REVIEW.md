# First build review

Implemented in this folder: Tauri v2 Windows reader, separate process/window for each launch, startup path argument, native file picker, native file drop, Markdown + sanitized HTML, local raster images, relative Markdown links, HTTP(S) browser links, light/dark theme, code highlighting/copying, tables, task lists, heading anchors.

Verified by Rook:
- `npm test`: 3 passed (rendering, unsafe HTML/protocol removal, duplicate headings and unknown languages).
- `cargo test`: 2 passed (spaced and Unicode paths, BOM/UTF-8, missing files, non-Markdown files, invalid external protocols).
- `npm run tauri build`: passed; NSIS installer 1.38 MiB, portable exe approximately 4.3 MiB.
- Launched final executable with absolute sample path containing spaces. Process remained running without early stderr. Window screenshot showed the named document, formatted headings, strong/emphasis, blockquote, table, and word count in dark mode. Closed the test process afterward.

Pending independent review and interactive QA:
- Open picker, drag/drop, copy, theme switch, light palette, narrow window, local images, links, second independent window.
- Installer execution and Windows Open With / default association behavior. Installer has only been built, not installed; no default app settings changed.
- Startup timing and memory have not been measured. Earlier size/speed estimates were proposals, not measurements.

Artifacts: `src-tauri/target/release/leaf-reader.exe` and `src-tauri/target/release/bundle/nsis/Leaf_0.1.0_x64-setup.exe`.
