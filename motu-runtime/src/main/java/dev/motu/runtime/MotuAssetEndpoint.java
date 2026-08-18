package dev.motu.runtime;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.Response;

/**
 * Serves the compiled frontend bundle ({@code bridge.js}) straight from the classpath — the
 * "WebJar" approach from the motu plan. Deploying {@code motu-runtime.jar} then provides both the
 * dispatcher and the bridge asset as a single self-contained artifact, independent of the host
 * WAR's build pipeline (which cleans and regenerates its static {@code dist/} directory).
 * <p>
 * The Content-Type is set explicitly on the response builder (not just via {@code @Produces}),
 * because RESTEasy negotiation left the raw body as {@code text/plain}, which browsers with strict
 * MIME checking refuse to execute as a script.
 */
@Path("/motu")
@ApplicationScoped
public class MotuAssetEndpoint {

    private static final String BUNDLE = "/dev/motu/assets/bridge.js";
    private static final String JS_MIME = "text/javascript";

    @GET
    @Path("bridge.js")
    @Produces(JS_MIME)
    public Response bridge() {
        byte[] body = readBundle();
        if (body == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity("// motu: bridge.js not bundled".getBytes())
                    .type(JS_MIME)
                    .build();
        }
        CacheControl cc = new CacheControl();
        cc.setNoStore(true);
        return Response.ok(body)
                .type(JS_MIME)
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(cc)
                .build();
    }

    private static byte[] readBundle() {
        try (InputStream in = MotuAssetEndpoint.class.getResourceAsStream(BUNDLE)) {
            if (in == null) {
                return null;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream(160_000);
            in.transferTo(out);
            return out.toByteArray();
        } catch (IOException e) {
            return null;
        }
    }
}
