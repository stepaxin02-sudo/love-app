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
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
                        connection.setRequestProperty("User-Agent", "RokinMaps/0.2.9 Android");

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
            final int radius = Math.max(400, Math.min(5000, radiusMeters));
            new Thread(() -> {
                String query = String.format(
                        Locale.US,
                        "[out:json][timeout:10];("
                                + "node(around:%d,%.6f,%.6f)[\"highway\"=\"bus_stop\"];"
                                + "nwr(around:%d,%.6f,%.6f)[\"public_transport\"=\"platform\"];"
                                + "nwr(around:%d,%.6f,%.6f)[\"public_transport\"=\"station\"][\"bus\"=\"yes\"];"
                                + ");out tags center 200;",
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
        public void fetchRoutesNearStop(
                String osmType,
                long osmId,
                double lat,
                double lon,
                int requestId
        ) {
            new Thread(() -> {
                String sourceSelector;
                String parentSelector;
                if ("way".equals(osmType)) {
                    sourceSelector = "way(" + osmId + ")->.stop;";
                    parentSelector = "rel(bw.stop)";
                } else if ("relation".equals(osmType)) {
                    sourceSelector = "relation(" + osmId + ")->.stop;";
                    parentSelector = "rel(br.stop)";
                } else {
                    sourceSelector = "node(" + osmId + ")->.stop;";
                    parentSelector = "rel(bn.stop)";
                }

                String query = String.format(
                        Locale.US,
                        "[out:json][timeout:12];"
                                + sourceSelector
                                + "("
                                + parentSelector
                                + "[\"type\"=\"route\"]"
                                + "[\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];"
                                + "rel(around:140,%.6f,%.6f)"
                                + "[\"type\"=\"route\"]"
                                + "[\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];"
                                + ");out tags 100;",
                        lat, lon
                );
                try {
                    String body = requestOverpass(query, 6500, 11000);
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
        public void fetchRouteSchedule(String city, String routeType, String routeRef, int requestId) {
            new Thread(() -> {
                JSONObject result = new JSONObject();
                try {
                    result.put("requestId", requestId);
                    result.put("city", city == null ? "" : city);
                    result.put("type", routeType == null ? "" : routeType);
                    result.put("ref", routeRef == null ? "" : routeRef);

                    String normalizedCity = city == null ? "" : city.trim().toLowerCase(Locale.ROOT);
                    String ref = routeRef == null ? "" : routeRef.trim();
                    if (!normalizedCity.contains("омск") || ref.isEmpty()) {
                        result.put("status", "unavailable");
                        emitTransportCallback("onRouteSchedule", result.toString(), String.valueOf(requestId));
                        return;
                    }

                    String slug = transliterateRouteRef(ref);
                    String[] urls;
                    if ("tram".equals(routeType)) {
                        urls = new String[]{"https://avtobus24.ru/omsk-tramvaj-" + slug + "/"};
                    } else if ("trolleybus".equals(routeType)) {
                        urls = new String[]{"https://avtobus24.ru/omsk-trollejbus-" + slug + "/"};
                    } else if ("share_taxi".equals(routeType)) {
                        urls = new String[]{
                                "https://kudikina.ru/omsk/mtaxi/" + slug + "/A",
                                "https://avtobus24.ru/omsk-marshrutka-" + slug + "/",
                                "https://avtobus24.ru/omsk-avtobus-" + slug + "/"
                        };
                    } else {
                        urls = new String[]{"https://avtobus24.ru/omsk-avtobus-" + slug + "/"};
                    }

                    Pattern hoursPattern = Pattern.compile(
                            "Часы\\s*работы\\s*:?\\s*с\\s*(\\d{1,2}:\\d{2})\\s*до\\s*(\\d{1,2}:\\d{2})",
                            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
                    );

                    for (String url : urls) {
                        String html = fetchText(url, 6500, 9000);
                        if (html == null || html.isEmpty()) continue;
                        String text = html
                                .replaceAll("(?is)<script[^>]*>.*?</script>", " ")
                                .replaceAll("(?is)<style[^>]*>.*?</style>", " ")
                                .replaceAll("(?is)<[^>]+>", " ")
                                .replace("&nbsp;", " ")
                                .replace("&#160;", " ")
                                .replaceAll("\\s+", " ");
                        Matcher matcher = hoursPattern.matcher(text);
                        if (matcher.find()) {
                            result.put("from", matcher.group(1));
                            result.put("to", matcher.group(2));
                            result.put("source", url.contains("kudikina.ru") ? "kudikina.ru" : "avtobus24.ru");
                            result.put("status", "ok");
                            emitTransportCallback("onRouteSchedule", result.toString(), String.valueOf(requestId));
                            return;
                        }

                        Matcher timeMatcher = Pattern.compile("\\b([0-2]?\\d):(\\d{2})\\b").matcher(text);
                        int minMinutes = Integer.MAX_VALUE;
                        int maxMinutes = -1;
                        int foundTimes = 0;
                        while (timeMatcher.find()) {
                            int hh = Integer.parseInt(timeMatcher.group(1));
                            int mm = Integer.parseInt(timeMatcher.group(2));
                            if (hh > 23 || mm > 59) continue;
                            int minutes = hh * 60 + mm;
                            if (minutes < 4 * 60) continue;
                            foundTimes++;
                            minMinutes = Math.min(minMinutes, minutes);
                            maxMinutes = Math.max(maxMinutes, minutes);
                        }
                        if (foundTimes >= 4 && minMinutes < maxMinutes) {
                            result.put("from", String.format(Locale.US, "%02d:%02d", minMinutes / 60, minMinutes % 60));
                            result.put("to", String.format(Locale.US, "%02d:%02d", maxMinutes / 60, maxMinutes % 60));
                            result.put("source", url.contains("kudikina.ru") ? "kudikina.ru" : "avtobus24.ru");
                            result.put("status", "ok");
                            emitTransportCallback("onRouteSchedule", result.toString(), String.valueOf(requestId));
                            return;
                        }
                    }

                    result.put("status", "not_found");
                    emitTransportCallback("onRouteSchedule", result.toString(), String.valueOf(requestId));
                } catch (Exception e) {
                    try {
                        result.put("status", "error");
                        result.put("error", friendlyError(e));
                    } catch (Exception ignored) {}
                    emitTransportCallback("onRouteSchedule", result.toString(), String.valueOf(requestId));
                }
            }).start();
        }

        private String transliterateRouteRef(String value) {
            String upper = value.toUpperCase(Locale.ROOT);
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < upper.length(); i++) {
                char ch = upper.charAt(i);
                if (ch >= '0' && ch <= '9') {
                    out.append(ch);
                    continue;
                }
                switch (ch) {
                    case 'А': out.append('a'); break;
                    case 'Б': out.append('b'); break;
                    case 'В': out.append('v'); break;
                    case 'Г': out.append('g'); break;
                    case 'Д': out.append('d'); break;
                    case 'Е': case 'Ё': out.append('e'); break;
                    case 'Ж': out.append("zh"); break;
                    case 'З': out.append('z'); break;
                    case 'И': case 'Й': out.append('i'); break;
                    case 'К': out.append('k'); break;
                    case 'Л': out.append('l'); break;
                    case 'М': out.append('m'); break;
                    case 'Н': out.append('n'); break;
                    case 'О': out.append('o'); break;
                    case 'П': out.append('p'); break;
                    case 'Р': out.append('r'); break;
                    case 'С': out.append('s'); break;
                    case 'Т': out.append('t'); break;
                    case 'У': out.append('u'); break;
                    case 'Ф': out.append('f'); break;
                    case 'Х': out.append('h'); break;
                    case 'Ц': out.append('c'); break;
                    case 'Ч': out.append("ch"); break;
                    case 'Ш': case 'Щ': out.append("sh"); break;
                    case 'Ы': out.append('y'); break;
                    case 'Э': out.append('e'); break;
                    case 'Ю': out.append("yu"); break;
                    case 'Я': out.append("ya"); break;
                    default:
                        if ((ch >= 'A' && ch <= 'Z') || ch == '-') out.append(Character.toLowerCase(ch));
                }
            }
            return out.toString();
        }

        private String fetchText(String url, int connectTimeoutMs, int readTimeoutMs) throws Exception {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(connectTimeoutMs);
                connection.setReadTimeout(readTimeoutMs);
                connection.setUseCaches(true);
                connection.setRequestProperty("Accept", "text/html,application/xhtml+xml");
                connection.setRequestProperty("Accept-Language", "ru-RU,ru;q=0.9");
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 RokinMaps/0.2.9");
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) return "";
                return readAll(connection.getInputStream());
            } finally {
                if (connection != null) connection.disconnect();
            }
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

            ExecutorService executor = Executors.newFixedThreadPool(endpoints.length);
            CompletionService<String> completion = new ExecutorCompletionService<>(executor);
            for (String endpoint : endpoints) {
                completion.submit(() -> requestOverpassEndpoint(
                        endpoint, query, connectTimeoutMs, readTimeoutMs
                ));
            }

            long deadline = System.currentTimeMillis() + Math.max(9000, readTimeoutMs + 2500L);
            Exception last = null;
            try {
                for (int i = 0; i < endpoints.length; i++) {
                    long remaining = deadline - System.currentTimeMillis();
                    if (remaining <= 0) break;
                    Future<String> future = completion.poll(remaining, TimeUnit.MILLISECONDS);
                    if (future == null) break;
                    try {
                        String body = future.get();
                        if (body != null && body.contains("{")) return body;
                    } catch (Exception e) {
                        last = e;
                    }
                }
            } finally {
                executor.shutdownNow();
            }

            if (last != null) throw last;
            throw new SocketTimeoutException("Overpass timeout");
        }

        private String requestOverpassEndpoint(
                String endpoint,
                String query,
                int connectTimeoutMs,
                int readTimeoutMs
        ) throws Exception {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(connectTimeoutMs);
                connection.setReadTimeout(readTimeoutMs);
                connection.setUseCaches(false);
                connection.setDoOutput(true);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty(
                        "Content-Type",
                        "application/x-www-form-urlencoded; charset=UTF-8"
                );
                connection.setRequestProperty("User-Agent", "RokinMaps/0.2.9 Android");

                String payload = "data=" + URLEncoder.encode(
                        query,
                        StandardCharsets.UTF_8.toString()
                );
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
                throw new RuntimeException("HTTP " + code);
            } finally {
                if (connection != null) connection.disconnect();
            }
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
