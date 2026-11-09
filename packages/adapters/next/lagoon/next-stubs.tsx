// Vite aliases point next/* here: the lagoon is a plain SPA with no Next runtime, but an island — or
// the app's own layout, on a SCREEN — is still allowed to render a link or read the router.
//
// INERT BY DEFAULT. Navigation intents belong to the host bridge (@motu/adapter-next), so outside a
// screen these render and no-op: a link click is swallowed and logged, never followed (following it
// left the lagoon for a 404). If an island needs more of Next than this, it is coupling to the host
// too tightly.
//
// ON A SCREEN they follow the screen's declared routes (`@motu/react` screens, experimental). A
// screen renders the application's own layout, and a Next layout navigates with <Link> and
// `useRouter()` rather than with motu intents — the sidebar of an app adopting motu is usually not a
// region. So a click or `router.push(path)` is handed to the mounted screen, which opens whichever
// screen serves `path` (or refuses out loud), and `usePathname()` / `useParams()` report the screen's
// path so the layout lights the right item. They talk through two window events, which keeps this
// adapter free of any dependency on @motu/react.
import { createElement, forwardRef, useSyncExternalStore, type ComponentProps, type MouseEvent } from 'react';

/** Mirrors `window.__motuScreen` (lagoon-screen.tsx): set while a screen is showing. */
interface ScreenLocation {
  ok?: boolean;
  path?: string;
  params?: Record<string, string>;
}
const screenNow = (): ScreenLocation | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { __motuScreen?: ScreenLocation }).__motuScreen;
const onScreen = () => screenNow()?.ok === true && typeof screenNow()?.path === 'string';

/** Hand a path to the mounted screen; outside one, stay inert and say so. */
function go(path: string): void {
  if (onScreen()) {
    window.dispatchEvent(new CustomEvent('motu:screen-navigate', { detail: path }));
    return;
  }
  console.log('[next stub] navigate', path, '— inert outside a screen');
}

const subscribe = (fn: () => void) => {
  window.addEventListener('motu:screen-location', fn);
  return () => window.removeEventListener('motu:screen-location', fn);
};
const pathSnapshot = () => (onScreen() ? (screenNow()!.path as string) : '/');
const paramsKey = () => JSON.stringify(onScreen() ? screenNow()!.params ?? {} : {});

const hrefOf = (href: unknown): string => {
  if (typeof href === 'string') return href;
  if (href && typeof href === 'object' && 'pathname' in href) return String((href as { pathname?: unknown }).pathname ?? '#');
  return '#';
};

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<'a'> & { href?: unknown; prefetch?: unknown; replace?: unknown; scroll?: unknown }>(
  function Link({ href, children, onClick, prefetch, replace, scroll, ...rest }, ref) {
    void prefetch;
    void replace;
    void scroll;
    const to = hrefOf(href);
    return createElement(
      'a',
      {
        ...rest,
        ref,
        href: to,
        onClick: (e: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          // A modified click (new tab, download) keeps the browser's own meaning.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          if (/^[a-z]+:/i.test(to) || to.startsWith('#')) return; // external, mailto:, in-page anchors
          e.preventDefault();
          go(to);
        },
      },
      children,
    );
  },
);

export const Image = forwardRef<HTMLImageElement, ComponentProps<'img'>>(function Image(props, ref) {
  return createElement('img', { ...props, ref });
});

const noop = () => {};

export function useRouter() {
  return { push: (p: string) => go(p), replace: (p: string) => go(p), back: noop, forward: noop, refresh: noop, prefetch: noop };
}

export function usePathname() {
  return useSyncExternalStore(subscribe, pathSnapshot, () => '/');
}

export function useSearchParams() {
  const path = usePathname();
  return new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
}

export function useParams() {
  return JSON.parse(useSyncExternalStore(subscribe, paramsKey, () => '{}')) as Record<string, string>;
}

/** Server-side in Next; a page that calls these is not something the lagoon renders. Fail loudly. */
export function redirect(path: string): never {
  throw new Error(`[next stub] redirect("${path}") — a server redirect has no meaning in the lagoon`);
}
export function notFound(): never {
  throw new Error('[next stub] notFound() — a server 404 has no meaning in the lagoon');
}

export default Link;
