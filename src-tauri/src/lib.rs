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
            let open_saved = item("open-saved", "Open Saved Document…", Some("CmdOrCtrl+Shift+O"))?;
            let load_json = item("load-json", "Load JSON File…", None)?;
            let save_document = item("save-document", "Save Document", Some("CmdOrCtrl+S"))?;
            let export_json = item("export-json", "Export JSON…", None)?;
            let file_menu = Submenu::with_items(handle, "File", true, &[
                &new_document, &open_saved, &load_json, &PredefinedMenuItem::separator(handle)?,
                &save_document, &export_json,
            ])?;

            let undo = item("undo", "Undo", Some("CmdOrCtrl+Z"))?;
            let redo = item("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?;
            let duplicate = item("duplicate", "Duplicate", Some("CmdOrCtrl+D"))?;
            let delete = item("delete", "Delete", None)?;
            let cut = item("cut", "Cut", Some("CmdOrCtrl+X"))?;
            let copy = item("copy", "Copy", Some("CmdOrCtrl+C"))?;
            let paste = item("paste", "Paste", Some("CmdOrCtrl+V"))?;
            let edit_menu = Submenu::with_items(handle, "Edit", true, &[
                &undo, &redo, &PredefinedMenuItem::separator(handle)?, &duplicate, &delete,
                &PredefinedMenuItem::separator(handle)?, &cut, &copy, &paste,
            ])?;

            let new_page = item("new-page", "New Page", None)?;
            let rename_page = item("rename-page", "Rename Page…", None)?;
            let delete_page = item("delete-page", "Delete Page", None)?;
            let page_menu = Submenu::with_items(handle, "Page", true, &[&new_page, &rename_page, &delete_page])?;

            let new_vector = item("new-vector", "New Vector Network", None)?;
            let new_rectangle = item("new-rectangle", "New Rectangle", None)?;
            let new_circle = item("new-circle", "New Circle", None)?;
            let new_pixel_image = item("new-pixel-image", "New Pixel Image…", None)?;
            let new_repeating_image = item("new-repeating-image", "New Repeating Image…", None)?;
            let import_png = item("import-png", "Import PNG…", None)?;
            let shape_menu = Submenu::with_items(handle, "Shape", true, &[
                &new_vector, &new_rectangle, &new_circle, &PredefinedMenuItem::separator(handle)?,
                &new_pixel_image, &new_repeating_image, &import_png,
            ])?;

            let appearance_menu = Submenu::with_items(handle, "Appearance", true, &[
                &item("theme-system", "System Theme", None)?,
                &item("theme-light", "Light Theme", None)?,
                &item("theme-dark", "Dark Theme", None)?,
            ])?;
            let menu = Menu::with_items(handle, &[
                #[cfg(target_os = "macos")]
                &app_menu,
                &file_menu, &edit_menu, &page_menu, &shape_menu, &appearance_menu,
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
