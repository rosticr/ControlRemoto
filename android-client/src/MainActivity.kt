package com.controlremoto.client

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var mediaProjectionManager: MediaProjectionManager
    private val SCREEN_CAPTURE_REQUEST_CODE = 1000

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        val btnConnect = findViewById<Button>(R.id.btnConnect)
        val etRoomId = findViewById<EditText>(R.id.etRoomId)
        val btnAccessibility = findViewById<Button>(R.id.btnAccessibility)

        btnConnect.setOnClickListener {
            val roomId = etRoomId.text.toString()
            if (roomId.isNotEmpty()) {
                startScreenCapture()
            }
        }

        btnAccessibility.setOnClickListener {
            // Abrir configuración de accesibilidad para habilitar el control remoto
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
    }

    private fun startScreenCapture() {
        val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
        startActivityForResult(captureIntent, SCREEN_CAPTURE_REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == SCREEN_CAPTURE_REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                // Iniciar servicio en primer plano y pasar el intent de MediaProjection
                val serviceIntent = Intent(this, RemoteControlService::class.java).apply {
                    action = "START_WEBRTC"
                    putExtra("RESULT_CODE", resultCode)
                    putExtra("DATA", data)
                    putExtra("ROOM_ID", findViewById<EditText>(R.id.etRoomId).text.toString())
                }
                startService(serviceIntent)
                Toast.makeText(this, "Conectando al servidor...", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Permiso de captura de pantalla denegado", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
