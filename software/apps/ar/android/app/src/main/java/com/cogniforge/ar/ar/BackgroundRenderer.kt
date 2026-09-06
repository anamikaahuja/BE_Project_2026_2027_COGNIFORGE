package com.cogniforge.ar.ar

import android.opengl.GLES11Ext
import android.opengl.GLES20.*
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Draws the ARCore camera feed as a fullscreen background quad each frame --
 * this is the actual "camera passthrough" (the thing a WebView-hosted WebXR
 * page here structurally cannot produce, see NativeArActivity's class doc).
 * Pattern matches Google's own ARCore "HelloAR" sample, which has been
 * stable across SDK versions: an external OES texture fed by
 * `session.setCameraTextureName`, and a fullscreen quad whose texture
 * coordinates get remapped every frame via `frame.transformCoordinates2d` to
 * account for device rotation/aspect.
 */
class BackgroundRenderer {
    var textureId = -1
        private set

    private var program = 0
    private var aPosition = 0
    private var aTexCoord = 0

    private val quadCoords: FloatBuffer = ByteBuffer.allocateDirect(4 * 2 * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
            put(floatArrayOf(-1f, -1f, +1f, -1f, -1f, +1f, +1f, +1f))
            position(0)
        }

    private val quadTexCoords: FloatBuffer = ByteBuffer.allocateDirect(4 * 2 * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer()

    companion object {
        private const val VERTEX_SHADER = """
            attribute vec2 a_Position;
            attribute vec2 a_TexCoord;
            varying vec2 v_TexCoord;
            void main() {
                gl_Position = vec4(a_Position, 0.0, 1.0);
                v_TexCoord = a_TexCoord;
            }
        """

        private const val FRAGMENT_SHADER = """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;
            varying vec2 v_TexCoord;
            uniform samplerExternalOES u_Texture;
            void main() {
                gl_FragColor = texture2D(u_Texture, v_TexCoord);
            }
        """
    }

    /** Call once from the GL thread, before the first frame. */
    fun createOnGlThread() {
        val textures = IntArray(1)
        glGenTextures(1, textures, 0)
        textureId = textures[0]
        glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)

        val vs = compileShader(GL_VERTEX_SHADER, VERTEX_SHADER)
        val fs = compileShader(GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
        program = glCreateProgram().also {
            glAttachShader(it, vs)
            glAttachShader(it, fs)
            glLinkProgram(it)
        }
        // Compiling each shader individually can succeed while linking the
        // program still silently fails (interface mismatch, a driver
        // rejecting the GL_OES_EGL_image_external combination, etc) -- with
        // no exception and no visible error, just a program that never
        // actually draws anything. Checking only compile status (as before)
        // missed exactly this failure mode.
        val linkStatus = IntArray(1)
        glGetProgramiv(program, GL_LINK_STATUS, linkStatus, 0)
        if (linkStatus[0] == 0) {
            val log = glGetProgramInfoLog(program)
            throw RuntimeException("BackgroundRenderer program link failed: $log")
        }
        aPosition = glGetAttribLocation(program, "a_Position")
        aTexCoord = glGetAttribLocation(program, "a_TexCoord")
    }

    /** Call every frame before drawing 3D content, once a Frame is available. */
    fun draw(frame: Frame) {
        if (frame.hasDisplayGeometryChanged()) {
            frame.transformCoordinates2d(
                Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, quadCoords,
                Coordinates2d.TEXTURE_NORMALIZED, quadTexCoords,
            )
        }
        if (frame.timestamp == 0L) return // camera not ready yet this session

        glDisable(GL_DEPTH_TEST)
        glDepthMask(false)

        glUseProgram(program)
        glActiveTexture(GL_TEXTURE0)
        glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        glUniform1i(glGetUniformLocation(program, "u_Texture"), 0)

        glEnableVertexAttribArray(aPosition)
        quadCoords.position(0)
        glVertexAttribPointer(aPosition, 2, GL_FLOAT, false, 0, quadCoords)

        glEnableVertexAttribArray(aTexCoord)
        quadTexCoords.position(0)
        glVertexAttribPointer(aTexCoord, 2, GL_FLOAT, false, 0, quadTexCoords)

        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)

        glDisableVertexAttribArray(aPosition)
        glDisableVertexAttribArray(aTexCoord)

        glDepthMask(true)
        glEnable(GL_DEPTH_TEST)
    }

    private fun compileShader(type: Int, source: String): Int {
        val shader = glCreateShader(type)
        glShaderSource(shader, source)
        glCompileShader(shader)
        val status = IntArray(1)
        glGetShaderiv(shader, GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            val log = glGetShaderInfoLog(shader)
            glDeleteShader(shader)
            throw RuntimeException("BackgroundRenderer shader compile failed: $log")
        }
        return shader
    }
}
