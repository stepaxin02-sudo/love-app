package io.rokinmap;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
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
import org.json.JSONArray;

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
    private TextToSpeech textToSpeech;
    private boolean navigationActive = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#0B0F17"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B0F17"));

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        textToSpeech = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS && textToSpeech != null) {
                textToSpeech.setLanguage(new Locale("ru", "RU"));
                textToSpeech.setSpeechRate(1.0f);
                textToSpeech.setPitch(1.0f);
            }
        });

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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBlockNetworkLoads(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + " RokinMaps/0.2.15");

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
        public void setNavigationActive(boolean active) {
            navigationActive = active;
            runOnUiThread(() -> {
                if (active) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void speak(String text) {
            if (text == null || text.trim().isEmpty()) return;
            runOnUiThread(() -> {
                if (textToSpeech != null) {
                    textToSpeech.speak(
                            text,
                            TextToSpeech.QUEUE_FLUSH,
                            null,
                            "rokin-nav-" + System.currentTimeMillis()
                    );
                }
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (textToSpeech != null) textToSpeech.stop();
            });
        }

        @JavascriptInterface
        public void fetchSearchSuggestions(
                String query,
                double lat,
                double lon,
                String bbox,
                String countryCode,
                int requestId
        ) {
            new Thread(() -> {
                String q = query == null ? "" : query.trim();
                if (q.length() < 2) {
                    emitTransportCallback(
                            "onSearchSuggestions",
                            "{\"features\":[]}",
                            String.valueOf(requestId)
                    );
                    return;
                }

                String encoded;
                try {
                    encoded = URLEncoder.encode(q, StandardCharsets.UTF_8.toString());
                } catch (Exception e) {
                    emitTransportCallback(
                            "onSearchSuggestionsError",
                            "не удалось подготовить запрос",
                            String.valueOf(requestId)
                    );
                    return;
                }

                String bias = "";
                if (Double.isFinite(lat) && Double.isFinite(lon)) {
                    bias = "&lat=" + String.format(Locale.US, "%.6f", lat)
                            + "&lon=" + String.format(Locale.US, "%.6f", lon)
                            + "&zoom=13&location_bias_scale=0.15";
                }

                String fullFilters = "";
                if (bbox != null && !bbox.trim().isEmpty()) {
                    try {
                        fullFilters += "&bbox=" + URLEncoder.encode(
                                bbox.trim(),
                                StandardCharsets.UTF_8.toString()
                        );
                    } catch (Exception ignored) {}
                }
                if (countryCode != null && !countryCode.trim().isEmpty()) {
                    try {
                        fullFilters += "&countrycode=" + URLEncoder.encode(
                                countryCode.trim().toUpperCase(Locale.ROOT),
                                StandardCharsets.UTF_8.toString()
                        );
                    } catch (Exception ignored) {}
                }

                String[] endpoints = new String[]{
                        "https://photon.komoot.io/api?q=" + encoded
                                + "&limit=8&lang=ru" + bias + fullFilters,
                        "https://photon.komoot.io/api?q=" + encoded
                                + "&limit=8&lang=ru" + bias,
                        "https://photon.komoot.io/api?q=" + encoded
                                + "&limit=8" + bias,
                        "https://photon.komoot.io/api?q=" + encoded
                                + "&limit=8"
                };

                String lastError = "поиск временно недоступен";
                for (String endpoint : endpoints) {
                    HttpURLConnection connection = null;
                    try {
                        connection = (HttpURLConnection) new URL(endpoint).openConnection();
                        connection.setRequestMethod("GET");
                        connection.setConnectTimeout(6000);
                        connection.setReadTimeout(8000);
                        connection.setUseCaches(true);
                        connection.setRequestProperty("Accept", "application/json");
                        connection.setRequestProperty("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.6");
                        connection.setRequestProperty("User-Agent", "RokinMaps/0.2.15 Android");

                        int code = connection.getResponseCode();
                        InputStream stream = code >= 200 && code < 300
                                ? connection.getInputStream()
                                : connection.getErrorStream();
                        String body = readAll(stream);

                        if (code >= 200 && code < 300 && body != null && body.contains("\"features\"")) {
                            emitTransportCallback(
                                    "onSearchSuggestions",
                                    body,
                                    String.valueOf(requestId)
                            );
                            return;
                        }
                        lastError = "Photon HTTP " + code;
                    } catch (Exception e) {
                        lastError = friendlyError(e);
                    } finally {
                        if (connection != null) connection.disconnect();
                    }
                }

                emitTransportCallback(
                        "onSearchSuggestionsError",
                        lastError,
                        String.valueOf(requestId)
                );
            }).start();
        }

        @JavascriptInterface
        public void fetchExactSearch(
                String query,
                String city,
                String countryCode,
                int requestId
        ) {
            new Thread(() -> {
                HttpURLConnection connection = null;
                try {
                    String q = query == null ? "" : query.trim();
                    String cityText = city == null ? "" : city.trim();
                    if (!cityText.isEmpty()
                            && !q.toLowerCase(Locale.ROOT)
                            .contains(cityText.toLowerCase(Locale.ROOT))) {
                        q = q + ", " + cityText;
                    }

                    StringBuilder endpoint = new StringBuilder(
                            "https://nominatim.openstreetmap.org/search"
                                    + "?format=jsonv2"
                                    + "&limit=8"
                                    + "&addressdetails=1"
                                    + "&accept-language=ru"
                                    + "&q="
                    );
                    endpoint.append(URLEncoder.encode(
                            q,
                            StandardCharsets.UTF_8.toString()
                    ));

                    if (countryCode != null && !countryCode.trim().isEmpty()) {
                        endpoint.append("&countrycodes=").append(
                                URLEncoder.encode(
                                        countryCode.trim().toLowerCase(Locale.ROOT),
                                        StandardCharsets.UTF_8.toString()
                                )
                        );
                    }

                    connection = (HttpURLConnection) new URL(endpoint.toString()).openConnection();
                    connection.setRequestMethod("GET");
                    connection.setConnectTimeout(7000);
                    connection.setReadTimeout(10000);
                    connection.setUseCaches(false);
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setRequestProperty("Accept-Language", "ru-RU,ru;q=0.9");
                    connection.setRequestProperty("User-Agent", "RokinMaps/0.2.15 Android");

                    int code = connection.getResponseCode();
                    InputStream stream = code >= 200 && code < 300
                            ? connection.getInputStream()
                            : connection.getErrorStream();
                    String body = readAll(stream);

                    if (code >= 200 && code < 300 && body != null && body.startsWith("[")) {
                        emitTransportCallback(
                                "onExactSearch",
                                body,
                                String.valueOf(requestId)
                        );
                    } else {
                        emitTransportCallback(
                                "onExactSearchError",
                                "точный поиск временно недоступен",
                                String.valueOf(requestId)
                        );
                    }
                } catch (Exception e) {
                    emitTransportCallback(
                            "onExactSearchError",
                            friendlyError(e),
                            String.valueOf(requestId)
                    );
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }).start();
        }

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
                        connection.setRequestProperty("User-Agent", "RokinMaps/0.2.15 Android");

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
        public void fetchPlannerStops(
                double originLat,
                double originLon,
                double destinationLat,
                double destinationLon,
                int requestId
        ) {
            new Thread(() -> {
                String query = String.format(
                        Locale.US,
                        "[out:json][timeout:8];("
                                + "node(around:1500,%.6f,%.6f)[\"highway\"=\"bus_stop\"];"
                                + "node(around:1500,%.6f,%.6f)[\"public_transport\"=\"platform\"];"
                                + "node(around:900,%.6f,%.6f)[\"highway\"=\"bus_stop\"];"
                                + "node(around:900,%.6f,%.6f)[\"public_transport\"=\"platform\"];"
                                + ");out tags 240;",
                        originLat, originLon,
                        originLat, originLon,
                        destinationLat, destinationLon,
                        destinationLat, destinationLon
                );
                try {
                    String body = requestOverpass(query, 5500, 9000);
                    emitTransportCallback(
                            "onPlannerStops",
                            body,
                            String.valueOf(requestId)
                    );
                } catch (Exception e) {
                    emitTransportCallback(
                            "onPlannerStopsError",
                            friendlyError(e),
                            String.valueOf(requestId)
                    );
                }
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
        public void fetchRoutesForStops(String stopsJson, int requestId) {
            new Thread(() -> {
                try {
                    JSONArray stops = new JSONArray(stopsJson == null ? "[]" : stopsJson);
                    StringBuilder nodes = new StringBuilder();
                    StringBuilder ways = new StringBuilder();
                    StringBuilder relations = new StringBuilder();

                    int added = 0;
                    for (int i = 0; i < stops.length() && added < 80; i++) {
                        JSONObject stop = stops.optJSONObject(i);
                        if (stop == null) continue;
                        long id = stop.optLong("id", 0);
                        String type = stop.optString("type", "node");
                        if (id <= 0) continue;
                        if ("way".equals(type)) ways.append("way(").append(id).append(");");
                        else if ("relation".equals(type)) relations.append("relation(").append(id).append(");");
                        else nodes.append("node(").append(id).append(");");
                        added++;
                    }

                    if (added == 0) {
                        emitTransportCallback("onRoutesForStops", "{\"elements\":[]}", String.valueOf(requestId));
                        return;
                    }

                    StringBuilder query = new StringBuilder("[out:json][timeout:15];");
                    if (nodes.length() > 0) query.append("(").append(nodes).append(")->.n;");
                    if (ways.length() > 0) query.append("(").append(ways).append(")->.w;");
                    if (relations.length() > 0) query.append("(").append(relations).append(")->.r;");
                    query.append("(");
                    if (nodes.length() > 0) {
                        query.append("rel(bn.n)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    if (ways.length() > 0) {
                        query.append("rel(bw.w)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    if (relations.length() > 0) {
                        query.append("rel(br.r)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    query.append(");out body 300;");

                    String body = requestOverpass(query.toString(), 7000, 13000);
                    emitTransportCallback("onRoutesForStops", body, String.valueOf(requestId));
                } catch (Exception e) {
                    emitTransportCallback(
                            "onRoutesForStopsError",
                            friendlyError(e),
                            String.valueOf(requestId)
                    );
                }
            }).start();
        }

        @JavascriptInterface
        public void fetchDirectRoutes(String originStopsJson, String destinationStopsJson, int requestId) {
            new Thread(() -> {
                try {
                    JSONArray originStops = new JSONArray(originStopsJson == null ? "[]" : originStopsJson);
                    JSONArray destinationStops = new JSONArray(destinationStopsJson == null ? "[]" : destinationStopsJson);

                    StringBuilder nodes = new StringBuilder();
                    StringBuilder ways = new StringBuilder();
                    StringBuilder relations = new StringBuilder();
                    java.util.HashSet<String> seen = new java.util.HashSet<>();

                    JSONArray[] groups = new JSONArray[]{originStops, destinationStops};
                    for (JSONArray group : groups) {
                        int addedForGroup = 0;
                        for (int i = 0; i < group.length() && addedForGroup < 80; i++) {
                            JSONObject stop = group.optJSONObject(i);
                            if (stop == null) continue;
                            long id = stop.optLong("id", 0);
                            String type = stop.optString("type", "node");
                            if (id <= 0) continue;
                            String key = type + ":" + id;
                            if (!seen.add(key)) continue;

                            if ("way".equals(type)) ways.append("way(").append(id).append(");");
                            else if ("relation".equals(type)) relations.append("relation(").append(id).append(");");
                            else nodes.append("node(").append(id).append(");");
                            addedForGroup++;
                        }
                    }

                    if (seen.isEmpty()) {
                        emitTransportCallback("onDirectRoutes", "{\"elements\":[]}", String.valueOf(requestId));
                        return;
                    }

                    StringBuilder query = new StringBuilder("[out:json][timeout:18];");
                    if (nodes.length() > 0) query.append("(").append(nodes).append(")->.n;");
                    if (ways.length() > 0) query.append("(").append(ways).append(")->.w;");
                    if (relations.length() > 0) query.append("(").append(relations).append(")->.r;");
                    query.append("(");
                    if (nodes.length() > 0) {
                        query.append("rel(bn.n)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    if (ways.length() > 0) {
                        query.append("rel(bw.w)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    if (relations.length() > 0) {
                        query.append("rel(br.r)[\"type\"=\"route\"][\"route\"~\"^(bus|trolleybus|tram|share_taxi)$\"];");
                    }
                    query.append(");out body 500;");

                    String body = requestOverpass(query.toString(), 7000, 15000);
                    emitTransportCallback("onDirectRoutes", body, String.valueOf(requestId));
                } catch (Exception e) {
                    emitTransportCallback(
                            "onDirectRoutesError",
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
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 RokinMaps/0.2.10");
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
                    "https://overpass.private.coffee/api/interpreter",
                    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
                    "https://overpass-api.de/api/interpreter",
                    "https://overpass.osm.jp/api/interpreter"
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
                        Throwable cause = e;
                        if (e instanceof java.util.concurrent.ExecutionException && e.getCause() != null) {
                            cause = e.getCause();
                        }
                        if (cause instanceof Exception) last = (Exception) cause;
                        else last = new RuntimeException(cause == null ? "unknown" : cause.getMessage());
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
                connection.setRequestProperty("User-Agent", "RokinMaps/0.2.15 Android");

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
            Throwable current = e;
            while (current instanceof java.util.concurrent.ExecutionException && current.getCause() != null) {
                current = current.getCause();
            }
            if (current instanceof SocketTimeoutException) return "сервер не успел ответить";
            String message = current == null ? "" : current.getMessage();
            if (message != null && message.startsWith("HTTP ")) {
                if (message.contains("429")) return "сервер временно ограничил запросы";
                if (message.contains("504") || message.contains("502") || message.contains("503")) {
                    return "сервер маршрутов временно перегружен";
                }
                return "сервер маршрутов ответил с ошибкой";
            }
            String name = current == null ? "" : current.getClass().getSimpleName();
            if ("UnknownHostException".equals(name)) return "нет соединения с сервером";
            if ("ConnectException".equals(name)) return "сервер маршрутов недоступен";
            if ("SSLException".equals(name) || "SSLHandshakeException".equals(name)) return "ошибка защищённого соединения";
            return "не удалось получить данные маршрутов";
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
    protected void onDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (navigationActive && webView != null) {
            webView.evaluateJavascript(
                    "window.RokinNavigationStop&&window.RokinNavigationStop()",
                    null
            );
            return;
        }
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
