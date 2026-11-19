# Leaf

A small Windows Markdown reader built with Tauri and WebView2. Open a file, drop it on the window, or pass its path to `leaf-reader.exe`. Each launch opens a separate window, so multiple documents stay independent.

## Development

Requires Node.js, Rust, Microsoft C++ build tools, and WebView2.

```
npm install
npm run tauri dev
npm run tauri build
```

The release executable and per-user NSIS installer are under `src-tauri/target/release`. The installer registers supported file types; Windows may still require choosing Leaf through **Open with → Choose another app → Always**. Installing does not silently override the user's default application.

Includes GFM tables, task lists, syntax highlighting, code copying, theme persistence, local images within the document folder, web links, and relative Markdown links. Raw HTML is sanitized. UTF-8 documents up to 20 MB are supported. Remote HTTPS images load when the document references them. SVG images are intentionally not loaded from local files.
