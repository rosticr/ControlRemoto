package com.controlremoto.client

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class SocketClient {
    private var socket: Socket? = null

    fun connect(url: String, roomId: String, onOffer: (JSONObject) -> Unit, onAnswer: (JSONObject) -> Unit, onIceCandidate: (JSONObject) -> Unit) {
        try {
            socket = IO.socket(url)
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d("SocketClient", "Conectado al servidor de señalización")
                socket?.emit("join-room", roomId)
            }
            socket?.on("offer") { args -> onOffer(args[0] as JSONObject) }
            socket?.on("answer") { args -> onAnswer(args[0] as JSONObject) }
            socket?.on("ice-candidate") { args -> onIceCandidate(args[0] as JSONObject) }
            socket?.connect()
        } catch (e: Exception) {
            Log.e("SocketClient", "Error conectando a Socket.io", e)
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
}
