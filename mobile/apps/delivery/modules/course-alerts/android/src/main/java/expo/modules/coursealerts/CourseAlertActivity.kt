package expo.modules.coursealerts

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.NotificationResponse
import expo.modules.notifications.notifications.NotificationSerializer
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import org.json.JSONObject
import java.util.Date
import java.util.Locale

/** A limited offer screen; the rest of the account remains behind the phone lock. */
class CourseAlertActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var offer = JSONObject()
  private lateinit var countdown: TextView
  private val tick = object : Runnable {
    override fun run() {
      val left = offer.optLong("expiresAtMs") - System.currentTimeMillis()
      if (left <= 0) { close(); return }
      countdown.text = "Répondre dans ${(left + 999) / 1000} s"
      handler.postDelayed(this, 250)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SECURE)
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
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.rgb(33, 97, 239))
      setPadding(dp(24), dp(40), dp(24), dp(40))
    }
    fun text(value: String, size: Float): TextView = TextView(this).apply {
      text = value; textSize = size; setTextColor(Color.WHITE)
      setPadding(0, dp(8), 0, dp(8))
      root.addView(this, LinearLayout.LayoutParams(-1, -2))
    }
    text("ZupEat Livreur", 18f)
    text(if (offer.optBoolean("demo")) "Nouvelle course · TEST" else "Nouvelle course", 32f)
    val count = offer.optInt("count", 1)
    if (count > 1) text("${count} courses proposées ensemble", 18f)
    text(String.format(Locale.FRANCE, "%.2f €", offer.optDouble("payout", 0.0)), 40f)
    text(offer.optString("pickupStore", "Commerce"), 23f)
    val from = offer.optString("pickupCity").ifBlank { "Retrait au commerce" }
    val to = offer.optString("deliveryCity").ifBlank { "Destination dans l’application" }
    text("$from  →  $to", 18f)
    if (offer.has("distanceKm") && !offer.isNull("distanceKm")) {
      text(String.format(Locale.FRANCE, "Trajet payé : %.1f km", offer.optDouble("distanceKm")), 18f)
    }
    countdown = text("", 20f)
    fun button(label: String, callback: () -> Unit) {
      root.addView(Button(this).apply {
        text = label; isAllCaps = false; textSize = 19f
        setOnClickListener { callback() }
      }, LinearLayout.LayoutParams(-1, dp(60)).apply { topMargin = dp(12) })
    }
    button("Accepter la course") { answer("accepter") }
    button("Refuser la course") { answer("refuser") }
    button("Fermer et couper la sonnerie") { close() }
    text("Seule cette proposition s’affiche sur l’écran verrouillé.", 14f)
    val scroll = android.widget.ScrollView(this).apply { setBackgroundColor(Color.rgb(33, 97, 239)); isFillViewport = true; addView(root) }
    setContentView(scroll)
    tick.run()
  }

  private fun answer(action: String) {
    if (offer.optBoolean("demo") || offer.optLong("expiresAtMs") <= System.currentTimeMillis()) { close(); return }
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
      countdown.text = "Réponse impossible. Ouvrez la notification pour réessayer."
    }
  }

  private fun close() { CourseAlertController.dismiss(this, offer.optString("id")); finish() }
  @Deprecated("Legacy back navigation")
  override fun onBackPressed() { close() }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  override fun onDestroy() {
    handler.removeCallbacks(tick)
    if (CourseAlertController.activity === this) CourseAlertController.activity = null
    super.onDestroy()
  }
}
