package com.controlremoto.client

import android.content.Context
import android.content.Intent
import org.webrtc.*

class WebRTCClient(
    private val context: Context,
    private val socketClient: SocketClient,
    private val roomId: String,
    private val mediaProjectionPermissionResultData: Intent
) {
    private var peerConnection: PeerConnection? = null
    private var factory: PeerConnectionFactory? = null
    var dataChannel: DataChannel? = null

    init {
        // Inicializar WebRTC
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(true)
                .createInitializationOptions()
        )

        val options = PeerConnectionFactory.Options()
        factory = PeerConnectionFactory.builder()
            .setOptions(options)
            .createPeerConnectionFactory()

        val iceServers = listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
        
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
                // Si el PC inicia el DataChannel, lo recibimos aquí
                dataChannel = channel
                setupDataChannelObserver()
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
        val surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", null)
        val videoSource = factory?.createVideoSource(videoCapturer.isScreencast)
        videoCapturer.initialize(surfaceTextureHelper, context, videoSource?.capturerObserver)
        // Resolucion y FPS ajustables para rendimiento en TV y Tablet
        videoCapturer.startCapture(1280, 720, 30) 

        val videoTrack = factory?.createVideoTrack("100", videoSource)
        peerConnection?.addTrack(videoTrack)
    }

    private fun setupDataChannelObserver() {
        dataChannel?.registerObserver(object: DataChannel.Observer {
            override fun onMessage(buffer: DataChannel.Buffer?) {
                buffer?.data?.let {
                    val bytes = ByteArray(it.remaining())
                    it.get(bytes)
                    val message = String(bytes)
                    // Aquí se comunican los comandos al RemoteControlService
                    // Ejemplo: {"type": "click", "x": 0.5, "y": 0.5}
                }
            }
            override fun onStateChange() {}
            override fun onBufferedAmountChange(p0: Long) {}
        })
    }
}
