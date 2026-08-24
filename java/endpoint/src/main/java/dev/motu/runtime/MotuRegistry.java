package dev.motu.runtime;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.spi.Bean;
import jakarta.enterprise.inject.spi.BeanManager;
import jakarta.enterprise.inject.spi.CDI;
import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;
import jakarta.json.JsonValue;
import javax.naming.InitialContext;
import javax.naming.NamingException;

/**
 * Discovers {@link BrowserCallable} beans and resolves {@code service/method} pairs to reflected
 * {@link Method} handles. This is the only place motu reflects, and it never reflects on arbitrary
 * client input &mdash; an unknown service or method is a 404, never a probe.
 * <p>
 * The scan is lazy and uses {@link CDI#current()} at request time rather than an injected
 * {@link BeanManager}. motu-runtime lives in the EAR's shared {@code lib}, so a BeanManager
 * injected there resolves to the EAR/EJB module and cannot see beans defined inside a WAR
 * (e.g. JAX-RS resources like {@code CompanyGroupService}). At request time the thread context is
 * the WAR, so {@code CDI.current().getBeanManager()} sees both the WAR's beans and the EJB beans.
 */
@ApplicationScoped
public class MotuRegistry {

    private final Map<String, Map<String, ExposedMethod>> methods = new ConcurrentHashMap<>();
    private final Jsonb jsonb = JsonbBuilder.create();

    /** Pluggable positional-argument deserializer: JSON-B by default, host Jackson when present. */
    interface JsonBinder {
        Object fromJson(String json, java.lang.reflect.Type type);
    }

    private final JsonBinder jsonbBinder = (json, type) -> jsonb.fromJson(json, type);
    private volatile JsonBinder binder;
    private volatile boolean scanned;

    public static final class ExposedMethod {
        private final Class<?> beanClass;
        private final Method method;

        ExposedMethod(Class<?> beanClass, Method method) {
            this.beanClass = beanClass;
            this.method = method;
        }

        public Class<?> beanClass() {
            return beanClass;
        }

        public Method method() {
            return method;
        }
    }

    private void ensureScanned() {
        if (scanned) {
            return;
        }
        synchronized (this) {
            if (scanned) {
                return;
            }
            scan(currentBeanManager());
            scanned = true;
        }
    }

    /**
     * Returns the BeanManager of the current EE component via JNDI. During a request this is the
     * WAR's component, so its BeanManager sees the WAR's beans (e.g. JAX-RS resources) as well as
     * the accessible EJB/library beans. Injecting a BeanManager into motu-runtime instead would
     * bind to the EAR/library module, which structurally cannot see into a WAR.
     */
    static BeanManager currentBeanManager() {
        try {
            return (BeanManager) new InitialContext().lookup("java:comp/BeanManager");
        } catch (NamingException e) {
            // Fallback: the caller-module BeanManager (sufficient for EJB-module beans).
            return CDI.current().getBeanManager();
        }
    }

    private void scan(BeanManager beanManager) {
        Set<Bean<?>> beans = beanManager.getBeans(Object.class);
        for (Bean<?> bean : beans) {
            Class<?> type = bean.getBeanClass();
            if (type == null) {
                continue;
            }

            BrowserCallable classCallable = type.getAnnotation(BrowserCallable.class);
            boolean exposeClass = classCallable != null;
            boolean hasMethodCallables = hasBrowserCallableMethods(type);
            if (!exposeClass && !hasMethodCallables) {
                continue;
            }
            Map<String, ExposedMethod> byName = new HashMap<>();
            for (Method m : type.getMethods()) {
                if (m.getDeclaringClass() == Object.class || !Modifier.isPublic(m.getModifiers())) {
                    continue;
                }
                BrowserCallable methodCallable = m.getAnnotation(BrowserCallable.class);
                if (methodCallable == null && (!exposeClass || hasMethodCallables)) {
                    continue;
                }
                // Last one wins for overloads; motu binds positionally so overloads are ambiguous.
                byName.put(exposedName(m, methodCallable), new ExposedMethod(type, m));
            }
            if (!byName.isEmpty()) {
                methods.put(exposedServiceName(type, classCallable), byName);
            }
        }
        binder = resolveBinder();
    }

    /**
     * Prefers the host application's Jackson {@code ObjectMapper} (resolved reflectively through CDI,
     * so motu-runtime keeps no compile-time Jackson dependency). The host binds its own JSON DTOs
     * with its own configured deserializers &mdash; motu never reinterprets their shape. Falls back
     * to JSON-B when no Jackson mapper is on the classpath.
     */
    private JsonBinder resolveBinder() {
        try {
            Class<?> mapperType = Class.forName("com.fasterxml.jackson.databind.ObjectMapper");
            Instance<?> instance = CDI.current().select(mapperType);
            Object mapper = null;
            if (instance.isResolvable()) {
                mapper = instance.get();
            } else if (!instance.isUnsatisfied()) {
                mapper = instance.iterator().next();
            }
            if (mapper != null) {
                return new JacksonBinder(mapper, jsonbBinder);
            }
        } catch (Throwable ignored) {
            // No Jackson, no CDI container, or an ambiguous/absent mapper: JSON-B is the safe default.
        }
        return jsonbBinder;
    }

    /** Reflective adapter over the host's Jackson mapper; parameterized types defer to JSON-B. */
    private static final class JacksonBinder implements JsonBinder {
        private final Object mapper;
        private final java.lang.reflect.Method readValue;
        private final JsonBinder fallback;

        JacksonBinder(Object mapper, JsonBinder fallback) throws NoSuchMethodException {
            this.mapper = mapper;
            this.readValue = mapper.getClass().getMethod("readValue", String.class, Class.class);
            this.fallback = fallback;
        }

        @Override
        public Object fromJson(String json, java.lang.reflect.Type type) {
            if (type instanceof Class<?> raw) {
                try {
                    return readValue.invoke(mapper, json, raw);
                } catch (ReflectiveOperationException e) {
                    throw new IllegalArgumentException("motu: could not bind argument", e);
                }
            }
            return fallback.fromJson(json, type);
        }
    }

    private static boolean hasBrowserCallableMethods(Class<?> type) {
        for (Method method : type.getMethods()) {
            if (method.isAnnotationPresent(BrowserCallable.class)) {
                return true;
            }
        }
        return false;
    }

    private static String exposedServiceName(Class<?> type, BrowserCallable annotation) {
        return annotation == null || annotation.value().isBlank() ? type.getSimpleName() : annotation.value();
    }

    private static String exposedName(Method method, BrowserCallable annotation) {
        return annotation == null || annotation.value().isBlank() ? method.getName() : annotation.value();
    }

    /**
     * Returns the exposed method, or {@code null} if the service/method is unknown or unexposed.
     * Returning null (rather than throwing) lets the endpoint produce a clean 404 without the
     * host's greedy ExceptionMapper rewrapping it into a 500. Never leaks whether a bean merely
     * exists but is unexposed.
     */
    public ExposedMethod find(String service, String method) {
        ensureScanned();
        Map<String, ExposedMethod> byName = methods.get(service);
        if (byName == null) {
            return null;
        }
        return byName.get(method);
    }

    /**
     * Positional deserialization of a JSON array into the method's parameter types. Arity mismatch
     * throws {@link IllegalArgumentException}, which the endpoint maps to 400.
     */
    public Object[] bind(Method m, JsonValue args) {
        java.lang.reflect.Type[] paramTypes = m.getGenericParameterTypes();

        if (args == null || args.getValueType() == JsonValue.ValueType.NULL) {
            if (paramTypes.length == 0) {
                return new Object[0];
            }
            throw new IllegalArgumentException("Expected " + paramTypes.length + " argument(s), got none");
        }
        if (args.getValueType() != JsonValue.ValueType.ARRAY) {
            throw new IllegalArgumentException("Arguments must be a JSON array");
        }

        jakarta.json.JsonArray array = args.asJsonArray();
        if (array.size() != paramTypes.length) {
            throw new IllegalArgumentException(
                    "Expected " + paramTypes.length + " argument(s), got " + array.size());
        }

        JsonBinder active = binder;
        if (active == null) {
            active = jsonbBinder;
        }
        Object[] bound = new Object[paramTypes.length];
        for (int i = 0; i < paramTypes.length; i++) {
            String json = array.get(i).toString();
            bound[i] = active.fromJson(json, paramTypes[i]);
        }
        return bound;
    }
}
