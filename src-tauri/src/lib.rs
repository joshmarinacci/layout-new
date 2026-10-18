#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Greeted from Rust.")
}

#[cfg_attr(mobile, export_name = "mobile_entry")]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
