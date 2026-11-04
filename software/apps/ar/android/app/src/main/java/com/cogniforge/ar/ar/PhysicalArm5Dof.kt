package com.cogniforge.ar.ar

import android.opengl.Matrix
import com.google.ar.core.Anchor
import com.google.ar.core.TrackingState
import kotlin.math.PI

/**
 * 5-DOF Joint rig using procedurally-generated geometry, ported from the WebXR
 * version (PhysicalArm5Dof.ts) to render in native AR.
 */
class PhysicalArm5Dof {

    private val baseHeight = 0.07f
    private val upperArmLength = 0.105f
    private val forearmLength = 0.100f
    private val gripperLength = 0.070f

    private val linkRadius = 0.012f
    private val jointRadius = 0.016f
    private val baseRadius = 0.045f

    // Colors
    private val baseRed = floatArrayOf(0.53f, 0.13f, 0.13f)
    private val baseGrey = floatArrayOf(0.33f, 0.33f, 0.33f)
    private val armYellow = floatArrayOf(0.83f, 0.76f, 0.26f)
    private val armRed = floatArrayOf(0.53f, 0.13f, 0.13f)
    private val wristBlack = floatArrayOf(0.13f, 0.13f, 0.13f)
    private val gearBlue = floatArrayOf(0.06f, 0.33f, 0.8f)

    private val cylinderRenderer = MeshRenderer()
    private val sphereRenderer = MeshRenderer()
    private val boxRenderer = MeshRenderer()

    @Volatile private var jointAnglesDeg = floatArrayOf(90f, 90f, 90f, 90f, 0f)

    @Volatile private var anchor: Anchor? = null
    @Volatile var isPlaced = false
        private set
    @Volatile var isLoaded = false
        private set

    // Rotate Z-up arm to ARCore's Y-up space
    private val rigRotation = FloatArray(16).also { Matrix.setRotateM(it, 0, -90f, 1f, 0f, 0f) }

    private val renderers = mutableMapOf<String, MeshRenderer>()

    private fun getRenderer(type: String, color: FloatArray): MeshRenderer {
        val key = type + color.joinToString()
        if (!renderers.containsKey(key)) {
            val mr = MeshRenderer()
            val mesh = when (type) {
                "box" -> PrimitiveGeometry.unitBox(color)
                "sphere" -> PrimitiveGeometry.unitSphere(color)
                else -> PrimitiveGeometry.unitCylinder(color)
            }
            mr.uploadToGl(mesh)
            renderers[key] = mr
        }
        return renderers[key]!!
    }

    fun loadAll(glSurfaceView: android.opengl.GLSurfaceView, onLoaded: () -> Unit, onError: (String) -> Unit) {
        glSurfaceView.queueEvent {
            try {
                getRenderer("cylinder", baseRed)
                getRenderer("cylinder", baseGrey)
                getRenderer("cylinder", armYellow)
                getRenderer("box", armYellow)
                getRenderer("cylinder", armRed)
                getRenderer("box", armRed)
                getRenderer("cylinder", wristBlack)
                getRenderer("box", wristBlack)
                getRenderer("cylinder", gearBlue)
                getRenderer("box", baseRed)
                getRenderer("sphere", wristBlack)
                isLoaded = true
                onLoaded()
            } catch (e: Exception) {
                onError("Geometry upload failed: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    fun place(newAnchor: Anchor) {
        anchor?.detach()
        anchor = newAnchor
        isPlaced = true
    }

    fun updateJoints(anglesDeg: FloatArray) {
        if (anglesDeg.size >= 5) jointAnglesDeg = anglesDeg.copyOf(5)
    }

    fun getJoints(): FloatArray = jointAnglesDeg.copyOf()

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
    
    private fun applyTransform(parent: FloatArray, tx: Float, ty: Float, tz: Float, rotX: Float = 0f, rotY: Float = 0f, rotZ: Float = 0f): FloatArray {
        val m = FloatArray(16)
        Matrix.setIdentityM(m, 0)
        Matrix.translateM(m, 0, tx, ty, tz)
        if (rotX != 0f) Matrix.rotateM(m, 0, rotX, 1f, 0f, 0f)
        if (rotY != 0f) Matrix.rotateM(m, 0, rotY, 0f, 1f, 0f)
        if (rotZ != 0f) Matrix.rotateM(m, 0, rotZ, 0f, 0f, 1f)
        val res = FloatArray(16)
        Matrix.multiplyMM(res, 0, parent, 0, m, 0)
        return res
    }

    fun draw(viewMatrix: FloatArray, projectionMatrix: FloatArray) {
        if (!isPlaced || !isLoaded) return
        val vp = FloatArray(16)
        Matrix.multiplyMM(vp, 0, projectionMatrix, 0, viewMatrix, 0)
        val baseModel = getBaseWorldMatrix()

        val rads = jointAnglesDeg.map { Math.toRadians(it.toDouble()).toFloat() }
        val base = rads[0]
        val shoulder = rads[1]
        val elbow = rads[2]
        val wrist = rads[3]
        val gripper = rads[4]

        // 1. Bottom Base
        var m = applyTransform(baseModel, 0f, baseHeight / 2f, 0f)
        drawShape(getRenderer("cylinder", baseRed), scaleMatrix(m, baseRadius, baseHeight, baseRadius), vp)

        // 2. Base Rotating Mount
        var baseGroup = applyTransform(baseModel, 0f, baseHeight, 0f, rotY = Math.toDegrees(base.toDouble()).toFloat())
        
        m = applyTransform(baseGroup, 0f, baseHeight * 0.4f, 0f)
        drawShape(getRenderer("cylinder", baseGrey), scaleMatrix(m, baseRadius * 0.8f, baseHeight * 0.8f, baseRadius * 0.9f), vp)

        // 3. Shoulder Group
        var shoulderGroup = applyTransform(baseGroup, 0f, baseHeight * 0.6f, 0f, rotZ = Math.toDegrees(shoulder.toDouble()).toFloat())
        
        m = applyTransform(shoulderGroup, 0f, 0f, 0f, rotX = 90f)
        drawShape(getRenderer("cylinder", armYellow), scaleMatrix(m, jointRadius * 1.5f, 0.04f, jointRadius * 1.5f), vp)
        
        m = applyTransform(shoulderGroup, upperArmLength / 2f, 0f, 0f)
        drawShape(getRenderer("box", armYellow), scaleMatrix(m, upperArmLength, 0.03f, 0.03f), vp)

        // 4. Elbow Group
        var elbowGroup = applyTransform(shoulderGroup, upperArmLength, 0f, 0f, rotZ = Math.toDegrees(elbow.toDouble()).toFloat())

        m = applyTransform(elbowGroup, 0f, 0f, 0f, rotX = 90f)
        drawShape(getRenderer("cylinder", armRed), scaleMatrix(m, jointRadius * 1.2f, 0.035f, jointRadius * 1.2f), vp)
        
        m = applyTransform(elbowGroup, forearmLength / 2f, 0f, 0f)
        drawShape(getRenderer("box", armRed), scaleMatrix(m, forearmLength, 0.035f, 0.035f), vp)

        // 5. Wrist Group
        var wristGroup = applyTransform(elbowGroup, forearmLength, 0f, 0f, rotZ = Math.toDegrees(wrist.toDouble()).toFloat())

        m = applyTransform(wristGroup, 0f, 0f, 0f, rotX = 90f)
        drawShape(getRenderer("cylinder", wristBlack), scaleMatrix(m, jointRadius, 0.04f, jointRadius), vp)
        
        m = applyTransform(wristGroup, gripperLength * 0.4f / 2f, 0f, 0f)
        drawShape(getRenderer("box", wristBlack), scaleMatrix(m, gripperLength * 0.4f, 0.03f, 0.04f), vp)

        // Blue Gear
        m = applyTransform(wristGroup, gripperLength * 0.4f, 0f, 0f, rotX = 90f)
        drawShape(getRenderer("cylinder", gearBlue), scaleMatrix(m, 0.015f, 0.042f, 0.015f), vp)

        // Grippers
        val openness = 1f - Math.max(0f, Math.min(1f, gripper / (60f * Math.PI.toFloat() / 180f)))
        val spread = 0.015f + openness * 0.015f

        // Finger L
        m = applyTransform(wristGroup, gripperLength * 0.4f + 0.02f, spread, 0f, rotZ = (Math.PI / 8).toFloat() * 180f / Math.PI.toFloat())
        drawShape(getRenderer("box", baseRed), scaleMatrix(m, 0.04f, 0.008f, 0.01f), vp)

        // Finger R
        m = applyTransform(wristGroup, gripperLength * 0.4f + 0.02f, -spread, 0f, rotZ = -(Math.PI / 8).toFloat() * 180f / Math.PI.toFloat())
        drawShape(getRenderer("box", baseRed), scaleMatrix(m, 0.04f, 0.008f, 0.01f), vp)
    }
}
