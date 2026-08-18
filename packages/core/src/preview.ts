// The global "preview the redesign" affordance. A floating badge toggles preview mode; registered
// preview regions (see motu-archipelago) swap a legacy screen region for the archipelago layout.
// Individual <motu-island> toggles are independent of this — they are the manual, per-island
// soft-migration path used when NOT previewing.

const BADGE_STYLE_ID = 'motu-badge-style';
const PREVIEW_KEY = 'motu:preview';

export interface PreviewRegion {
  __applyPreview(on: boolean): void;
}

const regions = new Set<PreviewRegion>();
const listeners = new Set<(on: boolean) => void>();
let previewOn = false;
let badgeEl: HTMLButtonElement | null = null;
let hydrated = false;

function readFlag(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    localStorage.setItem(PREVIEW_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable (private mode); preview still works for the session.
  }
}

export function isPreviewOn(): boolean {
  // Hydrate lazily so a listener that reads this before the badge is created still gets the real state.
  if (!hydrated) {
    previewOn = readFlag();
    hydrated = true;
  }
  return previewOn;
}

// Notify on preview toggles. Individual <motu-island> toggles use this to go dormant while a region
// preview owns the screen (avoids double-display), and resume when it exits.
export function subscribePreview(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function registerPreviewRegion(region: PreviewRegion): void {
  regions.add(region);
}

export function unregisterPreviewRegion(region: PreviewRegion): void {
  regions.delete(region);
}

function ensureBadgeStyle(): void {
  if (document.getElementById(BADGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BADGE_STYLE_ID;
  style.textContent = `
.motu-badge {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 9px;
  padding: 11px 17px; border: 0; border-radius: 999px; cursor: pointer;
  font: 600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
  color: #fff; background: linear-gradient(135deg,#5a67f2,#8b5cf6);
  box-shadow: 0 10px 26px rgba(90,103,242,.42);
  transition: transform .15s ease, box-shadow .15s ease, background .25s ease;
}
.motu-badge:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(90,103,242,.5); }
.motu-badge:active { transform: translateY(0); }
.motu-badge__dot {
  width: 8px; height: 8px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 0 4px rgba(255,255,255,.28); animation: motu-pulse 2s ease-in-out infinite;
}
.motu-badge.motu-on { background: linear-gradient(135deg,#0ea5e9,#22c55e); }
.motu-badge.motu-on .motu-badge__dot { animation: none; }
@keyframes motu-pulse {
  0%,100% { box-shadow: 0 0 0 4px rgba(255,255,255,.28); }
  50% { box-shadow: 0 0 0 7px rgba(255,255,255,.10); }
}`;
  document.head.appendChild(style);
}

// Created once the first preview region appears (so it never shows in the standalone app).
export function ensureBadge(): void {
  if (!hydrated) {
    previewOn = readFlag();
    hydrated = true;
  }
  if (badgeEl) return;
  ensureBadgeStyle();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'motu-badge';
  const dot = document.createElement('span');
  dot.className = 'motu-badge__dot';
  const label = document.createElement('span');
  label.className = 'motu-badge__label';
  btn.append(dot, label);
  btn.addEventListener('click', () => setPreview(!previewOn));
  document.body.appendChild(btn);
  badgeEl = btn;
  syncBadge();
}

function syncBadge(): void {
  if (!badgeEl) return;
  badgeEl.classList.toggle('motu-on', previewOn);
  badgeEl.setAttribute('aria-pressed', String(previewOn));
  const label = badgeEl.querySelector('.motu-badge__label');
  if (label) label.textContent = previewOn ? 'Exit preview' : 'Preview new design';
}

export function setPreview(on: boolean): void {
  previewOn = on;
  hydrated = true;
  writeFlag(on);
  // Regions first (they show/hide the legacy screen), then listeners (individual toggles re-apply on
  // top of the region's final state).
  regions.forEach((r) => r.__applyPreview(on));
  listeners.forEach((l) => l(on));
  syncBadge();
}
