// Who the app is acting as. The demo's stand-in for a login — and labelled as one on screen.
//
// THE APP'S SESSION, NOT AN ISLAND'S. Every page reads it and the sidebar offers to change it, so it
// lives here, in application code, with a subscription — the same shape a real auth client has
// (`onAuthStateChange`). The sidebar asks through the host bridge (`switch-member`); this module
// answers; each page feeds the result to its region as the host-fed key `me`.
//
// Kept in localStorage so a reload keeps you who you were. Guarded: storage can be blocked (private
// windows, previews), and then the app simply starts as the default persona every time.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PERSONAS } from 'demo-app';
import type { MemberRow } from 'demo-app';
import { appSources } from './app-data.js';

const KEY = 'motu-club:signed-in-as';
/** A first visit is signed in as the first persona: the app has more to show a member than a guest. */
const DEFAULT_ID = PERSONAS[0]!.id;
const GUEST = 'guest';

function read(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === GUEST) return null;
    return v ?? DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

let current: string | null = read();
const listeners = new Set<() => void>();

/** Act as a member (an id) or as a guest (null). */
export function signInAs(memberId: string | null): void {
  current = memberId;
  try {
    localStorage.setItem(KEY, memberId ?? GUEST);
  } catch {
    /* storage refused: the switch holds until reload */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The signed-in member's id, or null for a guest. */
export function useSignedInId(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/**
 * The signed-in member's ROW, resolved through the same members source the profile uses — so the
 * session holds an id, and what the screen shows is whatever the directory says about that member now.
 * `undefined` while resolving; `null` for a guest (or an id the directory no longer has).
 */
export function useSignedIn(): MemberRow | null | undefined {
  const id = useSignedInId();
  const [row, setRow] = useState<{ id: string | null; row: MemberRow | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (!id) {
      setRow({ id: null, row: null });
      return;
    }
    appSources()
      .members.byId(id)
      .then((r) => live && setRow({ id, row: r }))
      .catch((err: unknown) => {
        console.error('session: member lookup failed', err);
        if (live) setRow({ id, row: null });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return row && row.id === id ? row.row : undefined;
}
