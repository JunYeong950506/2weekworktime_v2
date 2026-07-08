package com.twoweekworktime.webview;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private static final int CAFE_PUSH_PERMISSION_REQUEST_CODE = 701;
    private static final String CAFE_NOTIFICATION_CHANNEL_ID = "cafe_number_alerts";

    private WebView webView;
    private String appUrl;
    private String appHost;
    private String pendingCafePushDeviceId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        ensureNotificationChannel();

        appUrl = getString(R.string.webview_url);
        Uri appUri = Uri.parse(appUrl);
        appHost = appUri.getHost();

        webView = findViewById(R.id.main_webview);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WorktimeWebViewClient());
        webView.addJavascriptInterface(new CafeAndroidPushBridge(), "CafeAndroidPush");

        if (savedInstanceState == null) {
            webView.loadUrl(appUrl);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != CAFE_PUSH_PERMISSION_REQUEST_CODE) {
            return;
        }

        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            registerCafePushToken(pendingCafePushDeviceId);
            return;
        }

        emitCafeAndroidPushError("ANDROID_PUSH_PERMISSION_DENIED");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    private boolean isInternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (scheme == null || host == null) {
            return false;
        }

        boolean isHttp = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        return isHttp && host.equalsIgnoreCase(appHost);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CAFE_NOTIFICATION_CHANNEL_ID,
            "Cafe 701 Alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void requestCafePushRegistration(String deviceId) {
        if (deviceId == null || deviceId.trim().isEmpty()) {
            emitCafeAndroidPushError("INVALID_DEVICE_ID");
            return;
        }

        pendingCafePushDeviceId = deviceId.trim();

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                CAFE_PUSH_PERMISSION_REQUEST_CODE
            );
            return;
        }

        registerCafePushToken(pendingCafePushDeviceId);
    }

    private void registerCafePushToken(String deviceId) {
        if (deviceId == null || deviceId.trim().isEmpty()) {
            emitCafeAndroidPushError("INVALID_DEVICE_ID");
            return;
        }

        try {
            FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful() || task.getResult() == null || task.getResult().trim().isEmpty()) {
                        emitCafeAndroidPushError("ANDROID_PUSH_TOKEN_FAILED");
                        return;
                    }

                    emitCafeAndroidPushToken(task.getResult());
                });
        } catch (IllegalStateException error) {
            emitCafeAndroidPushError("ANDROID_PUSH_TOKEN_FAILED");
        }
    }

    private void emitCafeAndroidPushToken(String token) {
        String script = "window.dispatchEvent(new CustomEvent('cafe-android-push-token',{detail:{token:"
            + JSONObject.quote(token)
            + "}}));";
        evaluateCafePushJavascript(script);
    }

    private void emitCafeAndroidPushError(String message) {
        String script = "window.dispatchEvent(new CustomEvent('cafe-android-push-error',{detail:{message:"
            + JSONObject.quote(message)
            + "}}));";
        evaluateCafePushJavascript(script);
    }

    private void evaluateCafePushJavascript(String script) {
        if (webView == null) {
            return;
        }

        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void openExternal(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);

        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private class WorktimeWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isInternalUrl(uri)) {
                return false;
            }

            openExternal(uri);
            return true;
        }
    }

    private class CafeAndroidPushBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void requestRegistration(String deviceId) {
            runOnUiThread(() -> requestCafePushRegistration(deviceId));
        }
    }
}
