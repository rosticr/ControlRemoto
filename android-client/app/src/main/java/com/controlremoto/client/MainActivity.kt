package com.controlremoto.client

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.app.AlertDialog
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.os.Build

class MainActivity : Activity() {

    private lateinit var mediaProjectionManager: MediaProjectionManager
    private val SCREEN_CAPTURE_REQUEST_CODE = 1000
    private var generatedCode: String = ""

    companion object {
        var isTransmissionIntentHandled = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        val tvRoomCode = findViewById<TextView>(R.id.tvRoomCode)
        val tvStatus = findViewById<TextView>(R.id.tvStatus)
        val btnConnect = findViewById<Button>(R.id.btnConnect)
        val btnAccessibility = findViewById<Button>(R.id.btnAccessibility)
        val layoutLogin = findViewById<LinearLayout>(R.id.layoutLogin)
        val layoutDashboard = findViewById<LinearLayout>(R.id.layoutDashboard)
        val etUser = findViewById<EditText>(R.id.etUser)
        val etPass = findViewById<EditText>(R.id.etPass)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val btnSettings = findViewById<Button>(R.id.btnSettings)

        // Receptor de mensajes de diagnóstico del servicio
        val statusReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val msg = intent?.getStringExtra("msg") ?: return
                val current = tvStatus.text.toString()
                val lines = current.split("\n").takeLast(8)
                tvStatus.text = (lines + msg).joinToString("\n")
            }
        }
        registerReceiver(statusReceiver, IntentFilter("ROSTI_STATUS"), Context.RECEIVER_NOT_EXPORTED)

        val prefs = getSharedPreferences("RostiPrefs", Context.MODE_PRIVATE)
        val isLoggedIn = prefs.getBoolean("is_logged_in", false)

        if (isLoggedIn) {
            layoutLogin.visibility = LinearLayout.GONE
            layoutDashboard.visibility = LinearLayout.VISIBLE
            
            // Cargar o generar ID estático
            generatedCode = prefs.getString("permanent_id", "") ?: ""
            if (generatedCode.isEmpty()) {
                val randomNum = (100000..999999).random()
                generatedCode = "${randomNum.toString().substring(0, 3)}-${randomNum.toString().substring(3, 6)}"
                prefs.edit().putString("permanent_id", generatedCode).apply()
            }
            tvRoomCode.text = generatedCode
            
            if (intent?.action == "ACTION_START_TRANSMISSION" && !isTransmissionIntentHandled) {
                isTransmissionIntentHandled = true
                // Limpiar la acción para que no se vuelva a ejecutar en reanudaciones
                intent.action = ""
                setIntent(intent)
                
                tvStatus.text = "Iniciando captura solicitada en segundo plano..."
                startScreenCapture()
            } else {
                tvStatus.text = "Servicio en segundo plano activo. Esperando conexión..."
            }
        } else {
            layoutLogin.visibility = LinearLayout.VISIBLE
            layoutDashboard.visibility = LinearLayout.GONE
        }

        btnLogin.setOnClickListener {
            val user = etUser.text.toString().trim()
            val pass = etPass.text.toString().trim()
            
            if (user == "soporte" && pass == "R0st1p021") {
                prefs.edit().putBoolean("is_logged_in", true).apply()
                
                val randomNum = (100000..999999).random()
                generatedCode = "${randomNum.toString().substring(0, 3)}-${randomNum.toString().substring(3, 6)}"
                prefs.edit().putString("permanent_id", generatedCode).apply()
                
                tvRoomCode.text = generatedCode
                layoutLogin.visibility = LinearLayout.GONE
                layoutDashboard.visibility = LinearLayout.VISIBLE
                
                startScreenCapture()
            } else {
                Toast.makeText(this, "Credenciales incorrectas", Toast.LENGTH_SHORT).show()
            }
        }

        btnConnect.setOnClickListener {
            startScreenCapture()
        }

        btnAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        btnSettings.setOnClickListener {
            val currentUrl = prefs.getString("server_url", "https://acceso.rosti.cr")
            val input = EditText(this)
            input.setText(currentUrl)
            
            AlertDialog.Builder(this)
                .setTitle("Configurar Servidor")
                .setMessage("Ingresa la URL o IP del servidor (ej. https://acceso.rosti.cr):")
                .setView(input)
                .setPositiveButton("Guardar") { _, _ ->
                    val newUrl = input.text.toString().trim()
                    if (newUrl.isNotEmpty()) {
                        prefs.edit().putString("server_url", newUrl).apply()
                        Toast.makeText(this, "Servidor actualizado. Reinicia la transmisión si está activa.", Toast.LENGTH_LONG).show()
                    }
                }
                .setNegativeButton("Cancelar", null)
                .show()
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
                    putExtra("ROOM_ID", generatedCode)
                }
                
                try {
                    val tvStatus = findViewById<TextView>(R.id.tvStatus)
                    tvStatus.text = "Lanzando servicio de captura...\n"
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent)
                    } else {
                        startService(serviceIntent)
                    }
                    Toast.makeText(this, "Transmisión iniciada", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    val tvStatus = findViewById<TextView>(R.id.tvStatus)
                    tvStatus.text = "ERROR FATAL: ${e.message}\n"
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            } else {
                Toast.makeText(this, "Permiso de captura de pantalla denegado", Toast.LENGTH_SHORT).show()
            }
        }
    }
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.action == "ACTION_START_TRANSMISSION" && !isTransmissionIntentHandled) {
            isTransmissionIntentHandled = true
            // Limpiar la acción para que no se vuelva a ejecutar si la actividad se reanuda
            intent.action = ""
            setIntent(intent)
            
            val tvStatus = findViewById<TextView>(R.id.tvStatus)
            tvStatus.text = "Iniciando captura solicitada en segundo plano..."
            startScreenCapture()
        }
    }
}
