package com.controlremoto.client

import android.os.Handler
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class SocketClient {
    private var socket: Socket? = null
    var onStatusChange: ((String) -> Unit)? = null
    var onOffer: ((JSONObject) -> Unit)? = null
    var onAnswer: ((JSONObject) -> Unit)? = null
    var onIceCandidate: ((JSONObject) -> Unit)? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun updateStatus(msg: String) {
        Log.d("SocketClient", msg)
        mainHandler.post { onStatusChange?.invoke(msg) }
    }

    fun connect(
        url: String,
        roomId: String,
        onOfferInit: ((JSONObject) -> Unit)? = null,
        onAnswerInit: ((JSONObject) -> Unit)? = null,
        onIceCandidateInit: ((JSONObject) -> Unit)? = null
    ) {
        if (onOfferInit != null) this.onOffer = onOfferInit
        if (onAnswerInit != null) this.onAnswer = onAnswerInit
        if (onIceCandidateInit != null) this.onIceCandidate = onIceCandidateInit
        try {
            updateStatus("Intentando conectar a: $url")
            val opts = IO.Options.builder()
                .setReconnection(true)
                .setReconnectionAttempts(5)
                .setReconnectionDelay(2000)
                .setTimeout(10000)
                .build()
            socket = IO.socket(url, opts)

            socket?.on(Socket.EVENT_CONNECT) {
                updateStatus("✅ CONECTADO al servidor. Registrando como: $roomId")
                socket?.emit("register-device", roomId)
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val error = args.getOrNull(0)?.toString() ?: "desconocido"
                updateStatus("❌ ERROR de conexión: $error")
            }

            socket?.on(Socket.EVENT_DISCONNECT) { args ->
                val reason = args.getOrNull(0)?.toString() ?: "desconocida"
                updateStatus("⚠️ DESCONECTADO. Razón: $reason")
            }

            socket?.on("offer") { args ->
                try {
                    updateStatus("📥 OFFER recibido de Windows")
                    onOffer?.invoke(args[0] as JSONObject)
                } catch (e: Exception) {
                    updateStatus("❌ Error parseando offer: ${e.message}")
                }
            }
            socket?.on("answer") { args ->
                try {
                    updateStatus("📥 ANSWER recibido")
                    onAnswer?.invoke(args[0] as JSONObject)
                } catch (e: Exception) {
                    updateStatus("❌ Error parseando answer: ${e.message}")
                }
            }
            socket?.on("ice-candidate") { args ->
                try {
                    onIceCandidate?.invoke(args[0] as JSONObject)
                } catch (e: Exception) {
                    updateStatus("❌ Error ICE: ${e.message}")
                }
            }

            socket?.connect()
            updateStatus("Conectando... (esperando respuesta del servidor)")
        } catch (e: Exception) {
            updateStatus("❌ EXCEPCIÓN al conectar: ${e.message}")
            Log.e("SocketClient", "Error conectando", e)
        }
    }

    fun emitOffer(roomId: String, offer: JSONObject) {
        socket?.emit("offer", JSONObject().apply { put("roomId", roomId); put("offer", offer) })
    }

    fun emitAnswer(roomId: String, answer: JSONObject) {
        socket?.emit("answer", JSONObject().apply { put("roomId", roomId); put("answer", answer) })
    }

    fun emitIceCandidate(roomId: String, candidate: JSONObject) {
        socket?.emit("ice-candidate", JSONObject().apply { put("roomId", roomId); put("candidate", candidate) })
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
