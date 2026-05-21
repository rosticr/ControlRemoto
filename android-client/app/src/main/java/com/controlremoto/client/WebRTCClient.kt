package com.controlremoto.client

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import org.webrtc.*

class WebRTCClient(
    private val context: Context,
    private val socketClient: SocketClient,
    private val roomId: String,
    private val mediaProjectionPermissionResultData: Intent
) {
    var peerConnection: PeerConnection? = null
    private var factory: PeerConnectionFactory? = null
    var dataChannel: DataChannel? = null
    private val eglBase = EglBase.create()

    init {
        // Inicializar WebRTC
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(true)
                .createInitializationOptions()
        )

        val options = PeerConnectionFactory.Options()
        // Usamos hardware encoding que es mucho más rápido y estable para grabar pantalla
        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        
        factory = PeerConnectionFactory.builder()
            .setOptions(options)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:80")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer(),
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer(),
            PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443?transport=tcp")
                .setUsername("openrelayproject")
                .setPassword("openrelayproject")
                .createIceServer()
        )
        
        peerConnection = factory?.createPeerConnection(iceServers, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate?) {
                candidate?.let {
                    val json = org.json.JSONObject()
                    json.put("sdpMid", it.sdpMid)
                    json.put("sdpMLineIndex", it.sdpMLineIndex)
                    json.put("candidate", it.sdp)
                    socketClient.emitIceCandidate(roomId, json)
                }
            }
            override fun onDataChannel(channel: DataChannel?) {
                dataChannel = channel
                dataChannel?.registerObserver(object: DataChannel.Observer {
                    override fun onMessage(buffer: DataChannel.Buffer?) {
                        val data = buffer?.data
                        if (data != null) {
                            val bytes = ByteArray(data.remaining())
                            data.get(bytes)
                            val message = String(bytes)
                            try {
                                val json = org.json.JSONObject(message)
                                val type = json.optString("type")
                                if (type == "down" || type == "click") {
                                    val x = json.optDouble("x", -1.0).toFloat()
                                    val y = json.optDouble("y", -1.0).toFloat()
                                    if (x >= 0 && y >= 0) {
                                        RemoteControlAccessibilityService.instance?.performTap(x, y)
                                    }
                                } else if (type == "key") {
                                    val key = json.optString("key")
                                    if (key.isNotEmpty()) {
                                        RemoteControlAccessibilityService.instance?.injectKey(key)
                                    }
                                }
                            } catch (e: Exception) {
                                android.util.Log.e("WebRTCClient", "Error parseando DataChannel msg: $message", e)
                            }
                        }
                    }
                    override fun onStateChange() {}
                    override fun onBufferedAmountChange(p0: Long) {}
                })
            }
            // Implementaciones requeridas
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(p0: RtpReceiver?, p1: Array<out MediaStream>?) {}
        })

        startScreenCapture()
    }

    private fun startScreenCapture() {
        val videoCapturer = ScreenCapturerAndroid(mediaProjectionPermissionResultData, object : MediaProjection.Callback() {})
        val surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        val videoSource = factory?.createVideoSource(videoCapturer.isScreencast)
        videoCapturer.initialize(surfaceTextureHelper, context, videoSource?.capturerObserver)
        
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
        val metrics = android.util.DisplayMetrics()
        windowManager.defaultDisplay.getRealMetrics(metrics)
        var width = metrics.widthPixels
        var height = metrics.heightPixels
        
        // Limitar resolución para evitar que el encoder falle por tamaño excesivo
        val MAX_RES = 1280
        if (Math.max(width, height) > MAX_RES) {
            val ratio = width.toFloat() / height.toFloat()
            if (width > height) {
                width = MAX_RES
                height = (MAX_RES / ratio).toInt()
            } else {
                height = MAX_RES
                width = (MAX_RES * ratio).toInt()
            }
        }

        // Asegurar que sean números pares (los encoders de video suelen requerirlo)
        width = (width / 2) * 2
        height = (height / 2) * 2
        
        // Resolución dinámica y segura
        videoCapturer.startCapture(width, height, 30) 

        val videoTrack = factory?.createVideoTrack("100", videoSource)
        peerConnection?.addTrack(videoTrack, listOf("screen_stream"))
    }
}
