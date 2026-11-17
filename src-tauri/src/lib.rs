// Pausa's native shell: a window (desktop) or a webview (iOS/Android) that opens the hosted app.
// There is no second UI to maintain: every change to the web app is live in the shell on the next launch.
// Native features (push notifications, share sheet) are added here as Tauri plugins, behind capabilities.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Pausa");
}
