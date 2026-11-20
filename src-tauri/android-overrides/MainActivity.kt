package org.gnagno.pausa

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

// Replaces the generated src-tauri/gen/android/app/src/main/java/org/gnagno/pausa/MainActivity.kt (see README, "Native app").
// The template draws the web page edge to edge, behind the status bar and the gesture bar, so the top of the site slid under
// the phone's clock and the bottom tabs under the gesture bar. Here the page gets the system bars (and the keyboard) as
// padding, on the dark ground of the app, with light icons in the status bar.
// The padding is set once the WebView exists (Tauri creates it after onCreate) on the view that holds it, and asked for
// again, so it is never missed. The insets are consumed here: the page then reads env(safe-area-inset-*) as 0 and does not
// pad twice (the site pads itself only when nothing outside it did, e.g. an installed PWA on iOS).
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.parseColor("#001113"))
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false
    padForSystemBars(findViewById(android.R.id.content))
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    padForSystemBars((webView.parent as? View) ?: findViewById(android.R.id.content))
  }

  private fun padForSystemBars(host: View) {
    host.setBackgroundColor(Color.parseColor("#001113"))
    ViewCompat.setOnApplyWindowInsetsListener(host) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(host)
  }
}
