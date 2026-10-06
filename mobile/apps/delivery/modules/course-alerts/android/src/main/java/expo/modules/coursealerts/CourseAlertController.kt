package expo.modules.coursealerts

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log
import org.json.JSONObject

/** Only non-secret settings and validated, short-lived offer details are kept here. */
internal object CourseAlertController {
  private const val STORE = "zupeat.course-alerts"
  private val seen = mutableMapOf<String, Long>()
  var currentId: String? = null
    private set
  var activity: CourseAlertActivity? = null
  private var mutedId: String? = null

  fun attach(activity: CourseAlertActivity, id: String, expires: Long) {
    this.activity = activity
    currentId = id
    seen[id] = expires
  }

  fun canDisplay(context: Context, demo: Boolean): Boolean {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    return prefs.getBoolean("popup", false) && Settings.canDrawOverlays(context) && (demo || prefs.getBoolean("active", false))
  }

  fun mute(context: Context) { mutedId = currentId; stopSound(context) }

  fun configure(context: Context, active: Boolean, popup: Boolean, alarm: Boolean, sound: Boolean) {
    context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
      .putBoolean("active", active).putBoolean("popup", popup)
      .putBoolean("alarm", alarm).putBoolean("sound", sound).apply()
    if (!active || !popup) activity?.finish()
    if (!active || !alarm || !sound) stopSound(context)
    if (!active) { seen.clear(); currentId = null; mutedId = null }
  }

  fun present(context: Context, offer: JSONObject) {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val demo = offer.optBoolean("demo")
    if (!demo && !prefs.getBoolean("active", false)) return
    val popup = prefs.getBoolean("popup", false) && Settings.canDrawOverlays(context)
    val alarm = prefs.getBoolean("alarm", false) && prefs.getBoolean("sound", true)
    if (!popup && !alarm) return
    val now = System.currentTimeMillis()
    val id = offer.optString("id")
    val expires = offer.optLong("expiresAtMs")
    if (id.isBlank() || expires <= now) return
    seen.entries.removeAll { it.value <= now }
    if (seen.containsKey(id)) return
    // A malformed offer must never leave a ringtone running indefinitely.
    offer.put("expiresAtMs", minOf(expires, now + 120000))
    seen[id] = expires
    currentId = id
    if (alarm) ring(context, offer.getLong("expiresAtMs"))
    if (popup) {
      try {
        context.startActivity(Intent(context, CourseAlertActivity::class.java)
          .putExtra("offer", offer.toString())
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
      } catch (error: Exception) {
        Log.w("CourseAlerts", "Android refused the course window; push remains available", error)
      }
    }
  }

  fun ring(context: Context, expiresAt: Long) {
    if (currentId != null && (seen[currentId] ?: 0) <= System.currentTimeMillis()) currentId = null
    if (currentId != null && mutedId == currentId) return
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("sound", true) || !prefs.getBoolean("alarm", false)) return
    try {
      context.startForegroundService(Intent(context, CourseAlertService::class.java).putExtra("expiresAtMs", expiresAt))
    } catch (error: Exception) {
      Log.w("CourseAlerts", "Unable to start course ringtone", error)
    }
  }

  fun stopSound(context: Context) { context.stopService(Intent(context, CourseAlertService::class.java)) }

  fun dismiss(context: Context, id: String) {
    if (currentId != id) return
    currentId = null
    stopSound(context)
    activity?.finish()
  }
}
