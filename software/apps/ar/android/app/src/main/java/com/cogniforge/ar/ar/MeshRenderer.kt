package com.cogniforge.ar.ar

import android.opengl.GLES20.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Uploads one parsed [ObjLoader.MeshData] into a GL vertex buffer and draws
 * it with a simple ambient + single-directional-light shader (Lambertian
 * diffuse, no textures -- the UR5 link meshes use flat material colors).
 * One instance per robot link; [draw] is called once per link per frame
 * with that link's current model-view-projection and model matrices.
 */
class MeshRenderer {
    private var vbo = 0
    private var vertexCount = 0

    companion object {
        private const val STRIDE = 9 * 4 // 9 floats per vertex, 4 bytes each

        private const val VERTEX_SHADER = """
            uniform mat4 u_MVP;
            uniform mat4 u_Model;
            attribute vec3 a_Position;
            attribute vec3 a_Normal;
            attribute vec3 a_Color;
            varying vec3 v_Normal;
            varying vec3 v_Color;
            void main() {
                gl_Position = u_MVP * vec4(a_Position, 1.0);
                v_Normal = mat3(u_Model) * a_Normal;
                v_Color = a_Color;
            }
        """

        private const val FRAGMENT_SHADER = """
            precision mediump float;
            varying vec3 v_Normal;
            varying vec3 v_Color;
            void main() {
                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
                float diffuse = max(dot(normalize(v_Normal), lightDir), 0.0);
                float lighting = 0.45 + 0.55 * diffuse;
                gl_FragColor = vec4(v_Color * lighting, 1.0);
            }
        """

        private var program = 0
        private var aPosition = 0
        private var aNormal = 0
        private var aColor = 0
        private var uMVP = 0
        private var uModel = 0
        private var initialized = false

        /** Compiles the shared shader program once; call from the GL thread. */
        fun ensureProgram() {
            if (initialized) return
            val vs = compileShader(GL_VERTEX_SHADER, VERTEX_SHADER)
            val fs = compileShader(GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
            program = glCreateProgram().also {
                glAttachShader(it, vs)
                glAttachShader(it, fs)
                glLinkProgram(it)
            }
            val linkStatus = IntArray(1)
            glGetProgramiv(program, GL_LINK_STATUS, linkStatus, 0)
            if (linkStatus[0] == 0) {
                val log = glGetProgramInfoLog(program)
                throw RuntimeException("MeshRenderer program link failed: $log")
            }
            aPosition = glGetAttribLocation(program, "a_Position")
            aNormal = glGetAttribLocation(program, "a_Normal")
            aColor = glGetAttribLocation(program, "a_Color")
            uMVP = glGetUniformLocation(program, "u_MVP")
            uModel = glGetUniformLocation(program, "u_Model")
            initialized = true
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
                throw RuntimeException("Shader compile failed: $log")
            }
            return shader
        }
    }

    /**
     * Uploads an already-parsed mesh to a GL buffer. Must be called from the
     * GL thread -- unlike parsing (which is pure CPU work safe on any
     * thread), buffer creation needs the GL context current on this thread.
     */
    fun uploadToGl(mesh: ObjLoader.MeshData) {
        ensureProgram()
        vertexCount = mesh.vertexCount

        val buffer = ByteBuffer.allocateDirect(mesh.vertexData.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer()
        buffer.put(mesh.vertexData).position(0)

        val handle = IntArray(1)
        glGenBuffers(1, handle, 0)
        vbo = handle[0]
        glBindBuffer(GL_ARRAY_BUFFER, vbo)
        glBufferData(GL_ARRAY_BUFFER, buffer.capacity() * 4, buffer, GL_STATIC_DRAW)
        glBindBuffer(GL_ARRAY_BUFFER, 0)
    }

    fun draw(mvpMatrix: FloatArray, modelMatrix: FloatArray) {
        if (vbo == 0 || vertexCount == 0) return
        glUseProgram(program)
        glBindBuffer(GL_ARRAY_BUFFER, vbo)

        glEnableVertexAttribArray(aPosition)
        glVertexAttribPointer(aPosition, 3, GL_FLOAT, false, STRIDE, 0)
        glEnableVertexAttribArray(aNormal)
        glVertexAttribPointer(aNormal, 3, GL_FLOAT, false, STRIDE, 3 * 4)
        glEnableVertexAttribArray(aColor)
        glVertexAttribPointer(aColor, 3, GL_FLOAT, false, STRIDE, 6 * 4)

        glUniformMatrix4fv(uMVP, 1, false, mvpMatrix, 0)
        glUniformMatrix4fv(uModel, 1, false, modelMatrix, 0)

        glDrawArrays(GL_TRIANGLES, 0, vertexCount)

        glDisableVertexAttribArray(aPosition)
        glDisableVertexAttribArray(aNormal)
        glDisableVertexAttribArray(aColor)
        glBindBuffer(GL_ARRAY_BUFFER, 0)
    }
}
