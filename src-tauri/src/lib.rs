// Pausa's native shell: a window (desktop) or a webview (iOS/Android) that opens the hosted app.
// There is no second UI to maintain: every change to the web app is live in the shell on the next launch.
//
// Signing in: Google refuses OAuth inside a WebView, so the shell hands sign-in to the system browser and takes the result back:
//   1. the site sends the WebView to https://pausa.gnagno.org/api/native/start: the shell catches that address and opens it in the browser;
//   2. the browser signs in (Google, or the email link) and ends on /api/native/done, which opens  pausa://auth?token=...&next=...;
//   3. the shell receives that link and loads /api/native/exchange in its own WebView, which swaps the single-use token for a session.

use tauri::{Manager, Url};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://pausa.gnagno.org";
const HOST: &str = "pausa.gnagno.org";

/// Turns a pausa://auth?token=...&next=... link into the address that swaps the token for a session in the WebView.
fn exchange_url(link: &Url) -> Option<Url> {
    if link.scheme() != "pausa" || link.host_str() != Some("auth") {
        return None;
    }
    let mut url = Url::parse(SITE).ok()?.join("/api/native/exchange").ok()?;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in link.query_pairs() {
            if key == "token" || key == "next" {
                query.append_pair(&key, &value);
            }
        }
    }
    Some(url)
}

fn open_link<R: tauri::Runtime>(app: &tauri::AppHandle<R>, link: &Url) {
    if let (Some(url), Some(window)) = (exchange_url(link), app.get_webview_window("main")) {
        let _ = window.navigate(url);
        let _ = window.set_focus();
    }
}

/// Sends the sign-in start address to the system browser instead of loading it in the WebView.
fn shell_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("pausa-shell")
        .on_navigation(|webview, url| {
            if url.host_str() == Some(HOST) && url.path().starts_with("/api/native/start") {
                let _ = webview.app_handle().opener().open_url(url.as_str(), None::<&str>);
                return false;
            }
            true
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Desktop: a second launch (the pausa:// link) goes to the window that is already open.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(shell_plugin())
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for link in event.urls() {
                    open_link(&handle, &link);
                }
            });
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            app.deep_link().register_all()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Pausa");
}
