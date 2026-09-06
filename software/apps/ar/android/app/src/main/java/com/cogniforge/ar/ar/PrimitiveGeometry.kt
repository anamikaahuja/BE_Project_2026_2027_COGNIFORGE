package com.cogniforge.ar.ar

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.PI

/**
 * Procedurally generates simple cylinder/sphere meshes in the same
 * interleaved (position, normal, color) vertex format ObjLoader/MeshRenderer
 * already use, so the robot can be assembled from geometry this code
 * constructs and fully controls -- no external mesh file to author
 * correctly, parse correctly, or debug blind on a device with no attached
 * tooling. Each shape is a "unit" primitive (radius 1, and for the cylinder,
 * spanning local Y from 0 to 1); callers scale/rotate/translate it into
 * place per joint via a model matrix, exactly like MeshRenderer already
 * expects.
 */
object PrimitiveGeometry {

    /** Unit cylinder: radius 1, spanning local Y in [0, 1], capped at both ends. */
    fun unitCylinder(color: FloatArray, segments: Int = 20): ObjLoader.MeshData {
        val verts = ArrayList<Float>()

        fun addTri(p0: FloatArray, p1: FloatArray, p2: FloatArray, n: FloatArray) {
            for (p in listOf(p0, p1, p2)) {
                verts.add(p[0]); verts.add(p[1]); verts.add(p[2])
                verts.add(n[0]); verts.add(n[1]); verts.add(n[2])
                verts.add(color[0]); verts.add(color[1]); verts.add(color[2])
            }
        }

        for (i in 0 until segments) {
            val a0 = 2.0 * PI * i / segments
            val a1 = 2.0 * PI * (i + 1) / segments
            val x0 = cos(a0).toFloat(); val z0 = sin(a0).toFloat()
            val x1 = cos(a1).toFloat(); val z1 = sin(a1).toFloat()

            val nBottom = floatArrayOf(0f, -1f, 0f)
            val nTop = floatArrayOf(0f, 1f, 0f)
            val center0 = floatArrayOf(0f, 0f, 0f)
            val center1 = floatArrayOf(0f, 1f, 0f)

            // Side wall (two triangles), normal points radially outward.
            val nSide0 = floatArrayOf(x0, 0f, z0)
            val nSide1 = floatArrayOf(x1, 0f, z1)
            addTri(floatArrayOf(x0, 0f, z0), floatArrayOf(x1, 0f, z1), floatArrayOf(x1, 1f, z1), nSide0)
            addTri(floatArrayOf(x0, 0f, z0), floatArrayOf(x1, 1f, z1), floatArrayOf(x0, 1f, z0), nSide1)

            // End caps.
            addTri(center0, floatArrayOf(x1, 0f, z1), floatArrayOf(x0, 0f, z0), nBottom)
            addTri(center1, floatArrayOf(x0, 1f, z0), floatArrayOf(x1, 1f, z1), nTop)
        }

        val data = verts.toFloatArray()
        return ObjLoader.MeshData(data, data.size / 9)
    }

    /** Unit sphere: radius 1, centered at the local origin. */
    fun unitSphere(color: FloatArray, latSegments: Int = 12, lonSegments: Int = 16): ObjLoader.MeshData {
        val verts = ArrayList<Float>()

        fun vertexAt(lat: Double, lon: Double): FloatArray {
            val y = sin(lat).toFloat()
            val r = cos(lat)
            val x = (r * cos(lon)).toFloat()
            val z = (r * sin(lon)).toFloat()
            return floatArrayOf(x, y, z)
        }

        fun addTri(p0: FloatArray, p1: FloatArray, p2: FloatArray) {
            // Sphere normals equal their (unit-radius) positions.
            for ((p, n) in listOf(p0 to p0, p1 to p1, p2 to p2)) {
                verts.add(p[0]); verts.add(p[1]); verts.add(p[2])
                verts.add(n[0]); verts.add(n[1]); verts.add(n[2])
                verts.add(color[0]); verts.add(color[1]); verts.add(color[2])
            }
        }

        for (i in 0 until latSegments) {
            val lat0 = PI * (-0.5 + i.toDouble() / latSegments)
            val lat1 = PI * (-0.5 + (i + 1).toDouble() / latSegments)
            for (j in 0 until lonSegments) {
                val lon0 = 2.0 * PI * j / lonSegments
                val lon1 = 2.0 * PI * (j + 1) / lonSegments

                val p00 = vertexAt(lat0, lon0)
                val p01 = vertexAt(lat0, lon1)
                val p10 = vertexAt(lat1, lon0)
                val p11 = vertexAt(lat1, lon1)

                addTri(p00, p11, p01)
                addTri(p00, p10, p11)
            }
        }

        val data = verts.toFloatArray()
        return ObjLoader.MeshData(data, data.size / 9)
    }
}
