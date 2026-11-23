use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem, Submenu}, Emitter, Manager};

fn documents_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("saved-documents.json"))
}

/// Reads the saved-document records stored at `path`; a missing file means none saved yet.
fn read_documents_file(path: &Path) -> Result<Vec<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

/// Where a save is written before it replaces the real file.
fn pending_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

/// Saves atomically: the records go to a temporary file beside `path`, are flushed
/// to disk, and only then renamed over it. A crash or full disk mid-save leaves the
/// previous file whole instead of truncated.
fn write_documents_file(path: &Path, records: &[serde_json::Value]) -> Result<(), String> {
    let contents = serde_json::to_string(records).map_err(|error| error.to_string())?;
    let pending = pending_path(path);
    let result = (|| {
        let mut file = fs::File::create(&pending)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&pending, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    result.map_err(|error| error.to_string())
}

#[tauri::command]
fn read_saved_documents(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    read_documents_file(&documents_path(&app)?)
}

#[tauri::command]
fn write_saved_documents(app: tauri::AppHandle, records: Vec<serde_json::Value>) -> Result<(), String> {
    write_documents_file(&documents_path(&app)?, &records)
}

/// The standard AppKit action for a text-editing shortcut the native menu took over.
fn text_edit_action(action: &str) -> Option<&'static std::ffi::CStr> {
    match action {
        "undo" => Some(c"undo:"),
        "redo" => Some(c"redo:"),
        "cut" => Some(c"cut:"),
        "copy" => Some(c"copy:"),
        "paste" => Some(c"paste:"),
        "selectAll" => Some(c"selectAll:"),
        _ => None,
    }
}

/// The native menu's ⌘Z/⌘X/⌘C/⌘V/⌘A items reach the app as menu events, so the
/// focused text field never sees them. While one has focus, the frontend calls
/// this to send the standard action down the responder chain to the web view,
/// which then edits the text exactly as it would in any other Mac app.
#[tauri::command]
fn native_text_edit(app: tauri::AppHandle, action: String) -> Result<(), String> {
    let selector = text_edit_action(&action).ok_or_else(|| format!("Unknown text edit: {action}"))?;
    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(move || {
            use objc2::{runtime::Sel, MainThreadMarker};
            use objc2_app_kit::NSApplication;
            let Some(main) = MainThreadMarker::new() else { return };
            let ns_app = NSApplication::sharedApplication(main);
            // SAFETY: a nil target sends a standard editing action to the first responder.
            unsafe { ns_app.sendAction_to_from(Sel::register(selector), None, None) };
        })
        .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, selector);
        Err("Native text editing is only available on macOS".into())
    }
}

#[cfg_attr(mobile, export_name = "mobile_entry")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_saved_documents, write_saved_documents, native_text_edit])
        .setup(|app| {
            let handle = app.handle();
            let item = |id: &'static str, title: &'static str, accelerator: Option<&'static str>| {
                MenuItem::with_id(handle, id, title, true, accelerator)
            };

            #[cfg(target_os = "macos")]
            let app_menu = Submenu::with_items(handle, "Layout 2D Editor", true, &[
                &PredefinedMenuItem::about(handle, None, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::services(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::hide(handle, None)?,
                &PredefinedMenuItem::hide_others(handle, None)?,
                &PredefinedMenuItem::show_all(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::quit(handle, None)?,
            ])?;

            let new_document = item("new-document", "New Document", Some("CmdOrCtrl+N"))?;
            let open_saved = item("open-local-document", "Open Saved Document…", Some("CmdOrCtrl+Shift+O"))?;
            let load_json = item("open-json-document", "Load JSON File…", None)?;
            let open_png_document = item("open-png-document", "Open Draw PNG…", None)?;
            let import_svg = item("import-svg", "Import SVG…", None)?;
            let import_image = item("import-image", "Import Image…", None)?;
            let save_document = item("save-local-document", "Save Document", Some("CmdOrCtrl+S"))?;
            let export_json = item("save-json-document", "Export JSON…", None)?;
            let save_png_document = item("save-png-document", "Save as JSON PNG…", None)?;
            let file_menu = Submenu::with_items(handle, "File", true, &[
                &new_document, &open_saved, &load_json, &open_png_document, &import_svg, &import_image, &PredefinedMenuItem::separator(handle)?,
                &save_document, &export_json, &save_png_document,
            ])?;

            let undo = item("undo", "Undo", Some("CmdOrCtrl+Z"))?;
            let redo = item("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?;
            let duplicate = item("selection-duplicate", "Duplicate", Some("CmdOrCtrl+D"))?;
            let delete = item("selection-delete", "Delete", None)?;
            let cut = item("selection-cut", "Cut", Some("CmdOrCtrl+X"))?;
            let copy = item("selection-copy", "Copy", Some("CmdOrCtrl+C"))?;
            let paste = item("selection-paste", "Paste", Some("CmdOrCtrl+V"))?;
            let select_all = item("select-all", "Select All", Some("CmdOrCtrl+A"))?;
            let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                &undo, &redo, &PredefinedMenuItem::separator(handle)?, &duplicate, &delete,
                &PredefinedMenuItem::separator(handle)?, &cut, &copy, &paste, &select_all,
            ])?;

            // Keep these menus in step with the web menubar in src/app.tsx, which the
            // desktop app hides; test/tauri-config.test.ts checks that they match.
            let view_menu = Submenu::with_items(handle, "View", true, &[
                &item("ui-show-command-palette", "Show Command Palette", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("ui-toggle-left-sidebar", "Toggle Left Sidebar", None)?,
                &item("ui-toggle-right-sidebar", "Toggle Right Sidebar", None)?,
            ])?;

            let new_page = item("new-page", "New Page", None)?;
            let rename_page = item("rename-page", "Rename Page…", None)?;
            let delete_page = item("delete-page", "Delete Page", None)?;
            let page_menu = Submenu::with_items(handle, "Page", true, &[&new_page, &rename_page, &delete_page])?;

            let new_vector = item("new-vector-network", "New Vector Network", None)?;
            let new_rectangle = item("new-rectangle", "New Rectangle", None)?;
            let new_circle = item("new-circle", "New Circle", None)?;
            let new_text = item("new-text", "New Text", None)?;
            let new_pixel_image = item("new-pixelimage", "New Pixel Image…", None)?;
            let new_repeating_image = item("new-repeatingimage", "New Repeating Image…", None)?;
            let import_png = item("import-png", "Import PNG…", None)?;
            let shape_menu = Submenu::with_items(handle, "Shape", true, &[
                &new_vector, &new_rectangle, &new_circle, &new_text, &PredefinedMenuItem::separator(handle)?,
                &new_pixel_image, &new_repeating_image, &import_png,
            ])?;

            let assets_menu = Submenu::with_items(handle, "Assets", true, &[
                &item("new-color-palette", "New Color Palette", None)?,
                &item("import-color-palette", "Import Color Palette", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("add-google-font", "Add Google Font…", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("new-pico8-palette", "Add PICO-8 Palette", None)?,
            ])?;

            let arrange_menu = Submenu::with_items(handle, "Align", true, &[
                &item("align-left", "Align Left", None)?,
                &item("align-center", "Align Horizontal Center", None)?,
                &item("align-right", "Align Right", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("align-top", "Align Top", None)?,
                &item("align-middle", "Align Vertical Middle", None)?,
                &item("align-bottom", "Align Bottom", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("align-distribute-horizontal", "Distribute Horizontally", None)?,
                &item("align-distribute-vertical", "Distribute Vertically", None)?,
            ])?;

            let appearance_menu = Submenu::with_items(handle, "Appearance", true, &[
                &item("theme-system", "System Theme", None)?,
                &item("theme-light", "Light Theme", None)?,
                &item("theme-dark", "Dark Theme", None)?,
                &PredefinedMenuItem::separator(handle)?,
                &item("theme-settings", "Theme Settings…", None)?,
            ])?;
            let help_menu = Submenu::with_items(handle, "Help", true, &[
                &item("ui-show-keyboard-shortcuts", "Keyboard Shortcuts…", None)?,
            ])?;
            let menu = Menu::with_items(handle, &[
                #[cfg(target_os = "macos")]
                &app_menu,
                &file_menu, &edit_menu, &view_menu, &page_menu, &shape_menu, &assets_menu, &arrange_menu,
                &appearance_menu, &help_menu,
            ])?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("native-menu-action", event.id().as_ref());
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A fresh, empty directory under the system temp dir, removed when dropped.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("layout-new-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn file(&self) -> PathBuf {
            self.0.join("saved-documents.json")
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn text_edits_map_to_standard_appkit_actions() {
        assert_eq!(text_edit_action("copy"), Some(c"copy:"));
        assert_eq!(text_edit_action("selectAll"), Some(c"selectAll:"));
        assert_eq!(text_edit_action("undo"), Some(c"undo:"));
        assert_eq!(text_edit_action("terminate"), None);
        assert_eq!(text_edit_action("copy:"), None);
    }

    #[test]
    fn missing_file_reads_as_no_documents() {
        let dir = TempDir::new("missing");
        assert_eq!(read_documents_file(&dir.file()).unwrap(), Vec::<serde_json::Value>::new());
    }

    #[test]
    fn written_records_read_back_unchanged() {
        let dir = TempDir::new("roundtrip");
        let records = vec![
            json!({"id": "a", "name": "First", "savedAt": "2026-11-22T10:00:00Z", "json": "{\"title\":\"First\"}"}),
            json!({"id": "b", "name": "Ünïcödé ✏️", "savedAt": "2026-11-22T11:00:00Z", "json": "{}"}),
        ];
        write_documents_file(&dir.file(), &records).unwrap();
        assert_eq!(read_documents_file(&dir.file()).unwrap(), records);
    }

    #[test]
    fn writing_replaces_previous_records() {
        let dir = TempDir::new("replace");
        write_documents_file(&dir.file(), &[json!({"id": "old"})]).unwrap();
        write_documents_file(&dir.file(), &[]).unwrap();
        assert!(read_documents_file(&dir.file()).unwrap().is_empty());
    }

    #[test]
    fn saving_leaves_no_temporary_file_behind() {
        let dir = TempDir::new("no-temp");
        write_documents_file(&dir.file(), &[json!({"id": "a"})]).unwrap();
        assert!(!pending_path(&dir.file()).exists());
        let names: Vec<_> = fs::read_dir(&dir.0).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("saved-documents.json")]);
    }

    #[test]
    fn a_failed_save_keeps_the_previous_records() {
        let dir = TempDir::new("failed-save");
        let previous = vec![json!({"id": "kept"})];
        write_documents_file(&dir.file(), &previous).unwrap();
        // A directory where the temporary file goes makes the save fail before the rename.
        fs::create_dir(pending_path(&dir.file())).unwrap();
        assert!(write_documents_file(&dir.file(), &[json!({"id": "lost"})]).is_err());
        assert_eq!(read_documents_file(&dir.file()).unwrap(), previous);
    }

    #[test]
    fn a_leftover_temporary_file_is_ignored_and_replaced() {
        let dir = TempDir::new("leftover");
        write_documents_file(&dir.file(), &[json!({"id": "saved"})]).unwrap();
        fs::write(pending_path(&dir.file()), "{half-written").unwrap();
        assert_eq!(read_documents_file(&dir.file()).unwrap(), vec![json!({"id": "saved"})]);
        write_documents_file(&dir.file(), &[json!({"id": "next"})]).unwrap();
        assert_eq!(read_documents_file(&dir.file()).unwrap(), vec![json!({"id": "next"})]);
        assert!(!pending_path(&dir.file()).exists());
    }

    #[test]
    fn corrupt_or_non_array_files_are_errors() {
        let dir = TempDir::new("corrupt");
        fs::write(dir.file(), "{not json").unwrap();
        assert!(read_documents_file(&dir.file()).is_err());
        fs::write(dir.file(), r#"{"id": "not-an-array"}"#).unwrap();
        assert!(read_documents_file(&dir.file()).is_err());
    }
}
