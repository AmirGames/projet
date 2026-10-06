package expo.modules.coursealerts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/** Alarm audio respects the user's alarm volume and Do Not Disturb configuration. */
class CourseAlertService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val expire = Runnable { stopSelf() }
  private var player: MediaPlayer? = null
  private var focus: AudioFocusRequest? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val expiry = intent?.getLongExtra("expiresAtMs", 0) ?: 0
    if (expiry <= System.currentTimeMillis()) { stopSelf(); return START_NOT_STICKY }
    val notifications = getSystemService(NotificationManager::class.java)
    notifications.createNotificationChannel(NotificationChannel("course-alert-playing", "Sonnerie de course en cours", NotificationManager.IMPORTANCE_LOW)
      .apply { setSound(null, null) })
    val stop = PendingIntent.getBroadcast(this, 0, Intent(this, StopCourseAlertReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    startForeground(7284, Notification.Builder(this, "course-alert-playing")
      .setSmallIcon(icon).setContentTitle("Nouvelle course")
      .setContentText("Une proposition attend votre réponse.").setOngoing(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(null, "Couper la sonnerie", stop).build()).build())
    handler.removeCallbacks(expire)
    handler.postDelayed(expire, minOf(expiry - System.currentTimeMillis(), 120000).coerceAtLeast(1))
    if (player == null) {
      try {
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val audio = getSystemService(AudioManager::class.java)
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ change ->
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stopSelf()
          }, handler).build()
        focus = request
        if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
          stopSelf(); return START_NOT_STICKY
        }
        resources.openRawResourceFd(R.raw.course_alert).use {
          player = MediaPlayer().apply {
            setAudioAttributes(attributes)
            setDataSource(it.fileDescriptor, it.startOffset, it.length)
            isLooping = true
            setWakeMode(applicationContext, android.os.PowerManager.PARTIAL_WAKE_LOCK)
            prepare()
            start()
          }
        }
      } catch (error: Exception) {
        Log.w("CourseAlerts", "Unable to play ringtone", error)
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(expire)
    player?.release(); player = null
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}

class StopCourseAlertReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { CourseAlertController.mute(context) }
}
