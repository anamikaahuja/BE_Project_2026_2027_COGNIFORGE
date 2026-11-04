package com.cogniforge.ar.ar

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.opengl.GLES20.*
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.cogniforge.ar.R
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import java.util.concurrent.ArrayBlockingQueue
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Real camera-passthrough AR for the COGNIFORGE robot arm, built directly on
 * the ARCore SDK with a small hand-written OpenGL renderer -- the same
 * architecture Pokemon Go and IKEA Place use. This exists because
 * Capacitor's embedded Android WebView cannot run WebXR's immersive-ar
 * session at all: that capability is tied to the Chrome *app* process (or a
 * Trusted Web Activity wrapping it), not a generic `android.webkit.WebView`
 * instance, no matter what permissions or manifest entries are added -- see
 * the WebXR build's ARSession.ts for the (structurally capped) alternative.
 *
 * Flow: point the camera at a flat surface, tap PLACE ROBOT to anchor the
 * UR5 there (real URDF joint geometry, see Ur5Robot.kt), then tap anywhere
 * on that surface to send the tapped point to the backend's /solve_ik and
 * animate the arm reaching there.
 */
class NativeArActivity : Activity(), GLSurfaceView.Renderer {

    private lateinit var glSurfaceView: GLSurfaceView
    private lateinit var statusLog: TextView
    private lateinit var statusLogScroll: android.widget.ScrollView
    private lateinit var settingsPanel: LinearLayout
    private lateinit var hostInput: EditText
    private lateinit var placeButton: Button
    private lateinit var taskSpinner: Spinner
    private lateinit var runTaskButton: Button

    private var session: Session? = null
    private var installRequested = false
    private val backgroundRenderer = BackgroundRenderer()
    private val robot = PhysicalArm5Dof()

    private val viewMatrix = FloatArray(16)
    private val projectionMatrix = FloatArray(16)

    private val tapQueue = ArrayBlockingQueue<MotionEvent>(16)
    @Volatile private var placeRequested = false

    // No longer using Task scenarios (6-DOF IK specific).
    // Sliders are used for direct 5-DOF control.

    private val prefs by lazy { getSharedPreferences("cogniforge_ar", MODE_PRIVATE) }
    private fun backendHost() = prefs.getString("backend_host", "192.168.1.104") ?: "192.168.1.104"

    companion object {
        private const val TAG = "CogniforgeAR"
        private const val CAMERA_PERMISSION_CODE = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_ar)

        glSurfaceView = findViewById(R.id.gl_surface_view)
        statusLog = findViewById(R.id.status_log)
        statusLogScroll = findViewById(R.id.status_log_scroll)
        settingsPanel = findViewById(R.id.settings_panel)
        hostInput = findViewById(R.id.host_input)
        hostInput.setText(backendHost())

        findViewById<Button>(R.id.settings_button).setOnClickListener {
            settingsPanel.visibility = if (settingsPanel.visibility == android.view.View.GONE) android.view.View.VISIBLE else android.view.View.GONE
        }
        findViewById<Button>(R.id.save_host_button).setOnClickListener {
            val host = hostInput.text.toString().trim()
            if (host.isNotEmpty()) {
                prefs.edit().putString("backend_host", host).apply()
                addLog("SYSTEM: Backend host set to $host")
                settingsPanel.visibility = android.view.View.GONE
            }
        }
        placeButton = findViewById(R.id.place_button)
        placeButton.setOnClickListener {
            placeRequested = true
        }

        val j1 = findViewById<SeekBar>(R.id.jog_j1)
        val j2 = findViewById<SeekBar>(R.id.jog_j2)
        val j3 = findViewById<SeekBar>(R.id.jog_j3)
        val j4 = findViewById<SeekBar>(R.id.jog_j4)
        val j5 = findViewById<SeekBar>(R.id.jog_j5)

        var lastJogTime = 0L
        val jogListener = object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                val joints = floatArrayOf(
                    j1.progress.toFloat(),
                    j2.progress.toFloat(),
                    j3.progress.toFloat(),
                    j4.progress.toFloat(),
                    j5.progress.toFloat()
                )
                robot.updateJoints(joints)
                
                val now = System.currentTimeMillis()
                if (now - lastJogTime > 50) { // Throttle HTTP calls
                    lastJogTime = now
                    BackendClient.postJog(backendHost(), joints) { error ->
                        if (error != null) Log.e(TAG, "Jog error: $error")
                    }
                }
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        }

        j1.setOnSeekBarChangeListener(jogListener)
        j2.setOnSeekBarChangeListener(jogListener)
        j3.setOnSeekBarChangeListener(jogListener)
        j4.setOnSeekBarChangeListener(jogListener)
        j5.setOnSeekBarChangeListener(jogListener)

        glSurfaceView.preserveEGLContextOnPause = true
        glSurfaceView.setEGLContextClientVersion(2)
        glSurfaceView.setRenderer(this)
        glSurfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        glSurfaceView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                tapQueue.offer(event)
            }
            true
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
        }

        addLog("SYSTEM: Native ARCore activity started.")
    }

    private fun addLog(msg: String) {
        Log.i(TAG, msg)
        runOnUiThread {
            // Keeps far more history than before (was 6 lines) and inside a
            // ScrollView so a one-time diagnostic near startup (e.g. the
            // first-camera-frame line) is still reachable by scrolling up,
            // instead of being permanently pushed out by later routine
            // messages like repeated AR_PLACE_FAILED retries.
            val lines = (statusLog.text.toString() + "\n" + msg).lines()
            statusLog.text = lines.takeLast(60).joinToString("\n")
            statusLogScroll.post { statusLogScroll.fullScroll(android.view.View.FOCUS_DOWN) }
        }
    }

    // --------------------------------------------------------- Lifecycle --
    override fun onResume() {
        super.onResume()
        if (session == null) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                return // wait for onRequestPermissionsResult to retry
            }
            if (!tryCreateSession()) return
        }
        try {
            session?.resume()
            glSurfaceView.onResume()
        } catch (e: CameraNotAvailableException) {
            addLog("ERROR: Camera not available -- is another app using it?")
            session = null
        }
    }

    private fun tryCreateSession(): Boolean {
        return try {
            when (ArCoreApk.getInstance().requestInstall(this, !installRequested)) {
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    installRequested = true
                    return false
                }
                ArCoreApk.InstallStatus.INSTALLED -> {}
            }
            val newSession = Session(this)
            val config = Config(newSession).apply {
                planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                focusMode = Config.FocusMode.AUTO
            }
            newSession.configure(config)
            session = newSession
            addLog("SYSTEM: ARCore session created.")
            true
        } catch (e: UnavailableArcoreNotInstalledException) {
            addLog("ERROR: Google Play Services for AR is not installed on this device.")
            false
        } catch (e: UnavailableApkTooOldException) {
            addLog("ERROR: Google Play Services for AR needs an update.")
            false
        } catch (e: UnavailableSdkTooOldException) {
            addLog("ERROR: This app needs to be rebuilt against a newer ARCore SDK.")
            false
        } catch (e: UnavailableDeviceNotCompatibleException) {
            addLog("ERROR: This device is not ARCore-certified -- real camera AR cannot run here.")
            false
        } catch (e: Exception) {
            addLog("ERROR: Could not create ARCore session (${e.message}).")
            false
        }
    }

    override fun onPause() {
        super.onPause()
        glSurfaceView.onPause()
        session?.pause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                onResume()
            } else {
                addLog("ERROR: Camera permission denied -- AR cannot work without it.")
            }
        }
    }

    override fun onDestroy() {
        session?.close()
        session = null
        super.onDestroy()
    }

    // --------------------------------------------------------- GL Renderer --
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        glClearColor(0f, 0f, 0f, 1f)
        try {
            backgroundRenderer.createOnGlThread()
        } catch (e: Exception) {
            addLog("ERROR: Camera background renderer failed to initialize -- ${e.message}")
        }
        robot.loadAll(
            glSurfaceView,
            onLoaded = { addLog("SYSTEM: Robot geometry ready.") },
            onError = { msg -> addLog("ERROR: Robot geometry failed to build -- $msg") },
        )
        addLog("SYSTEM: Point your phone at a flat surface, then tap PLACE ROBOT.")
    }

    private var surfaceWidth = 0
    private var surfaceHeight = 0
    private var displayGeometryConfigured = false
    private var lastTrackingState: TrackingState? = null
    private var loggedFirstFrameDiagnostics = false

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        glViewport(0, 0, width, height)
        surfaceWidth = width
        surfaceHeight = height
        displayGeometryConfigured = session?.let {
            it.setDisplayGeometry(display?.rotation ?: 0, width, height)
            true
        } ?: false
    }

    override fun onDrawFrame(gl: GL10?) {
        glClear(GL_COLOR_BUFFER_BIT or GL_DEPTH_BUFFER_BIT)
        val activeSession = session ?: return

        try {
            // onSurfaceChanged can fire before the ARCore session exists
            // (GLSurfaceView's GL thread and the Activity's onResume race
            // each other), which would otherwise leave ARCore's idea of the
            // display size/rotation never configured -- with no error, just
            // wrong hit-test/camera-image geometry. Retry here once the
            // session actually exists.
            if (!displayGeometryConfigured && surfaceWidth > 0 && surfaceHeight > 0) {
                activeSession.setDisplayGeometry(display?.rotation ?: 0, surfaceWidth, surfaceHeight)
                displayGeometryConfigured = true
            }

            activeSession.setCameraTextureName(backgroundRenderer.textureId)

            val frame: Frame = try {
                activeSession.update()
            } catch (e: CameraNotAvailableException) {
                return
            }

            backgroundRenderer.draw(frame)

            if (!loggedFirstFrameDiagnostics && frame.timestamp != 0L) {
                loggedFirstFrameDiagnostics = true
                val glError = glGetError()
                addLog("SYSTEM: First camera frame -- timestamp=${frame.timestamp}, glError=$glError, textureId=${backgroundRenderer.textureId}")
            }

            val camera = frame.camera
            if (camera.trackingState != lastTrackingState) {
                lastTrackingState = camera.trackingState
                addLog("SYSTEM: Camera tracking state = ${camera.trackingState}")
            }
            if (camera.trackingState != TrackingState.TRACKING) return

            camera.getViewMatrix(viewMatrix, 0)
            camera.getProjectionMatrix(projectionMatrix, 0, 0.01f, 20f)

            handlePlacementRequest(frame)
            // Tap-to-reach IK and Task animations removed for 5-DOF slider mode.

            robot.draw(viewMatrix, projectionMatrix)
        } catch (e: Exception) {
            // A silent exception here would otherwise just look like a
            // frozen or wrong frame with no clue why -- surface it.
            addLog("ERROR: render frame failed -- ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    // --------------------------------------------------------- Interaction --
    private var consecutivePlaceFailures = 0

    private fun handlePlacementRequest(frame: Frame) {
        if (!placeRequested) return
        placeRequested = false
        val cx = glSurfaceView.width / 2f
        val cy = glSurfaceView.height / 2f
        val hit = firstValidHit(frame, cx, cy)
        if (hit != null) {
            consecutivePlaceFailures = 0
            // createAnchor(), not a one-time hitPose snapshot: an Anchor is
            // actively kept pinned to this physical point by ARCore as
            // tracking refines, which is the actual fix for the base
            // visibly drifting off the real surface over time.
            robot.place(hit.createAnchor())
            addLog("AR_PLACED: Workspace placed. Tap the surface to move the arm there.")
            // Without this the button never reflected placement state, so
            // there was no visual confirmation placement worked, and no hint
            // that tapping it again *moves* the base rather than doing
            // nothing or erroring.
            runOnUiThread { placeButton.text = "REPLACE ROBOT" }
        } else {
            consecutivePlaceFailures++
            // ARCore builds up plane detection from parallax between
            // frames -- holding the phone still, even pointed straight at a
            // real floor, never accumulates enough motion to find one. This
            // only shows up after repeated failures so it doesn't spam the
            // very first attempt.
            val hint = if (consecutivePlaceFailures >= 2) " Slowly move the phone side to side to help it map the surface." else ""
            addLog("AR_PLACE_FAILED: No surface detected under the crosshair.$hint")
        }
    }

    // IK and Task logic removed for 5-DOF slider mode.

    private fun firstValidHit(frame: Frame, x: Float, y: Float): com.google.ar.core.HitResult? {
        return frame.hitTest(x, y).firstOrNull { hit ->
            when (val trackable = hit.trackable) {
                is Plane -> trackable.isPoseInPolygon(hit.hitPose) && trackable.trackingState == TrackingState.TRACKING
                is Point -> trackable.trackingState == TrackingState.TRACKING
                else -> false
            }
        }
    }
}
