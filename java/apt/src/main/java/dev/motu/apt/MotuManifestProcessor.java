package dev.motu.apt;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.annotation.processing.AbstractProcessor;
import javax.annotation.processing.RoundEnvironment;
import javax.annotation.processing.SupportedAnnotationTypes;
import javax.annotation.processing.SupportedSourceVersion;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.AnnotationMirror;
import javax.lang.model.element.AnnotationValue;
import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.Modifier;
import javax.lang.model.element.TypeElement;
import javax.lang.model.element.VariableElement;
import javax.lang.model.type.DeclaredType;
import javax.lang.model.type.TypeKind;
import javax.lang.model.type.TypeMirror;
import javax.tools.Diagnostic;
import javax.tools.FileObject;
import javax.tools.StandardLocation;

/**
 * Emits {@code motu-manifest.json} describing every {@code @BrowserCallable} bean: its methods,
 * their positional parameter types, return types (mapped to TypeScript), and the roles declared by
 * the host's {@code @Roles} annotation. A downstream Node CLI turns this manifest into the typed
 * {@code @motu/contract} package, so the browser contract is generated, not hand-written, and
 * stays pinned to the compiled backend.
 * <p>
 * The processor is deliberately dependency-free: it resolves the motu and host annotations by
 * fully-qualified name, so it couples to neither motu-runtime nor the host application.
 */
@SupportedAnnotationTypes("dev.motu.runtime.BrowserCallable")
@SupportedSourceVersion(SourceVersion.RELEASE_17)
public class MotuManifestProcessor extends AbstractProcessor {

    private static final String BROWSER_CALLABLE = "dev.motu.runtime.BrowserCallable";
    private static final String ROLES = "com.example.core.cdi.Roles";

    /** Accumulated across rounds; written once processing completes. */
    private final Map<String, ServiceModel> services = new LinkedHashMap<>();

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        TypeElement browserCallable = processingEnv.getElementUtils().getTypeElement(BROWSER_CALLABLE);
        if (browserCallable != null) {
            for (Element e : roundEnv.getElementsAnnotatedWith(browserCallable)) {
                if (e.getKind() == ElementKind.CLASS || e.getKind() == ElementKind.INTERFACE) {
                    scanServiceType((TypeElement) e);
                } else if (e.getKind() == ElementKind.METHOD) {
                    scanMethod((ExecutableElement) e);
                }
            }
        }

        if (roundEnv.processingOver() && !services.isEmpty()) {
            writeManifest();
        }
        return false; // don't claim the annotations; other processors may also observe them
    }

    /** Class-level @BrowserCallable: expose all public methods, UNLESS the class also uses
     *  method-level annotations (in which case those are authoritative, matching MotuRegistry). */
    private void scanServiceType(TypeElement type) {
        boolean hasMethodLevel = type.getEnclosedElements().stream()
                .anyMatch(m -> m.getKind() == ElementKind.METHOD && browserCallable(m) != null);
        if (hasMethodLevel) {
            return; // method-level scanMethod() calls will handle it
        }
        String serviceName = serviceName(type);
        ServiceModel model = services.computeIfAbsent(serviceName, ServiceModel::new);
        for (Element member : type.getEnclosedElements()) {
            if (member.getKind() != ElementKind.METHOD) {
                continue;
            }
            ExecutableElement method = (ExecutableElement) member;
            if (!method.getModifiers().contains(Modifier.PUBLIC)
                    || method.getModifiers().contains(Modifier.STATIC)) {
                continue;
            }
            model.methods.add(methodModel(method, method.getSimpleName().toString(), type));
        }
    }

    /** Method-level @BrowserCallable("alias") on an individual method. */
    private void scanMethod(ExecutableElement method) {
        TypeElement type = (TypeElement) method.getEnclosingElement();
        String serviceName = serviceName(type);
        ServiceModel model = services.computeIfAbsent(serviceName, ServiceModel::new);
        String alias = browserCallableValue(method);
        String exposed = alias.isEmpty() ? method.getSimpleName().toString() : alias;
        model.methods.add(methodModel(method, exposed, type));
    }

    private MethodModel methodModel(ExecutableElement method, String exposedName, TypeElement type) {
        MethodModel mm = new MethodModel(exposedName);
        for (VariableElement p : method.getParameters()) {
            mm.params.add(new ParamModel(p.getSimpleName().toString(), tsType(p.asType())));
        }
        mm.returns = tsType(method.getReturnType());
        mm.roles.addAll(readRoles(method, type));
        return mm;
    }

    /** Service name = class-level @BrowserCallable value(), else the class simple name. */
    private String serviceName(TypeElement type) {
        String v = browserCallableValue(type);
        return v.isEmpty() ? type.getSimpleName().toString() : v;
    }

    private AnnotationMirror browserCallable(Element element) {
        for (AnnotationMirror am : element.getAnnotationMirrors()) {
            if (BROWSER_CALLABLE.equals(am.getAnnotationType().toString())) {
                return am;
            }
        }
        return null;
    }

    private String browserCallableValue(Element element) {
        AnnotationMirror am = browserCallable(element);
        if (am == null) {
            return "";
        }
        for (Map.Entry<? extends ExecutableElement, ? extends AnnotationValue> e : am.getElementValues().entrySet()) {
            if ("value".equals(e.getKey().getSimpleName().toString())) {
                Object v = e.getValue().getValue();
                return v == null ? "" : v.toString();
            }
        }
        return "";
    }

    /** Reads @Roles value()/group() enum constant names from the method, falling back to the type. */
    private List<String> readRoles(ExecutableElement method, TypeElement type) {
        List<String> roles = rolesFrom(method);
        if (roles.isEmpty()) {
            roles = rolesFrom(type);
        }
        return roles;
    }

    private List<String> rolesFrom(Element element) {
        List<String> out = new ArrayList<>();
        for (AnnotationMirror am : element.getAnnotationMirrors()) {
            if (!ROLES.equals(am.getAnnotationType().toString())) {
                continue;
            }
            for (Map.Entry<? extends javax.lang.model.element.ExecutableElement, ? extends AnnotationValue> entry :
                    am.getElementValues().entrySet()) {
                // value() and group() are both enum arrays; collect their constant simple names.
                collectEnumConstants(entry.getValue(), out);
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private void collectEnumConstants(AnnotationValue value, List<String> out) {
        Object v = value.getValue();
        if (v instanceof List<?>) {
            for (AnnotationValue av : (List<? extends AnnotationValue>) v) {
                collectEnumConstants(av, out);
            }
        } else if (v instanceof VariableElement enumConst) {
            out.add(enumConst.getSimpleName().toString());
        }
    }

    /** Maps a Java type mirror to a TypeScript type string, per the motu type rules. */
    private String tsType(TypeMirror t) {
        switch (t.getKind()) {
            case BOOLEAN:
                return "boolean";
            case BYTE:
            case SHORT:
            case INT:
            case FLOAT:
            case DOUBLE:
                return "number";
            case LONG:
                return "string"; // lossy in JS number space
            case VOID:
                return "void";
            case ARRAY:
                return tsType(((javax.lang.model.type.ArrayType) t).getComponentType()) + "[]";
            case DECLARED:
                return tsDeclared((DeclaredType) t);
            default:
                return "unknown";
        }
    }

    private String tsDeclared(DeclaredType dt) {
        TypeElement el = (TypeElement) dt.asElement();
        String qn = el.getQualifiedName().toString();
        List<? extends TypeMirror> args = dt.getTypeArguments();

        switch (qn) {
            case "java.lang.String":
            case "java.time.Instant":
            case "java.time.LocalDate":
            case "java.time.LocalDateTime":
            case "java.math.BigDecimal":
            case "java.math.BigInteger":
                return "string";
            case "java.lang.Boolean":
                return "boolean";
            case "java.lang.Byte":
            case "java.lang.Short":
            case "java.lang.Integer":
            case "java.lang.Float":
            case "java.lang.Double":
                return "number";
            case "java.lang.Long":
                return "string";
            case "java.util.List":
            case "java.util.Collection":
            case "java.util.Set":
                return (args.isEmpty() ? "unknown" : tsType(args.get(0))) + "[]";
            case "java.util.Optional":
                return (args.isEmpty() ? "unknown" : tsType(args.get(0))) + " | null";
            case "com.example.core.simpletype.SubList":
                // Paginated wrapper: getList()/getFirst()/getPerPage()/getSize().
                String item = args.isEmpty() ? "unknown" : tsType(args.get(0));
                return "{ list: " + item + "[]; first: string; perPage: string; size: string }";
            case "java.util.Map":
                String key = args.size() == 2 ? tsType(args.get(0)) : "string";
                String val = args.size() == 2 ? tsType(args.get(1)) : "unknown";
                return "Record<" + (key.equals("number") ? "number" : "string") + ", " + val + ">";
            case "java.lang.Object":
                return "unknown";
            default:
                if (el.getKind() == ElementKind.ENUM) {
                    // Union of enum constant string literals.
                    List<String> lits = new ArrayList<>();
                    for (Element e : el.getEnclosedElements()) {
                        if (e.getKind() == ElementKind.ENUM_CONSTANT) {
                            lits.add("'" + e.getSimpleName() + "'");
                        }
                    }
                    return lits.isEmpty() ? "string" : String.join(" | ", lits);
                }
                // A DTO motu can't expand yet (e.g. the host's Jackson search beans). Degrade to a
                // permissive record so the generated contract compiles; runtime binding (JSON-B or
                // the host's Jackson mapper) still deserializes the real object server-side.
                return "Record<string, unknown>";
        }
    }

    private void writeManifest() {
        StringBuilder json = new StringBuilder();
        json.append("{\n  \"services\": [\n");
        List<ServiceModel> list = new ArrayList<>(services.values());
        for (int i = 0; i < list.size(); i++) {
            ServiceModel s = list.get(i);
            json.append("    {\n      \"name\": ").append(quote(s.name)).append(",\n");
            json.append("      \"methods\": [\n");
            for (int j = 0; j < s.methods.size(); j++) {
                MethodModel m = s.methods.get(j);
                json.append("        { \"name\": ").append(quote(m.name)).append(", \"params\": [");
                for (int k = 0; k < m.params.size(); k++) {
                    ParamModel p = m.params.get(k);
                    json.append("{ \"name\": ").append(quote(p.name))
                        .append(", \"ts\": ").append(quote(p.ts)).append(" }");
                    if (k < m.params.size() - 1) json.append(", ");
                }
                json.append("], \"returns\": ").append(quote(m.returns))
                    .append(", \"roles\": [");
                for (int r = 0; r < m.roles.size(); r++) {
                    json.append(quote(m.roles.get(r)));
                    if (r < m.roles.size() - 1) json.append(", ");
                }
                json.append("] }");
                if (j < s.methods.size() - 1) json.append(",");
                json.append("\n");
            }
            json.append("      ]\n    }");
            if (i < list.size() - 1) json.append(",");
            json.append("\n");
        }
        json.append("  ]\n}\n");

        try {
            FileObject file = processingEnv.getFiler()
                    .createResource(StandardLocation.CLASS_OUTPUT, "", "motu-manifest.json");
            try (Writer w = file.openWriter()) {
                w.write(json.toString());
            }
            processingEnv.getMessager().printMessage(Diagnostic.Kind.NOTE,
                    "motu: wrote motu-manifest.json (" + services.size() + " service(s))");
        } catch (IOException e) {
            processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR,
                    "motu: failed to write manifest: " + e.getMessage());
        }
    }

    private static String quote(String s) {
        if (s == null) return "null";
        return '"' + s.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }

    private static final class ServiceModel {
        final String name;
        final List<MethodModel> methods = new ArrayList<>();

        ServiceModel(String name) {
            this.name = name;
        }
    }

    private static final class MethodModel {
        final String name;
        final List<ParamModel> params = new ArrayList<>();
        final List<String> roles = new ArrayList<>();
        String returns = "unknown";

        MethodModel(String name) {
            this.name = name;
        }
    }

    private static final class ParamModel {
        final String name;
        final String ts;

        ParamModel(String name, String ts) {
            this.name = name;
            this.ts = ts;
        }
    }
}
