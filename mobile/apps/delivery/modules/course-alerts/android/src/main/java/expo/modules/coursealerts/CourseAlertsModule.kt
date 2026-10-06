package expo.modules.coursealerts

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.common.LifecycleState
import com.facebook.react.bridge.ReactContext
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import org.json.JSONArray

class CourseAlertsModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("CourseAlerts")

    Function("getStatus") {
      val audio = context.getSystemService(AudioManager::class.java)
      val notifications = context.getSystemService(NotificationManager::class.java)
      mapOf("overlayGranted" to Settings.canDrawOverlays(context),
        "alarmVolume" to audio.getStreamVolume(AudioManager.STREAM_ALARM),
        "alarmVolumeMax" to audio.getStreamMaxVolume(AudioManager.STREAM_ALARM),
        "doNotDisturb" to (notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL))
    }
    AsyncFunction("configure") { active: Boolean, popup: Boolean, alarm: Boolean, sound: Boolean ->
      CourseAlertController.configure(context, active, popup, alarm, sound)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openOverlaySettings") {
      context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("openSoundSettings") {
      context.startActivity(Intent(Settings.ACTION_SOUND_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("presentOffer") { json: String ->
      val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
      if ((appContext.reactContext as? ReactContext)?.lifecycleState != LifecycleState.RESUMED || locked) {
        CourseAlertController.present(context, JSONObject(json))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("dismissOffer") { offerId: String -> CourseAlertController.dismiss(context, offerId) }.runOnQueue(Queues.MAIN)
    AsyncFunction("silence") { CourseAlertController.stopSound(context) }.runOnQueue(Queues.MAIN)
    AsyncFunction("ring") { CourseAlertController.ring(context, System.currentTimeMillis() + 3000) }.runOnQueue(Queues.MAIN)
    AsyncFunction("testInFiveSeconds") {
      val app = context.applicationContext
      Handler(Looper.getMainLooper()).postDelayed({
        // A demo never invokes a server action and also works while offline.
        CourseAlertController.present(app, JSONObject()
          .put("id", "demo-${System.currentTimeMillis()}").put("demo", true)
          .put("createdAtMs", System.currentTimeMillis()).put("expiresAtMs", System.currentTimeMillis() + 15000)
          .put("pickupStore", "Commerce de démonstration").put("pickupCity", "Paris")
          .put("deliveryCity", "Paris").put("payout", 6.50).put("count", 1).put("totalKm", 3.2)
          .put("pickups", JSONArray().put(JSONObject().put("name", "Commerce de démonstration")
            .put("address", "Place de la République, Paris").put("point", JSONObject().put("lat", 48.8675).put("lng", 2.3639))))
          .put("dropoffs", JSONArray().put(JSONObject().put("address", "Quartier Bastille, Paris")
            .put("point", JSONObject().put("lat", 48.8530).put("lng", 2.3690)))))
      }, 5000)
    }.runOnQueue(Queues.MAIN)
  }
}
