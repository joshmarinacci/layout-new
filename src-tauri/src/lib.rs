use std::{fs, path::PathBuf};
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem, Submenu}, Emitter, Manager};

fn documents_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("saved-documents.json"))
}

#[tauri::command]
fn read_saved_documents(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = documents_path(&app)?;
    if !path.exists() { return Ok(Vec::new()); }
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_saved_documents(app: tauri::AppHandle, records: Vec<serde_json::Value>) -> Result<(), String> {
    let path = documents_path(&app)?;
    let contents = serde_json::to_string(&records).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, export_name = "mobile_entry")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_saved_documents, write_saved_documents])
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
            let save_document = item("save-local-document", "Save Document", Some("CmdOrCtrl+S"))?;
            let export_json = item("save-json-document", "Export JSON…", None)?;
            let save_png_document = item("save-png-document", "Save as JSON PNG…", None)?;
            let file_menu = Submenu::with_items(handle, "File", true, &[
                &new_document, &open_saved, &load_json, &open_png_document, &import_svg, &PredefinedMenuItem::separator(handle)?,
                &save_document, &export_json, &save_png_document,
            ])?;

            let undo = item("undo", "Undo", Some("CmdOrCtrl+Z"))?;
            let redo = item("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?;
            let duplicate = item("selection-duplicate", "Duplicate", Some("CmdOrCtrl+D"))?;
            let delete = item("selection-delete", "Delete", None)?;
            let cut = item("selection-cut", "Cut", Some("CmdOrCtrl+X"))?;
            let copy = item("selection-copy", "Copy", Some("CmdOrCtrl+C"))?;
            let paste = item("selection-paste", "Paste", Some("CmdOrCtrl+V"))?;
            let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                &undo, &redo, &PredefinedMenuItem::separator(handle)?, &duplicate, &delete,
                &PredefinedMenuItem::separator(handle)?, &cut, &copy, &paste,
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

            let appearance_menu = Submenu::with_items(handle, "Appearance", true, &[
                &item("theme-system", "System Theme", None)?,
                &item("theme-light", "Light Theme", None)?,
                &item("theme-dark", "Dark Theme", None)?,
            ])?;
            let help_menu = Submenu::with_items(handle, "Help", true, &[
                &item("ui-show-keyboard-shortcuts", "Keyboard Shortcuts…", None)?,
            ])?;
            let menu = Menu::with_items(handle, &[
                #[cfg(target_os = "macos")]
                &app_menu,
                &file_menu, &edit_menu, &page_menu, &shape_menu, &appearance_menu, &help_menu,
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
