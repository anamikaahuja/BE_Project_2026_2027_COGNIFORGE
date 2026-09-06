package com.cogniforge.ar.ar

/**
 * Shared vertex-buffer container: (position, normal, color) interleaved,
 * 9 floats per vertex. Originally produced by parsing the UR5's CAD-derived
 * .obj/.mtl files (assimp-exported from the original COLLADA meshes); that
 * parser was removed once the robot was rebuilt from procedurally-generated
 * primitives (see PrimitiveGeometry.kt) instead, since the on-device visual
 * disconnection bug traced back to those meshes' authoring, not to anything
 * a parser fix could address. This type is kept because MeshRenderer and
 * PrimitiveGeometry both still speak it.
 */
object ObjLoader {
    class MeshData(val vertexData: FloatArray, val vertexCount: Int)
}
