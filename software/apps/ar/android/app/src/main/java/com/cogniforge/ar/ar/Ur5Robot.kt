package com.cogniforge.ar.ar

import android.content.res.AssetManager
import android.opengl.Matrix
import com.google.ar.core.Anchor
import com.google.ar.core.TrackingState
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.sqrt

/**
 * UR5 joint rig using procedurally-generated cylinder/sphere geometry rather
 * than the original CAD (COLLADA -> OBJ) meshes. This code constructs and
 * fully controls every vertex, so there's no external mesh file whose
 * authoring/parsing could be silently wrong -- after several rounds of the
 * OBJ-based version rendering as visually disconnected pieces on-device
 * (with no way to attach a debugger to find out why), building the arm from
 * primitives this code generates itself is the reliable path: every joint's
 * housing sphere and connecting cylinder is placed using the exact same
 * transform chain math already verified numerically correct (see the
 * chain's derivation from RealRobot.ts's DH-style origin/rpy convention).
 */
class Ur5Robot {

    private data class JointSpec(
        val origin: FloatArray,
        val rpy: FloatArray,
    )

    private val joints = listOf(
        JointSpec(floatArrayOf(0f, 0f, 0.089159f), floatArrayOf(0f, 0f, 0f)),
        JointSpec(floatArrayOf(0f, 0f, 0f), floatArrayOf((PI / 2).toFloat(), 0f, 0f)),
        JointSpec(floatArrayOf(-0.425f, 0f, 0f), floatArrayOf(0f, 0f, 0f)),
        JointSpec(floatArrayOf(-0.39225f, 0f, 0.10915f), floatArrayOf(0f, 0f, 0f)),
        JointSpec(floatArrayOf(0f, -0.09465f, 0f), floatArrayOf((PI / 2).toFloat(), 0f, 0f)),
        JointSpec(floatArrayOf(0f, 0.0823f, 0f), floatArrayOf((PI / 2).toFloat(), PI.toFloat(), PI.toFloat())),
    )

    // Real UR5 proportions: joint housings noticeably bulkier than the link
    // rods connecting them, matching how an actual UR5 looks.
    private val linkRadius = 0.035f
    private val jointRadius = 0.05f
    private val baseRadius = 0.07f
    private val baseHeight = 0.04f

    private val linkColor = floatArrayOf(0.75f, 0.75f, 0.75f)
    private val jointColor = floatArrayOf(0.12f, 0.12f, 0.12f)

    private val cylinderRenderer = MeshRenderer()
    private val sphereRenderer = MeshRenderer()

    @Volatile private var jointAngles = floatArrayOf(0f, -1.0f, 1.3f, -1.5f, -1.57f, 0f)

    // A raw Pose captured once (a plain FloatArray snapshot) never gets
    // corrected as ARCore refines its map of the room -- it just sits at
    // the coordinates it had the instant it was captured, so the placed
    // robot visibly drifts away from the real surface as you move around.
    // A real ARCore Anchor is different: ARCore actively updates its pose
    // every frame to keep it pinned to the same physical point.
    @Volatile private var anchor: Anchor? = null
    @Volatile var isPlaced = false
        private set
    @Volatile var isLoaded = false
        private set

    // URDF is Z-up; the rest of the scene (anchor pose from ARCore, meters)
    // is already in the AR session's own right-handed Y-up-ish world space,
    // so this single root rotation is the one place the two conventions get
    // reconciled -- mirrors `this.rig.rotation.x = -Math.PI/2` in RealRobot.ts.
    private val rigRotation = FloatArray(16).also { Matrix.setRotateM(it, 0, -90f, 1f, 0f, 0f) }

    /** Generates and uploads the two shared primitive meshes. Cheap enough to run directly on the GL thread. */
    fun load(glSurfaceView: android.opengl.GLSurfaceView, onLoaded: () -> Unit, onError: (String) -> Unit) {
        glSurfaceView.queueEvent {
            try {
                cylinderRenderer.uploadToGl(PrimitiveGeometry.unitCylinder(linkColor))
                sphereRenderer.uploadToGl(PrimitiveGeometry.unitSphere(jointColor))
                isLoaded = true
                onLoaded()
            } catch (e: Exception) {
                onError("Primitive geometry upload failed: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    fun place(newAnchor: Anchor) {
        anchor?.detach() // release the previous anchor's ARCore-side tracking resources
        anchor = newAnchor
        isPlaced = true
    }

    fun updateJoints(angles: FloatArray) {
        if (angles.size >= 6) jointAngles = angles.copyOf(6)
    }

    fun getJoints(): FloatArray = jointAngles.copyOf()

    /**
     * World-space position of the robot's own local origin (anchor * rig
     * rotation), for reach-target coordinate conversion. Reads the anchor's
     * CURRENT pose fresh every call (not a cached snapshot from placement
     * time), so the robot stays visually pinned to the real surface as
     * ARCore's tracking updates.
     */
    fun getBaseWorldMatrix(): FloatArray {
        val world = FloatArray(16)
        val currentAnchor = anchor
        val anchorPose = FloatArray(16)
        if (currentAnchor != null && currentAnchor.trackingState == TrackingState.TRACKING) {
            currentAnchor.pose.toMatrix(anchorPose, 0)
        } else {
            Matrix.setIdentityM(anchorPose, 0)
        }
        Matrix.multiplyMM(world, 0, anchorPose, 0, rigRotation, 0)
        return world
    }

    /**
     * Converts a tapped world-space point into the robot's own local frame,
     * the same transform Engine.ts's handleArReach does via
     * `this.robot.getObject().worldToLocal(...)` before asking the backend
     * to solve IK -- keeps tap-to-reach targets consistent with the WebXR
     * build's coordinate convention.
     */
    fun worldToLocal(worldX: Float, worldY: Float, worldZ: Float): FloatArray {
        val inverse = FloatArray(16)
        Matrix.invertM(inverse, 0, getBaseWorldMatrix(), 0)
        val worldVec = floatArrayOf(worldX, worldY, worldZ, 1f)
        val localVec = FloatArray(4)
        Matrix.multiplyMV(localVec, 0, inverse, 0, worldVec, 0)
        return floatArrayOf(localVec[0], localVec[1], localVec[2])
    }

    fun draw(viewMatrix: FloatArray, projectionMatrix: FloatArray) {
        if (!isPlaced || !isLoaded) return

        val viewProjection = FloatArray(16)
        Matrix.multiplyMM(viewProjection, 0, projectionMatrix, 0, viewMatrix, 0)

        val baseModel = getBaseWorldMatrix()
        drawShape(sphereRenderer, scaleMatrix(baseModel, baseRadius, baseHeight, baseRadius), viewProjection)

        var parentFrame = baseModel // the frame the NEXT joint's origin/rpy is expressed in

        for (i in joints.indices) {
            val spec = joints[i]

            // Connecting rod: from this frame's own origin (0,0,0) out to
            // where the joint's origin places it -- drawn BEFORE advancing
            // to the joint's own frame, since `spec.origin` is defined
            // relative to the parent frame, exactly like the translation
            // step in the original joint-chain derivation.
            drawShape(
                cylinderRenderer,
                cylinderBetween(parentFrame, floatArrayOf(0f, 0f, 0f), spec.origin, linkRadius),
                viewProjection,
            )

            val originMatrix = FloatArray(16)
            Matrix.setIdentityM(originMatrix, 0)
            Matrix.translateM(originMatrix, 0, spec.origin[0], spec.origin[1], spec.origin[2])
            val originRotated = FloatArray(16)
            Matrix.multiplyMM(originRotated, 0, originMatrix, 0, applyEulerXYZ(spec.rpy), 0)

            val jointPivotWorld = FloatArray(16)
            Matrix.multiplyMM(jointPivotWorld, 0, parentFrame, 0, originRotated, 0)

            drawShape(sphereRenderer, scaleMatrix(jointPivotWorld, jointRadius, jointRadius, jointRadius), viewProjection)

            val jointRotation = FloatArray(16)
            Matrix.setRotateM(jointRotation, 0, Math.toDegrees(jointAngles[i].toDouble()).toFloat(), 0f, 0f, 1f)

            val nextFrame = FloatArray(16)
            Matrix.multiplyMM(nextFrame, 0, jointPivotWorld, 0, jointRotation, 0)
            parentFrame = nextFrame
        }
    }

    private fun drawShape(renderer: MeshRenderer, model: FloatArray, viewProjection: FloatArray) {
        val mvp = FloatArray(16)
        Matrix.multiplyMM(mvp, 0, viewProjection, 0, model, 0)
        renderer.draw(mvp, model)
    }

    private fun scaleMatrix(parent: FloatArray, sx: Float, sy: Float, sz: Float): FloatArray {
        val scale = FloatArray(16)
        Matrix.setIdentityM(scale, 0)
        Matrix.scaleM(scale, 0, sx, sy, sz)
        val result = FloatArray(16)
        Matrix.multiplyMM(result, 0, parent, 0, scale, 0)
        return result
    }

    /**
     * Model matrix (relative to [parent]) for a unit cylinder (spans local Y
     * in [0,1], radius 1) so it instead spans from local point [from] to
     * local point [to] with the given radius.
     */
    private fun cylinderBetween(parent: FloatArray, from: FloatArray, to: FloatArray, radius: Float): FloatArray {
        val dx = to[0] - from[0]
        val dy = to[1] - from[1]
        val dz = to[2] - from[2]
        val length = sqrt(dx * dx + dy * dy + dz * dz)

        val translate = FloatArray(16)
        Matrix.setIdentityM(translate, 0)
        Matrix.translateM(translate, 0, from[0], from[1], from[2])

        val rotate = FloatArray(16)
        if (length < 1e-6f) {
            Matrix.setIdentityM(rotate, 0)
        } else {
            val ndx = dx / length; val ndy = dy / length; val ndz = dz / length
            // Rotation that maps the cylinder's own local +Y axis onto the
            // normalized (from -> to) direction, via the standard
            // axis = up x direction, angle = acos(up . direction) construction.
            val axisX = 1f * ndz - 0f * ndy // cross((0,1,0), (ndx,ndy,ndz))
            val axisY = 0f * ndx - 0f * ndz
            val axisZ = 0f * ndy - 1f * ndx
            val axisLen = sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ)
            val dot = ndy // dot((0,1,0), (ndx,ndy,ndz))
            if (axisLen < 1e-6f) {
                Matrix.setIdentityM(rotate, 0)
                if (dot < 0f) Matrix.setRotateM(rotate, 0, 180f, 1f, 0f, 0f)
            } else {
                val angleDeg = Math.toDegrees(acos(dot.coerceIn(-1f, 1f).toDouble())).toFloat()
                Matrix.setRotateM(rotate, 0, angleDeg, axisX / axisLen, axisY / axisLen, axisZ / axisLen)
            }
        }

        val scale = FloatArray(16)
        Matrix.setIdentityM(scale, 0)
        Matrix.scaleM(scale, 0, radius, length, radius)

        val translateRotate = FloatArray(16)
        Matrix.multiplyMM(translateRotate, 0, translate, 0, rotate, 0)
        val local = FloatArray(16)
        Matrix.multiplyMM(local, 0, translateRotate, 0, scale, 0)

        val result = FloatArray(16)
        Matrix.multiplyMM(result, 0, parent, 0, local, 0)
        return result
    }

    /** M = Rx(x) * Ry(y) * Rz(z), matching Three.js's Euler 'XYZ' order. */
    private fun applyEulerXYZ(rpy: FloatArray): FloatArray {
        val rx = FloatArray(16); Matrix.setRotateM(rx, 0, Math.toDegrees(rpy[0].toDouble()).toFloat(), 1f, 0f, 0f)
        val ry = FloatArray(16); Matrix.setRotateM(ry, 0, Math.toDegrees(rpy[1].toDouble()).toFloat(), 0f, 1f, 0f)
        val rz = FloatArray(16); Matrix.setRotateM(rz, 0, Math.toDegrees(rpy[2].toDouble()).toFloat(), 0f, 0f, 1f)
        val rxy = FloatArray(16)
        Matrix.multiplyMM(rxy, 0, rx, 0, ry, 0)
        val rxyz = FloatArray(16)
        Matrix.multiplyMM(rxyz, 0, rxy, 0, rz, 0)
        return rxyz
    }
}
