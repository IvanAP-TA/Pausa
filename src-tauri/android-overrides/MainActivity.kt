package org.gnagno.pausa

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

// Replaces the generated src-tauri/gen/android/app/src/main/java/org/gnagno/pausa/MainActivity.kt (see README, "Native app").
// The template draws the web page edge to edge, behind the status bar and the gesture bar, so the top bar of the site
// slid under the phone's clock. Here the page gets the system bars (and the keyboard) as padding instead, on the dark
// ground of the app, with light icons in the status bar.
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val root = findViewById<View>(android.R.id.content)
    root.setBackgroundColor(Color.parseColor("#001113"))
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = false
  }
}
