package com.controlremoto.client

import android.app.Activity
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.Window
import android.view.WindowManager

class AdminConsoleActivity : Activity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen without title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        webView = WebView(this)
        setContentView(webView)

        // Get the target admin console URL
        val url = intent.getStringExtra("URL") ?: "https://acceso.rosti.cr/admin"

        // Configure WebView settings
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.mediaPlaybackRequiresUserGesture = false

        // Enable pinch-to-zoom
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false

        // Add JavaScript-Java Bridge to trigger soft keyboard programmatically
        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun showKeyboard() {
                runOnUiThread {
                    webView.requestFocus()
                    val imm = getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                    imm.toggleSoftInput(android.view.inputmethod.InputMethodManager.SHOW_FORCED, 0)
                }
            }
        }, "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false // Handle navigation inside WebView
            }
        }

        // Grant WebRTC and hardware media permissions dynamically
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    request.grant(request.resources)
                }
            }
        }

        webView.loadUrl(url)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
