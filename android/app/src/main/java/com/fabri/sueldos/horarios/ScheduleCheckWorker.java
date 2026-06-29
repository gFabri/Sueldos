package com.fabri.sueldos.horarios;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ScheduleCheckWorker extends Worker {
    private static final String BASE_URL = "https://autogestion.tiendainglesa.net";
    private static final String LOGIN_URL = BASE_URL + "/login.php";
    private static final String EMPLOYEE_NUMBER = "29548";
    private static final String PASSWORD = "52059150";
    private static final String PREFS = "schedule_check_worker";
    private static final String LAST_HASH = "last_schedule_hash";
    private static final String INITIALIZED = "initialized";
    private static final int NOTIFICATION_ID = 29548;

    public ScheduleCheckWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            String html = loginAndFetchHtml();
            if (html == null || html.trim().isEmpty()) return Result.retry();

            String lower = html.toLowerCase(Locale.ROOT);
            if (lower.contains("datos de acceso no son validos") || lower.contains("no tienes acceso")) {
                return Result.failure();
            }
            if (lower.contains("en caso de no contar con las credenciales")) {
                return Result.retry();
            }

            String nextHash = sha256(extractNextWeekSignature(html));
            SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean initialized = prefs.getBoolean(INITIALIZED, false);
            String previousHash = prefs.getString(LAST_HASH, "");

            prefs.edit()
                    .putBoolean(INITIALIZED, true)
                    .putString(LAST_HASH, nextHash)
                    .apply();

            if (initialized && !previousHash.isEmpty() && !previousHash.equals(nextHash)) {
                showScheduleNotification();
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    private String loginAndFetchHtml() throws Exception {
        List<String> cookies = new ArrayList<>();
        HttpResult loginPage = request("GET", LOGIN_URL, null, null, cookies);
        cookies.addAll(loginPage.cookies);

        String action = findFormAction(loginPage.body);
        String loginActionUrl = buildAbsoluteUrl(action);
        String body = buildLoginBody(loginPage.body);

        HttpResult response = request(
                "POST",
                loginActionUrl,
                body,
                "application/x-www-form-urlencoded",
                cookies
        );

        return response.body;
    }

    private HttpResult request(String method, String urlValue, String body, String contentType, List<String> cookies) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setRequestMethod(method);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) Horarios/1.0");
        connection.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");

        if (!cookies.isEmpty()) {
            connection.setRequestProperty("Cookie", String.join("; ", cookies));
        }

        if (body != null) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", contentType);
            connection.setRequestProperty("Content-Length", String.valueOf(bytes.length));
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }

        List<String> nextCookies = new ArrayList<>();
        List<String> setCookieHeaders = connection.getHeaderFields().get("Set-Cookie");
        if (setCookieHeaders != null) {
            for (String setCookie : setCookieHeaders) {
                int end = setCookie.indexOf(';');
                nextCookies.add(end >= 0 ? setCookie.substring(0, end) : setCookie);
            }
        }

        InputStream stream = connection.getResponseCode() >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String responseBody = readStream(stream);
        connection.disconnect();
        return new HttpResult(responseBody, nextCookies);
    }

    private String buildLoginBody(String loginHtml) throws Exception {
        List<String> parts = new ArrayList<>();
        Pattern hiddenPattern = Pattern.compile("<input[^>]+type=[\"']hidden[\"'][^>]*>", Pattern.CASE_INSENSITIVE);
        Matcher matcher = hiddenPattern.matcher(loginHtml == null ? "" : loginHtml);
        while (matcher.find()) {
            String input = matcher.group();
            String name = findAttribute(input, "name");
            if (name == null || name.isEmpty()) continue;
            String value = findAttribute(input, "value");
            parts.add(encode(name) + "=" + encode(value == null ? "" : value));
        }

        parts.add("usuario=" + encode(EMPLOYEE_NUMBER));
        parts.add("clave=" + encode(PASSWORD));
        parts.add("numero=" + encode(EMPLOYEE_NUMBER));
        parts.add("pass=" + encode(PASSWORD));
        return String.join("&", parts);
    }

    private String findFormAction(String html) {
        Pattern formPattern = Pattern.compile("<form[^>]+action=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
        Matcher matcher = formPattern.matcher(html == null ? "" : html);
        return matcher.find() ? matcher.group(1) : LOGIN_URL;
    }

    private String findAttribute(String html, String attribute) {
        Pattern pattern = Pattern.compile(attribute + "=[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(html);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String buildAbsoluteUrl(String action) {
        if (action == null || action.trim().isEmpty() || "#".equals(action.trim())) return LOGIN_URL;
        if (action.startsWith("http")) return action;
        if (action.startsWith("/")) return BASE_URL + action;
        return BASE_URL + "/" + action;
    }

    private String extractNextWeekSignature(String html) {
        if (html == null) return "";

        String currentDay = "";
        Matcher currentDateMatcher = Pattern.compile("FECHA ACTUAL:\\s*(\\d{1,2})-\\d{1,2}-\\d{4}", Pattern.CASE_INSENSITIVE)
                .matcher(stripTags(html));
        if (currentDateMatcher.find()) {
            currentDay = String.format(Locale.ROOT, "%02d", Integer.parseInt(currentDateMatcher.group(1)));
        }

        List<WeekBlock> weekBlocks = new ArrayList<>();
        Pattern rowPattern = Pattern.compile("<tr[^>]*>(.*?)</tr>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        Matcher rowMatcher = rowPattern.matcher(html);
        List<String> rows = new ArrayList<>();
        while (rowMatcher.find()) rows.add(rowMatcher.group(1));

        for (int i = 0; i < rows.size() - 1; i++) {
            List<String> headers = extractCells(rows.get(i), "th");
            if (headers.size() != 7 || !looksLikeWeekHeader(headers)) continue;

            List<String> values = extractCells(rows.get(i + 1), "td");
            if (values.size() != 7) continue;

            List<String> dayNumbers = new ArrayList<>();
            for (String header : headers) {
                Matcher dayMatcher = Pattern.compile("(\\d{1,2})\\s*$").matcher(header);
                dayNumbers.add(dayMatcher.find() ? String.format(Locale.ROOT, "%02d", Integer.parseInt(dayMatcher.group(1))) : "");
            }
            weekBlocks.add(new WeekBlock(dayNumbers, values));
        }

        if (!weekBlocks.isEmpty()) {
            int currentIndex = -1;
            if (!currentDay.isEmpty()) {
                for (int i = 0; i < weekBlocks.size(); i++) {
                    if (weekBlocks.get(i).dayNumbers.contains(currentDay)) {
                        currentIndex = i;
                        break;
                    }
                }
            }

            int nextIndex = currentIndex >= 0 && currentIndex + 1 < weekBlocks.size()
                    ? currentIndex + 1
                    : weekBlocks.size() - 1;
            return "NEXT_WEEK:" + String.join("|", weekBlocks.get(nextIndex).values);
        }

        return html
                .replaceAll("(?i)FECHA ACTUAL:\\s*\\d{1,2}-\\d{1,2}-\\d{4}", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private List<String> extractCells(String rowHtml, String tag) {
        List<String> cells = new ArrayList<>();
        Pattern cellPattern = Pattern.compile("<" + tag + "[^>]*>(.*?)</" + tag + ">", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        Matcher cellMatcher = cellPattern.matcher(rowHtml);
        while (cellMatcher.find()) {
            cells.add(stripTags(cellMatcher.group(1)).replaceAll("\\s+", " ").trim());
        }
        return cells;
    }

    private boolean looksLikeWeekHeader(List<String> headers) {
        for (String header : headers) {
            String lower = header.toLowerCase(Locale.ROOT);
            if (!lower.contains("lunes")
                    && !lower.contains("martes")
                    && !lower.contains("miercoles")
                    && !lower.contains("miércoles")
                    && !lower.contains("jueves")
                    && !lower.contains("viernes")
                    && !lower.contains("sabado")
                    && !lower.contains("sábado")
                    && !lower.contains("domingo")) {
                return false;
            }
        }
        return true;
    }

    private String stripTags(String html) {
        return html
                .replaceAll("<script[^>]*>.*?</script>", " ")
                .replaceAll("<style[^>]*>.*?</style>", " ")
                .replaceAll("<[^>]+>", " ");
    }

    private String sha256(String text) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        for (byte b : hash) builder.append(String.format("%02x", b));
        return builder.toString();
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
        }
        return builder.toString();
    }

    private String encode(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    private void showScheduleNotification() {
        Intent intent = new Intent(getApplicationContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                getApplicationContext(),
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getApplicationContext(), MainActivity.NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(getApplicationContext().getApplicationInfo().icon)
                .setContentTitle("Horarios actualizados")
                .setContentText("Se detecto un cambio en la semana siguiente.")
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        try {
            NotificationManagerCompat.from(getApplicationContext()).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Android 13+ requires runtime notification permission.
        }
    }

    private static class HttpResult {
        final String body;
        final List<String> cookies;

        HttpResult(String body, List<String> cookies) {
            this.body = body;
            this.cookies = cookies;
        }
    }

    private static class WeekBlock {
        final List<String> dayNumbers;
        final List<String> values;

        WeekBlock(List<String> dayNumbers, List<String> values) {
            this.dayNumbers = dayNumbers;
            this.values = values;
        }
    }
}
