package dev.motu.runtime;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Where a motu coverage beacon lands on a Java EE / Jakarta EE application — the same route
 * {@code @motujs/coverage/server} is for a JavaScript one, and the same answers, so
 * {@code motu coverage doctor} reads both alike.
 *
 * <p>REGISTERED BY {@code META-INF/web-fragment.xml} at {@code /motu/coverage} and
 * {@code /motu/coverage/known}: putting this jar in the WAR is the whole installation, with no
 * {@code web.xml} edit. The browser posts to the application's own origin and never to the motu host
 * (ad blockers, CORS, and a destination the application's privacy policy does not name).
 *
 * <p>TWO MODES, because a server in a corporate datacentre often has no outbound network at all:
 * <ul>
 *   <li>{@code forward} posts each report to the motu host with ONE secret, the ingest token. The host
 *       reads the repo from the token.</li>
 *   <li>{@code log} writes one {@code motu-coverage {…}} line to the server's log (JBoss: server.log)
 *       and needs nothing. {@code motu coverage pull --from <log>} uploads those lines later, from
 *       wherever the logs are collected.</li>
 * </ul>
 *
 * <p>CONFIGURATION, system property first, then environment: {@code motu.coverage.mode} /
 * {@code MOTU_COVERAGE_MODE} ({@code log} or {@code forward}, default forward),
 * {@code motu.coverage.host} / {@code MOTU_HOST_URL}, {@code motu.coverage.token} /
 * {@code MOTU_COVERAGE_TOKEN}, and optionally {@code motu.coverage.regions} /
 * {@code MOTU_COVERAGE_REGIONS} (comma-separated) to refuse a region a stranger types.
 *
 * <p>NEVER THROWS INTO THE PAGE. Validation is deliberately shallow, as on the JavaScript side: the
 * endpoint is public, and it checks the shape it is about to forward, not whether the states are true.
 * No JSON library either, so the jar runs in any servlet container without one.
 */
public class MotuCoverageServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = Logger.getLogger("motu.coverage");
    private static final int MAX_BYTES = 256 * 1024;
    private static final Pattern REGION = Pattern.compile("\"regionId\"\\s*:\\s*\"([A-Za-z0-9._-]{1,128})\"");
    private static final Pattern KEYS = Pattern.compile("\"keys\"\\s*:\\s*\\[");
    private static final Pattern ENTRIES = Pattern.compile("\"entries\"\\s*:\\s*\\[");

    // HTTP/1.1, NOT the default. Java's client prefers HTTP/2 and, on a plain http:// host, asks for it
    // with `Upgrade: h2c` — which the motu host hands to its live-reload socket handler, and which
    // answered 502 to every report. Found by running this against a real host; over https the
    // negotiation happens in TLS and never reaches the request.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    static String setting(String property, String env) {
        String v = System.getProperty(property);
        if (v == null || v.isBlank()) v = System.getenv(env);
        return v == null ? "" : v.trim();
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse res) throws IOException {
        if (req.getServletPath().endsWith("/known")) {
            res.setStatus(405);
            return;
        }
        String mode = "log".equals(setting("motu.coverage.mode", "MOTU_COVERAGE_MODE")) ? "log" : "forward";
        String host = setting("motu.coverage.host", "MOTU_HOST_URL").replaceAll("/+$", "");
        String token = setting("motu.coverage.token", "MOTU_COVERAGE_TOKEN");
        String repo = setting("motu.coverage.repo", "MOTU_COVERAGE_REPO");
        String regions = setting("motu.coverage.regions", "MOTU_COVERAGE_REGIONS");
        // A DOCTOR'S REPORT is synthetic: it proves the path and must never land in a real corpus.
        boolean doctor = "1".equals(req.getHeader("x-motu-doctor"));

        if ("forward".equals(mode) && (host.isEmpty() || token.isEmpty())) {
            String missing = host.isEmpty() && token.isEmpty()
                    ? "the host URL (motu.coverage.host) and the token (motu.coverage.token)"
                    : host.isEmpty() ? "the host URL (motu.coverage.host or MOTU_HOST_URL)" : "MOTU_COVERAGE_TOKEN (or motu.coverage.token)";
            answer(res, 503, "{\"ok\":false,\"error\":\"coverage forwarding is not configured — missing " + missing + "\"}", null);
            return;
        }

        String body;
        try {
            body = readLimited(req.getInputStream());
        } catch (TooLarge e) {
            answer(res, 413, "{\"ok\":false,\"error\":\"corpus larger than " + MAX_BYTES + " bytes\"}", null);
            return;
        }
        Matcher region = REGION.matcher(body);
        if (!body.trim().startsWith("{") || !region.find() || !KEYS.matcher(body).find() || !ENTRIES.matcher(body).find()) {
            answer(res, 400, "{\"ok\":false,\"error\":\"body must be a JSON corpus with regionId, keys and entries\"}", null);
            return;
        }
        String regionId = region.group(1);
        if (!regions.isEmpty() && !(("," + regions.replace(" ", "") + ",").contains("," + regionId + ","))) {
            answer(res, 400, "{\"ok\":false,\"error\":\"region \\\"" + regionId + "\\\" is not forwarded by this endpoint\"}", null);
            return;
        }

        if ("log".equals(mode)) {
            // ONE LINE: raw newlines cannot occur inside a JSON string, so folding them is lossless.
            LOG.info((doctor ? "motu-coverage-doctor " : "motu-coverage ") + body.replaceAll("[\\r\\n]+", " "));
            answer(res, 200, "{\"ok\":true}", "logged");
            return;
        }

        String url = host + "/api/coverage?region=" + enc(regionId)
                + (repo.isEmpty() ? "" : "&repo=" + enc(repo))
                + (doctor ? "&dryRun=1" : "");
        try {
            HttpResponse<String> up = http.send(
                    HttpRequest.newBuilder(URI.create(url))
                            .timeout(Duration.ofSeconds(10))
                            .header("authorization", "Bearer " + token)
                            .header("content-type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (up.statusCode() == 401) {
                answer(res, 502, "{\"ok\":false,\"error\":\"the motu host refused the ingest token (401) — mint one with `motu coverage init`\"}", "forwarded");
            } else if (up.statusCode() / 100 != 2) {
                answer(res, 502, "{\"ok\":false,\"error\":\"the motu host answered " + up.statusCode() + "\"}", "forwarded");
            } else {
                answer(res, 200, "{\"ok\":true}", "forwarded");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            answer(res, 502, "{\"ok\":false,\"error\":\"the motu host is unreachable: interrupted\"}", "forwarded");
        } catch (IOException e) {
            // The CAUSE, not "IOException": a refused connection, a DNS miss and a firewall timeout are
            // three different fixes, and this is often the only place that can tell them apart.
            // The CHAIN, outermost first: Java's client wraps a refused connection as ConnectException
            // around ClosedChannelException, and the innermost alone says little.
            StringBuilder chain = new StringBuilder();
            Throwable cause = e;
            for (int depth = 0; cause != null && depth < 4; depth++, cause = cause.getCause()) {
                if (chain.length() > 0) chain.append(" → ");
                chain.append(cause.getClass().getSimpleName());
                if (cause.getMessage() != null && !cause.getMessage().isBlank()) chain.append(": ").append(cause.getMessage());
            }
            String why = chain.toString().replace("\\", "/").replace("\"", "'");
            answer(res, 502, "{\"ok\":false,\"error\":\"the motu host is unreachable: " + why + "\"}", "forwarded");
        }
    }

    /**
     * The states somebody accepted, served back so the beacon stays quiet about them. An empty set is
     * the answer to every failure: at worst one extra report, never a wrong silence.
     */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res) throws IOException {
        if (!req.getServletPath().endsWith("/known")) {
            res.setStatus(405);
            return;
        }
        String host = setting("motu.coverage.host", "MOTU_HOST_URL").replaceAll("/+$", "");
        String token = setting("motu.coverage.token", "MOTU_COVERAGE_TOKEN");
        String repo = setting("motu.coverage.repo", "MOTU_COVERAGE_REPO");
        String region = req.getParameter("region");
        String h = req.getParameter("h");
        res.setContentType("application/json");
        if (host.isEmpty() || token.isEmpty() || region == null || h == null) {
            res.setHeader("cache-control", "no-store");
            res.getWriter().write("[]");
            return;
        }
        String url = host + "/api/coverage/known?region=" + enc(region) + "&h=" + enc(h) + (repo.isEmpty() ? "" : "&repo=" + enc(repo));
        try {
            HttpResponse<String> up = http.send(
                    HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5)).header("authorization", "Bearer " + token).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            String text = up.body() == null ? "" : up.body().trim();
            boolean array = up.statusCode() / 100 == 2 && text.startsWith("[") && text.endsWith("]");
            res.setHeader("cache-control", array ? "public, max-age=300, stale-while-revalidate=3600" : "no-store");
            res.getWriter().write(array ? text : "[]");
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            res.setHeader("cache-control", "no-store");
            res.getWriter().write("[]");
        }
    }

    private static void answer(HttpServletResponse res, int status, String json, String took) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.setCharacterEncoding("UTF-8");
        res.setHeader("cache-control", "no-store");
        // Which path the report took, so `motu coverage doctor` can tell forwarded from logged.
        if (took != null) res.setHeader("x-motu-coverage", took);
        res.getWriter().write(json);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static final class TooLarge extends Exception {
        private static final long serialVersionUID = 1L;
    }

    private static String readLimited(InputStream in) throws IOException, TooLarge {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) {
            if (out.size() + n > MAX_BYTES) throw new TooLarge();
            out.write(buf, 0, n);
        }
        return out.toString(StandardCharsets.UTF_8);
    }
}
