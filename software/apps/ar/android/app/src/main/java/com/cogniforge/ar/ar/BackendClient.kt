package com.cogniforge.ar.ar

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** One of the five task scenarios (Table 3's benchmark tasks) GET /tasks
 * serves -- the same list app.robotics.tasks.TASKS defines, so this app
 * plays the identical scenarios the paper's numbers were measured against. */
data class TaskDef(
    val name: String,
    val label: String,
    val description: String,
    val waypoints: List<FloatArray>, // each entry is [x, y, z]
)

/**
 * Talks to the same FastAPI backend the WebXR builds use (POST /solve_ik,
 * GET /tasks). Plain HttpURLConnection + org.json on background threads
 * rather than pulling in OkHttp/Retrofit/coroutines -- this app makes only
 * a couple of simple request shapes, so a dependency-free client keeps the
 * native AR rewrite's footprint small.
 */
object BackendClient {
    private val mainHandler = Handler(Looper.getMainLooper())

    /** [onResult] receives (joints, errorDetail) -- exactly one is non-null. */
    fun solveIk(host: String, x: Float, y: Float, z: Float, onResult: (FloatArray?, String?) -> Unit) {
        Thread {
            var joints: FloatArray? = null
            var error: String? = null
            try {
                val url = URL("http://$host:8000/solve_ik")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 5000
                    readTimeout = 5000
                }
                val body = JSONObject().put("x", x).put("y", y).put("z", z).toString()
                conn.outputStream.use { it.write(body.toByteArray()) }

                if (conn.responseCode == 200) {
                    val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                    val jointsJson = JSONObject(responseText).getJSONArray("joints")
                    joints = FloatArray(jointsJson.length()) { i -> jointsJson.getDouble(i).toFloat() }
                } else {
                    error = "HTTP ${conn.responseCode}"
                }
            } catch (e: Exception) {
                // The generic catch-all previously swallowed this into a
                // plain null, which is why every failure just said "check
                // backend host" with no way to tell a wrong IP apart from
                // the phone being on a different network entirely, a
                // timeout, or something else -- the exception class name is
                // usually enough on its own (ConnectException = nothing
                // listening/unreachable, SocketTimeoutException = no route,
                // UnknownHostException = bad hostname).
                error = "${e.javaClass.simpleName}: ${e.message}"
            }
            mainHandler.post { onResult(joints, error) }
        }.start()
    }

    /** [onResult] receives (tasks, errorDetail) -- exactly one is non-null. */
    fun getTasks(host: String, onResult: (List<TaskDef>?, String?) -> Unit) {
        Thread {
            var tasks: List<TaskDef>? = null
            var error: String? = null
            try {
                val url = URL("http://$host:8000/tasks")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 5000
                    readTimeout = 5000
                }
                if (conn.responseCode == 200) {
                    val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                    val tasksJson = JSONObject(responseText).getJSONArray("tasks")
                    tasks = (0 until tasksJson.length()).map { i ->
                        val t = tasksJson.getJSONObject(i)
                        val waypointsJson = t.getJSONArray("waypoints")
                        val waypoints = (0 until waypointsJson.length()).map { w ->
                            val wp = waypointsJson.getJSONObject(w)
                            floatArrayOf(
                                wp.getDouble("x").toFloat(),
                                wp.getDouble("y").toFloat(),
                                wp.getDouble("z").toFloat(),
                            )
                        }
                        TaskDef(t.getString("name"), t.getString("label"), t.getString("description"), waypoints)
                    }
                } else {
                    error = "HTTP ${conn.responseCode}"
                }
            } catch (e: Exception) {
                error = "${e.javaClass.simpleName}: ${e.message}"
            }
            mainHandler.post { onResult(tasks, error) }
        }.start()
    }
}
