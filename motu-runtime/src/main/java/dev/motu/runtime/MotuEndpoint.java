package dev.motu.runtime;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.spi.Bean;
import jakarta.enterprise.inject.spi.BeanManager;
import jakarta.inject.Inject;
import jakarta.json.JsonValue;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * The single browser-facing entry point. It resolves the requested service/method, then invokes it
 * through the CDI contextual reference so that the application's existing interceptor chain
 * (authorization, transactions, etc.) fires unchanged.
 * <p>
 * motu reimplements no business logic and no authorization. The invoked bean is obtained as a CDI
 * contextual reference, so the host's {@code RolesInterceptor} runs and throws
 * {@link IllegalAccessError} on denial exactly as it does for any other caller. motu's only job is
 * to translate that pre-existing decision into an HTTP status.
 * <p>
 * IMPORTANT: this endpoint deliberately <em>returns</em> {@link Response} objects rather than
 * throwing. The host app registers a greedy {@code ExceptionMapper<Throwable>} that rewraps any
 * propagating exception into a {@code RuntimeException} (surfacing as HTTP 500), which would erase
 * motu's status semantics. By catching here and returning explicit statuses, the codes survive the
 * host's monitor filter (which preserves them on the success path).
 */
@Path("/motu")
@ApplicationScoped
public class MotuEndpoint {

    @Inject
    MotuRegistry registry;

    @POST
    @Path("{service}/{method}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response invoke(@PathParam("service") String service,
                           @PathParam("method") String method,
                           JsonValue args) {

        MotuRegistry.ExposedMethod exposed = registry.find(service, method);
        if (exposed == null) {
            // Deny-by-default: unexposed or unknown -> indistinguishable 404, never a probe.
            return status(Response.Status.NOT_FOUND, "motu: no such service/method");
        }

        Method m = exposed.method();

        Object[] bound;
        try {
            bound = registry.bind(m, args);
        } catch (IllegalArgumentException e) {
            return status(Response.Status.BAD_REQUEST, e.getMessage());
        }

        // Contextual reference == client proxy == interceptor chain intact.
        // Resolve through the current EE component's BeanManager (the WAR's), so beans defined in
        // the WAR are visible; a BeanManager bound to motu-runtime's own (EAR/library) module
        // cannot see into a WAR. Using getReference (not `new`) keeps the @Roles/RolesInterceptor
        // chain firing — the entire thesis of motu.
        BeanManager bm = MotuRegistry.currentBeanManager();
        Class<?> beanClass = exposed.beanClass();
        Bean<?> beanDef = bm.resolve(bm.getBeans(beanClass));
        if (beanDef == null) {
            return status(Response.Status.NOT_FOUND, "motu: no such service/method");
        }
        Object bean = bm.getReference(beanDef, beanClass, bm.createCreationalContext(beanDef));

        try {
            Object result = m.invoke(bean, bound);
            return Response.ok(result == null ? JsonValue.NULL : result).build();
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IllegalAccessError) {
                // Authorization decision made by the host's existing RolesInterceptor. motu did not
                // decide anything — it only maps that decision to 403. Echo the interceptor's own
                // message to make the provenance auditable.
                return status(Response.Status.FORBIDDEN,
                        "motu: denied by host authorization: " + cause.getMessage());
            }
            // A genuine business exception from the bean. Surface as 500 without leaking internals.
            return status(Response.Status.INTERNAL_SERVER_ERROR, "motu: service error");
        } catch (IllegalAccessException e) {
            // Reflection-level failure (method not accessible) — a motu bug, not an authz outcome.
            return status(Response.Status.INTERNAL_SERVER_ERROR, "motu: invocation error");
        }
    }

    private static Response status(Response.Status status, String message) {
        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity("{\"error\":" + quote(message) + "}")
                .build();
    }

    private static String quote(String s) {
        if (s == null) return "null";
        return '"' + s.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
