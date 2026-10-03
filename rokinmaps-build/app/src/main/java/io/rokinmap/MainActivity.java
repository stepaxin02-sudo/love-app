package io.rokinmap;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 42;
    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#0B0F17"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B0F17"));

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B0F17"));
        webView.addJavascriptInterface(new TransportBridge(), "RokinNative");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeoOrigin = origin;
                pendingGeoCallback = callback;
                requestPermissions(
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION},
                        LOCATION_REQUEST
                );
            }
        });

        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_REQUEST) return;
        boolean granted = hasLocationPermission();
        if (pendingGeoCallback != null && pendingGeoOrigin != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
        }
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
    }

    private class TransportBridge {
        @JavascriptInterface
        public void fetchAircraft(double lat, double lon, int radiusNm) {
            final int radius = Math.max(40, Math.min(250, radiusNm));
            new Thread(() -> {
                String[] names = new String[]{"ADSB.lol", "Airplanes.live"};
                String[] endpoints = new String[]{
                        String.format(Locale.US, "https://api.adsb.lol/v2/point/%.5f/%.5f/%d", lat, lon, radius),
                        String.format(Locale.US, "https://api.airplanes.live/v2/point/%.5f/%.5f/%d", lat, lon, radius)
                };

                String lastError = "нет ответа";
                for (int i = 0; i < endpoints.length; i++) {
                    HttpURLConnection connection = null;
                    try {
                        connection = (HttpURLConnection) new URL(endpoints[i]).openConnection();
                        connection.setRequestMethod("GET");
                        connection.setConnectTimeout(8000);
                        connection.setReadTimeout(11000);
                        connection.setUseCaches(false);
                        connection.setRequestProperty("Accept", "application/json");
                        connection.setRequestProperty("User-Agent", "RokinMaps/0.2.8 Android");

                        int code = connection.getResponseCode();
                        InputStream stream = code >= 200 && code < 300
                                ? connection.getInputStream()
                                : connection.getErrorStream();
                        String body = readAll(stream);

                        if (code >= 200 && code < 300 && body != null && body.contains("{")) {
                            emitTransportCallback("onAircraft", body, names[i]);
                            return;
                        }
                        lastError = names[i] + " HTTP " + code;
                    } catch (Exception e) {
                        lastError = names[i] + " " + friendlyError(e);
                    } finally {
                        if (connection != null) connection.disconnect();
                    }
                }
                emitTransportCallback("onAircraftError", lastError, "");
            }).start();
        }

        @JavascriptInterface
        public void fetchNearbyStops(double lat, double lon, int radiusMeters, int requestId) {
            final int radius = Math.max(400, Math.min(3500, radiusMeters));
            new Thread(() -> {
                String query = String.format(
                        Locale.US,
                        "[out:json][timeout:10];("
                                + "node(around:%d,%.6f,%.6f)[\"highway\"=\"bus_stop\"];"
                                + "nwr(around:%d,%.6f,%.6f)[\"public_transport\"=\"platform\"];"
                                + "nwr(around:%d,%.6f,%.6f)[\"public_transport\"=\"station\"][\"bus\"=\"yes\"];"
                                + ");out center tags 80;",
                        radius, lat, lon,
                        radius, lat, lon,
                        radius, lat, lon
                );
                try {
                    String body = requestOverpass(query, 7000, 11000);
                    emitTransportCallback("onNearbyStops", body, String.valueOf(requestId));
                } catch (Exception e) {
                    emitTransportCallback(
                            "onNearbyStopsError",
                            friendlyError(e),
                            String.valueOf(requestId)
                    );
                }
            }).start();
        }

        @JavascriptInterface
        public void fetchRoutesNearStop(double lat, double lon, int requestId) {
            new Thread(() -> {
                String query = String.format(
                        Locale.US,
                        "[out:json][timeout:12];"
                                + "rel(around:500,%.6f,%.6f)"
                                + "[\"type\"=\"route\"]"
                                + "[\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];"
                                + "out tags 100;",
                        lat, lon
                );
                try {
                    String body = requestOverpass(query, 7000, 12000);
                    emitTransportCallback("onRoutesNearStop", body, String.valueOf(requestId));
                } catch (Exception e) {
                    emitTransportCallback(
                            "onRoutesNearStopError",
                            friendlyError(e),
                            String.valueOf(requestId)
                    );
                }
            }).start();
        }

        @JavascriptInterface
        public void fetchTransitRoute(long relationId) {
            if (relationId <= 0) return;
            new Thread(() -> {
                String query = "[out:json][timeout:20];relation(" + relationId + ");out geom;";
                try {
                    String body = requestOverpass(query, 8000, 16000);
                    emitTransportCallback("onTransitRoute", body, String.valueOf(relationId));
                } catch (Exception e) {
                    emitTransportCallback("onTransitError", "Маршрут: " + friendlyError(e), "");
                }
            }).start();
        }

        private String requestOverpass(String query, int connectTimeoutMs, int readTimeoutMs) throws Exception {
            String[] endpoints = new String[]{
                    "https://overpass-api.de/api/interpreter",
                    "https://overpass.kumi.systems/api/interpreter",
                    "https://overpass.private.coffee/api/interpreter"
            };
            Exception last = null;

            for (String endpoint : endpoints) {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(endpoint).openConnection();
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(connectTimeoutMs);
                    connection.setReadTimeout(readTimeoutMs);
                    connection.setUseCaches(false);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                    connection.setRequestProperty("User-Agent", "RokinMaps/0.2.8 Android");

                    String payload = "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8.toString());
                    try (OutputStreamWriter writer = new OutputStreamWriter(
                            connection.getOutputStream(), StandardCharsets.UTF_8)) {
                        writer.write(payload);
                    }

                    int code = connection.getResponseCode();
                    InputStream stream = code >= 200 && code < 300
                            ? connection.getInputStream()
                            : connection.getErrorStream();
                    String body = readAll(stream);

                    if (code >= 200 && code < 300 && body != null && body.contains("{")) {
                        return body;
                    }
                    last = new RuntimeException("HTTP " + code);
                } catch (Exception e) {
                    last = e;
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }

            if (last != null) throw last;
            throw new RuntimeException("Нет ответа от сервера");
        }

        private String friendlyError(Exception e) {
            if (e instanceof SocketTimeoutException) return "сервер не успел ответить";
            String name = e.getClass().getSimpleName();
            if (name == null || name.isEmpty()) return "ошибка сети";
            return name;
        }

        private String readAll(InputStream stream) throws Exception {
            if (stream == null) return "";
            StringBuilder out = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) out.append(line);
            }
            return out.toString();
        }

        private void emitTransportCallback(String method, String payload, String provider) {
            final String js = "window.RokinTransportNative&&window.RokinTransportNative."
                    + method + "("
                    + JSONObject.quote(payload == null ? "" : payload) + ","
                    + JSONObject.quote(provider == null ? "" : provider)
                    + ")";
            runOnUiThread(() -> {
                if (webView != null) webView.evaluateJavascript(js, null);
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
