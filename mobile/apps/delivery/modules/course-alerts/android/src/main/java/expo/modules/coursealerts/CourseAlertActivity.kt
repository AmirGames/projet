package expo.modules.coursealerts

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.NotificationResponse
import expo.modules.notifications.notifications.NotificationSerializer
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import org.json.JSONObject
import java.util.Date

/** A limited offer screen; the rest of the account remains behind the phone lock. */
class CourseAlertActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var offer = JSONObject()
  private var web: WebView? = null
  private var pageReady = false
  private var answering = false
  private val baseUrl = "https://course-alert.zupeat.invalid/"
  private val pageAssets = mapOf("leaflet.js" to "application/javascript", "leaflet.css" to "text/css",
    "course-alert.js" to "application/javascript", "course-alert.css" to "text/css")
  private val tick = object : Runnable {
    override fun run() {
      val left = offer.optLong("expiresAtMs") - System.currentTimeMillis()
      if (left <= 0) { close(); return }
      if (pageReady) web?.evaluateJavascript("window.updateCountdown && window.updateCountdown(${System.currentTimeMillis()});", null)
      handler.postDelayed(this, 250)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
    if (Build.VERSION.SDK_INT >= 30) {
      window.setDecorFitsSystemWindows(false)
      window.insetsController?.setSystemBarsAppearance(0,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
    } else {
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) { close() }
    }
    show(intent)
  }
  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); show(intent) }
  override fun onResume() {
    super.onResume()
    // A demo started from Home does not have the high-priority FCM exemption.
    // Once this Activity is visible, Android also permits its playback service.
    if (offer.optLong("expiresAtMs") > System.currentTimeMillis()) CourseAlertController.ring(this, offer.getLong("expiresAtMs"))
  }

  private fun show(intent: Intent) {
    handler.removeCallbacks(tick)
    offer = try { JSONObject(intent.getStringExtra("offer") ?: "{}") } catch (_: Exception) { JSONObject() }
    if (offer.optLong("expiresAtMs") <= System.currentTimeMillis() || !CourseAlertController.canDisplay(this, offer.optBoolean("demo"))) { close(); return }
    CourseAlertController.attach(this, offer.optString("id"), offer.optLong("expiresAtMs"))
    answering = false
    if (!offer.has("createdAtMs")) offer.put("createdAtMs", System.currentTimeMillis())
    if (web == null) createPage() else if (pageReady) renderOffer()
    tick.run()
  }

  private fun createPage() {
    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.rgb(27, 29, 32))
      setOnApplyWindowInsetsListener { view, insets ->
        if (Build.VERSION.SDK_INT >= 30) {
          val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        } else {
          @Suppress("DEPRECATION")
          view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
            insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
        }
        insets
      }
    }
    web = WebView(this).apply {
      setBackgroundColor(Color.rgb(27, 29, 32))
      settings.javaScriptEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.domStorageEnabled = false
      settings.setSupportMultipleWindows(false)
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
          if (request.url.host != "course-alert.zupeat.invalid") return super.shouldInterceptRequest(view, request)
          val file = request.url.path?.removePrefix("/") ?: ""
          val mime = pageAssets[file] ?: return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), "".byteInputStream())
          return WebResourceResponse(mime, "utf-8", applicationContext.assets.open("course-alert/$file"))
        }
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          // Only these local page commands are consumed. No links, frames,
          // external apps or remote pages can expose the account over the lock.
          if (request.isForMainFrame && view.url?.startsWith(baseUrl) == true &&
            request.url.scheme == "zupeat-course-alert" && request.url.query == null && request.url.path.isNullOrEmpty()) {
            when (request.url.host) {
              "accepter" -> answer("accepter")
              "refuser" -> answer("refuser")
              "close" -> close()
            }
          }
          return true
        }
        override fun onPageFinished(view: WebView, url: String) {
          if (url.startsWith(baseUrl) && !isFinishing) { pageReady = true; renderOffer() }
        }
      }
    }
    root.addView(web, FrameLayout.LayoutParams(-1, -1))
    setContentView(root)
    root.requestApplyInsets()
    val html = applicationContext.assets.open("course-alert/index.html").bufferedReader().use { it.readText() }
    web?.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", baseUrl)
  }

  private fun renderOffer() {
    // This is JSON passed to a function, never interpolated into HTML. The
    // page uses textContent for API text and has no addJavascriptInterface.
    val json = offer.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    web?.evaluateJavascript("window.showOffer && window.showOffer($json);", null)
  }

  private fun answer(action: String) {
    if (answering) return
    if (offer.optBoolean("demo") || offer.optLong("expiresAtMs") <= System.currentTimeMillis()) { close(); return }
    answering = true
    // Reuse Expo's task and encrypted session; no tokens in native services or Intents.
    val content = NotificationContent.Builder().setTitle("Nouvelle course")
      .setBody(JSONObject().put("tag", "course-proposee").put("offerId", offer.getString("id")))
      .setCategoryId("course_proposee").build()
    val notification = Notification(NotificationRequest("course-alert-${offer.getString("id")}", content, null), Date())
    try {
      // The native popup makes ProcessLifecycleOwner foreground even though
      // React is backgrounded. Explicit dispatch avoids losing the action in
      // ExpoHandlingDelegate's foreground-only notification listeners.
      FirebaseMessagingDelegate.runTaskManagerTasks(applicationContext,
        NotificationSerializer.toBundle(NotificationResponse(NotificationAction(action, action, false), notification)))
      close()
    } catch (_: Exception) {
      answering = false
      web?.evaluateJavascript("window.showError && window.showError();", null)
    }
  }

  private fun close() { CourseAlertController.dismiss(this, offer.optString("id")); finish() }
  @Deprecated("Legacy back navigation")
  override fun onBackPressed() { close() }
  override fun onDestroy() {
    handler.removeCallbacks(tick)
    web?.stopLoading()
    (web?.parent as? android.view.ViewGroup)?.removeView(web)
    web?.destroy()
    web = null
    if (CourseAlertController.activity === this) CourseAlertController.activity = null
    super.onDestroy()
  }
}
