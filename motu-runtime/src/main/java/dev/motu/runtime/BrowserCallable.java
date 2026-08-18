package dev.motu.runtime;

import static java.lang.annotation.ElementType.METHOD;
import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Retention;
import java.lang.annotation.Target;

/**
 * Marks an existing CDI service bean, or selected public methods on one, as callable from the
 * browser through motu. A class-level value can also name the browser service for method-level
 * annotations on that class.
 * <p>
 * This is deny-by-default plumbing: a bean is reachable over HTTP only if the class or method
 * carries this annotation. motu never reimplements authorization &mdash; annotated methods are still
 * invoked through their CDI contextual reference, so the application's existing interceptors (e.g.
 * {@code RolesInterceptor}) fire exactly as they do for any other caller.
 */
@Target({ TYPE, METHOD })
@Retention(RUNTIME)
public @interface BrowserCallable {
	/** Optional service or method alias. Defaults to the class simple name or Java method name. */
	String value() default "";
}
