// Vite aliases point next/* here: the lagoon is a plain SPA with no Next runtime, but an island is
// still allowed to render a link or read the router. Navigation intents belong to the host bridge
// (@motu/adapter-next), so these stubs are inert on purpose — they render and no-op, they never
// navigate. If an island needs more of Next than this, it is coupling to the host too tightly.
import { createElement, forwardRef, type ComponentProps } from 'react';

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<'a'> & { href?: unknown }>(
  function Link({ href, children, ...rest }, ref) {
    return createElement('a', { ...rest, ref, href: typeof href === 'string' ? href : '#' }, children);
  },
);

export const Image = forwardRef<HTMLImageElement, ComponentProps<'img'>>(function Image(props, ref) {
  return createElement('img', { ...props, ref });
});

const noop = () => {};

export function useRouter() {
  return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop };
}

export function usePathname() {
  return '/';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useParams() {
  return {} as Record<string, string>;
}

export default Link;
