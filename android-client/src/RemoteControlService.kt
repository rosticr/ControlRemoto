package com.controlremoto.client

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityEvent

class RemoteControlService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d("RemoteControl", "Servicio de Accesibilidad Conectado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "START_WEBRTC") {
            val roomId = intent.getStringExtra("ROOM_ID")
            // Aquí se iniciaría la lógica de WebRTC, capturando la pantalla
            // usando la librería WebRTC de Android e interactuando con Socket.io
            Log.d("RemoteControl", "Iniciando WebRTC para la sala: $roomId")
            
            // TODO: Inicializar WebRTCClient pasando el intent de MediaProjection
        }
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No necesitamos procesar eventos, solo despachar gestos
    }

    override fun onInterrupt() {
        Log.d("RemoteControl", "Servicio Interrumpido")
    }

    // Método para ser llamado desde el DataChannel de WebRTC
    fun performClick(x: Float, y: Float) {
        val path = Path()
        path.moveTo(x, y)
        val builder = GestureDescription.Builder()
        val gesture = builder.addStroke(GestureDescription.StrokeDescription(path, 0, 100)).build()
        
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d("RemoteControl", "Clic despachado en $x, $y")
            }
        }, null)
    }
}
