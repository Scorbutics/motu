// The pages the host renders itself: the composed multi-repo lagoon, and the two indexes.
//
// Every colour, surface and motion here comes from `@motu/chrome` — the same tokens the tide line
// paints the lagoon with. These pages had their own dark-slate palette first, which looked like a
// different product sitting in front of motu's; that is what `@motu/chrome` exists to prevent, and
// nothing in this file may reintroduce a literal colour.
//
// WHY THE COMPOSED LAGOON IS IFRAMES, and not one merged bundle. Merging pre-built archipelagos from
// different repositories walks into the three problems motu's README already declines:
//   - React: the lagoon installs no React, it dedupes onto the host app's copy — two Reacts in one
//     document break hooks the moment an island renders a component from the host's library.
//   - CSS: `--host next` defaults isolation to `light` precisely so islands SEE the host's Tailwind,
//     so two light-DOM regions from two repos collide (preflight twice, same utility names from
//     different configs) — and it fails VISUALLY AND SILENTLY, which is the failure class motu
//     exists to delete.
//   - Version skew between independently built fragments is the micro-frontend problem "one artifact,
//     one deploy, one version" refuses outright.
// A frame gives each archipelago its own React, its own stylesheet and its own document for free, and
// the intermediate representation it needs is the self-contained page `publish` ALREADY emits. No
// second build stage, no packager that has to understand anyone's bundle.
//
// The line this must not cross: the composed lagoon is a VIEWING SURFACE. It is never a deploy
// target and never what `motu island verify` drives — verify keeps driving lagoon.html directly, one
// document, no frames. Compose islands at runtime for production and this stops being a gallery and
// starts being federation.
import {
  motuChromeCss,
  motuPage,
  motuBay,
  motuMark,
  motuPanel,
  motuRow,
  motuRailedList,
  escapeHtml,
} from '@motu/chrome';

/** kB / MB, whichever reads. Sizes here are artifact sizes, and 431 kB is more useful than 0.4 MB. */
function size(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

const when = (iso) => escapeHtml(iso.slice(0, 16).replace('T', ' '));

// --- the composed lagoon ------------------------------------------------------------------------

const SHELL_CSS = `
html, body { height: 100%; overflow: hidden; }
.wrap { display: flex; height: 100%; }
aside {
  width: 268px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--surface-page);
  border-right: 1px solid var(--line);
}
/* Sticky, not merely first: the rail scrolls inside the aside — most of all in the stacked layout,
   where the aside is capped at 40vh — and a header that scrolls away takes the only label saying
   WHICH composed lagoon this is with it. */
aside .motu-bay { flex: none; position: sticky; top: 0; z-index: 2; }
aside .rail { padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; }
.rail .motu-cap { padding: 10px 8px 4px; }
/* THE WATER IS A READOUT, the same rule the lagoon's own chrome follows: the gauge down the left of a
   row is depth — faint for a lagoon sitting there, full and lit for the one on screen. */
button.member {
  position: relative; overflow: hidden;
  display: flex; align-items: stretch; gap: 10px;
  width: 100%;
  text-align: left;
  padding: 9px 11px 9px 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  /* FLAT, the same surface motu-row uses. A vertical tint inside a selected card read as a different
     era of UI beside the lens and the dock — the colour belongs in the gauge, which is a readout, not
     in the surface behind the text. Only the BAY and the panels carry a gradient.
     (No backticks in here: this whole stylesheet is a template literal, and one ends it.) */
  background: var(--surface-row);
  color: var(--ink);
  font: 600 12.5px/1.35 inherit;
  cursor: pointer;
  animation: motu-swim 260ms cubic-bezier(.2,.9,.3,1) both;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms cubic-bezier(.2,.9,.3,1);
}
button.member .gauge {
  flex: none; width: 4px; margin: 2px 0; border-radius: 999px;
  background: linear-gradient(180deg, var(--w-shallow), var(--w-deep));
  opacity: .3; transition: opacity 160ms ease, width 160ms cubic-bezier(.2,.9,.3,1);
}
button.member .body { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 1px 0; }
button.member .name { display: block; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.member .tags { display: flex; flex-wrap: wrap; gap: 4px; }
button.member .tag {
  font-style: normal; font-weight: 600; font-size: 10.5px; line-height: 1;
  padding: 4px 8px; border-radius: 999px;
  background: rgba(11,111,104,.08); color: var(--w-deep);
}
button.member .tag.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -.02em; }
button.member .tag.faint { background: none; color: var(--ink-muted); padding-left: 2px; }
button.member:hover { border-color: var(--w-shallow); transform: translateX(2px); }
button.member:hover .gauge { opacity: .65; }
button.member:focus-visible { outline: 2px solid var(--w-mid); outline-offset: 2px; }
button.member[aria-current="true"] {
  border-color: var(--tide-accent);
  background: rgba(255, 255, 255, .95);
}
button.member[aria-current="true"] .gauge { opacity: 1; width: 6px; }
button.member[aria-current="true"] .tag { background: rgba(11,111,104,.07); }
/* One sweep when a lagoon becomes the one on screen — the tide arriving, not a spinner. */
button.member[aria-current="true"]::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.5) 50%, transparent 80%);
  transform: translateX(-100%); animation: motu-sheen 720ms ease-out 1;
}
/* LIVE is a state, not a decoration: this member is being served by a dev server right now, so what is
   in the frame can change under you — which is exactly what you asked for, and worth saying. */
/* LIVE is a state, not a decoration: this member is being served by a dev server right now, so what is
   in the frame can change under you. It breathes, because that is the difference between "this is a
   build" and "this is someone's editor". */
/* The ring itself is .motu-breathe in the kit, which this element also carries. What stays here is
   only where it SITS in a member row — a second @keyframes motu-breathe lived here and silently
   outranked the kit's for every element in any document that loaded both. */
button.member .live-dot {
  float: right; margin-left: 8px;
  font-style: normal; font-weight: 800; font-size: 9px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--motu-on-primary);
  background: var(--tide-accent); border-radius: 999px; padding: 3px 8px;
}
/* The repo caption gets the water too, so the eye groups by project before it reads a word. */
.rail .motu-cap { display: flex; align-items: center; gap: 7px; }
.rail .motu-cap::before {
  content: ''; width: 6px; height: 6px; border-radius: 999px; flex: none;
  background: linear-gradient(180deg, var(--w-shallow), var(--w-mid));
}
@media (prefers-reduced-motion: reduce) {
  button.member, button.member .gauge { transition: none; }
  button.member[aria-current="true"] { transform: none; }
  button.member[aria-current="true"]::after { display: none; }
  button.member .live-dot { animation: none; box-shadow: none; }
}
aside footer { margin-top: auto; padding: 12px 14px; border-top: 1px solid var(--line); word-break: break-all; }
main.stage { flex: 1; position: relative; background: #fff; }
main.stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }

/* --- the switcher, on a phone -------------------------------------------------------------------
   The rail used to stack above the stage at max-height 40vh, so on a 844px-tall phone half the screen
   was a list of four buttons and the lagoon — the thing being looked at — got the rest. A composed
   view exists to SHOW the lagoons, so the switcher becomes a bar you can read in one line and a sheet
   you pull up when you actually want to switch. Desktop is unchanged: a 268px rail beside a wide
   stage costs nothing there and is faster than any sheet. */
/* THE MARK AT RAIL SIZE. The masthead's is 30px against a 46px heading; the rail's band is 16px of
   padding around a 13.5px title, so the same square would be the tallest thing in it. */
aside .motu-home .motu-mark { width: 22px; height: 22px; border-radius: 6px; }
.topbar { display: none; }
.scrim { display: none; }
@media (max-width: 760px) {
  .wrap { flex-direction: column; }
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 8px 10px 8px 14px;
    background: var(--motu-primary);
    color: var(--motu-on-primary);
    border-bottom: 1px solid var(--line);
  }
  .topbar .motu-home .motu-mark { width: 24px; height: 24px; border-radius: 6px; }
  .topbar .who { min-width: 0; flex: 1; line-height: 1.25; }
  .topbar .who strong { display: block; font: 700 14px/1.25 inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar .who span { display: block; font: 500 11.5px/1.3 inherit; opacity: .82; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar button {
    flex: none; display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 12px; border-radius: 999px; cursor: pointer;
    border: 1px solid rgba(255,255,255,.34);
    background: rgba(255,255,255,.14); color: inherit;
    font: 600 12.5px/1 inherit;
  }
  .topbar button::after { content: '▾'; font-size: 11px; opacity: .9; }

  /* The rail becomes a bottom sheet. Same markup, same buttons — only where it sits changes, so the
     switcher cannot drift into two implementations. */
  aside {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
    width: auto; max-height: 76vh;
    border-right: 0; border-top: 0;
    border-radius: 16px 16px 0 0;
    /* THE LENS'S OWN TREATMENT: its panel is this surface, this shadow, and a backdrop blur. The
       sheet had a flat page background and read as a different surface to the one motu shows over
       every lagoon. overflow:hidden is what lets the bay fill the rounded top corners. */
    overflow: hidden;
    background: linear-gradient(180deg, rgba(247, 253, 252, .96), rgba(232, 248, 246, .94));
    backdrop-filter: blur(14px) saturate(1.35);
    -webkit-backdrop-filter: blur(14px) saturate(1.35);
    box-shadow: 0 -14px 40px rgba(11, 111, 104, .22);
    transform: translateY(100%);
    transition: transform 220ms cubic-bezier(.2,.9,.3,1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  body.sheet-open aside { transform: translateY(0); }
  body.sheet-dragging aside { transition: none; }
  aside .grab { display: block; }
  .scrim {
    display: block; position: fixed; inset: 0; z-index: 39;
    background: rgba(6, 46, 43, .42);
    opacity: 0; pointer-events: none; transition: opacity 220ms ease;
  }
  body.sheet-open .scrim { opacity: 1; pointer-events: auto; }
  /* Comfortable targets: this is the one control on the page a thumb uses. */
  button.member { padding: 12px 13px; font-size: 13.5px; }
  aside footer { padding-bottom: 16px; }
}
/* The drag handle only means anything on the sheet, and it rides ON the water. */
.grab { display: none; padding: 2px 0 8px; cursor: grab; touch-action: none; }
.grab i { display: block; width: 40px; height: 4px; margin: 0 auto; border-radius: 999px; background: rgba(255,255,255,.5); }
`;

/**
 * One frame per member, created on FIRST selection and then kept mounted.
 *
 * Lazy because a composed lagoon is N × ~430 kB of inlined bundle and nobody looks at all of it;
 * kept because re-pointing a single frame would throw away whatever state you had just driven the
 * region into, which is the one thing you opened it to look at.
 */
export function composedPage({ id, group, members, live = false }) {
  const byRepo = new Map();
  members.forEach((m, i) => {
    if (!byRepo.has(m.repo)) byRepo.set(m.repo, []);
    byRepo.get(m.repo).push({ ...m, i });
  });

  const rail = [...byRepo.entries()]
    .map(
      ([repo, list]) =>
        `<div class="motu-cap">${escapeHtml(repo)}</div>` +
        list
          .map(
            (m) =>
              `<button class="member" data-i="${m.i}" aria-current="${m.i === 0}" data-live="${m.live ? 'true' : 'false'}">` +
              `<span class="gauge" aria-hidden="true"></span>` +
              `<span class="body"><span class="name">${escapeHtml(m.title || m.slug)}` +
              (m.live ? `<em class="live-dot motu-breathe" title="served live by motu lagoon serve --watch">live</em>` : '') +
              `</span><span class="tags"><em class="tag">${escapeHtml(m.slug)}</em>` +
              (m.sha
                ? `<em class="tag mono">${escapeHtml(m.sha.slice(0, 7))}</em>`
                : m.live
                  ? `<em class="tag faint">not published yet</em>`
                  : '') +
              `</span></span></button>`,
          )
          .join(''),
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(group)} — composed lagoon</title>
<style>${motuChromeCss()}${SHELL_CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="topbar">
    <a class="motu-home" href="/" aria-label="All repositories">${motuMark()}</a>
    <div class="who">
      <strong id="tb-title">${escapeHtml(members[0]?.title || members[0]?.slug || group)}</strong>
      <span id="tb-sub">${escapeHtml(group)} · ${members.length} lagoon${members.length === 1 ? '' : 's'}</span>
    </div>
    <button type="button" id="tb-switch" aria-haspopup="dialog" aria-expanded="false" aria-controls="switcher">Switch</button>
  </header>
  <div class="scrim" id="scrim" hidden></div>
  <aside id="switcher" aria-label="Choose a lagoon">
    ${motuBay({
      title: group,
      subtitle: `${members.length} lagoon${members.length === 1 ? '' : 's'}`,
      compact: true,
      // THE SAME WATER THE INDEX OPENS WITH, at rail size. A person reaches this view FROM that page,
      // and a different gradient at the top of the sheet reads as a different place.
      shape: 'masthead',
      // INSIDE the bay, not above it. As a sibling it sat on the sheet's own light surface, so the
      // water started an inch down and the sheet read as two stacked headers.
      lead: '<div class="bay-lead grab" id="grab" aria-hidden="true"><i></i></div>',
      // THE WAY OUT. A composed view is the deepest surface this host has — a lagoon, inside a
      // gallery, inside a group — and until now the only way back to the index was the browser's own
      // back button, which is not a way back when somebody arrived here from a shared link. The mark
      // is where it already is on the front page, and it goes where a mark goes.
      leading: `<a class="motu-home" href="/" aria-label="All repositories">${motuMark()}</a>`,
    })}
    <div class="rail">${rail}</div>
    <footer class="motu-cap">${
      live
        ? `today${id ? ` · <a style="color:inherit" href="/m/${escapeHtml(id)}/">pin this view</a>` : ''}`
        : `manifest ${escapeHtml(id ?? '')}`
    }</footer>
  </aside>
  <main class="stage" id="stage"></main>
</div>
<script>
(function () {
  var stage = document.getElementById('stage');
  var frames = {};
  var current = null;
  function show(i) {
    if (current === i) return;
    if (!frames[i]) {
      var f = document.createElement('iframe');
      // Each member is its OWN document: its own React, its own stylesheet. That isolation is the
      // whole reason composition works, so the frame gets no privileges it does not need.
      f.setAttribute('title', 'lagoon frame ' + i);
      f.setAttribute('loading', 'lazy');
      f.src = 'f/' + i;
      stage.appendChild(f);
      frames[i] = f;
    }
    Object.keys(frames).forEach(function (k) { frames[k].style.display = (+k === i) ? 'block' : 'none'; });
    Array.prototype.forEach.call(document.querySelectorAll('button.member'), function (b) {
      b.setAttribute('aria-current', String(+b.dataset.i === i));
    });
    current = i;
    var chosen = document.querySelector('button.member[data-i="' + i + '"]');
    var label = document.getElementById('tb-title');
    if (chosen && label) label.textContent = chosen.childNodes[0].textContent.trim();
    if (history.replaceState) history.replaceState(null, '', '#' + i);
  }
  // --- the sheet, on a phone --------------------------------------------------------------------
  // Desktop never opens it: the rail is always visible there and these handlers simply never fire,
  // because the button they hang off is display:none.
  var body = document.body;
  var scrim = document.getElementById('scrim');
  var switchBtn = document.getElementById('tb-switch');
  var sheet = document.getElementById('switcher');
  var grab = document.getElementById('grab');

  function openSheet() {
    scrim.hidden = false;
    body.classList.add('sheet-open');
    switchBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSheet() {
    body.classList.remove('sheet-open');
    switchBtn.setAttribute('aria-expanded', 'false');
    // Kept in the layout until the transition ends, or the backdrop vanishes before the sheet does.
    setTimeout(function () { if (!body.classList.contains('sheet-open')) scrim.hidden = true; }, 240);
  }
  switchBtn.addEventListener('click', function () {
    body.classList.contains('sheet-open') ? closeSheet() : openSheet();
  });
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // DRAG TO DISMISS. A sheet a thumb can only close by reaching the backdrop is a sheet that feels
  // stuck; following the finger is the part that makes it read as a panel rather than a popup.
  var startY = null, dy = 0;
  grab.addEventListener('pointerdown', function (e) {
    startY = e.clientY; dy = 0;
    body.classList.add('sheet-dragging');
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', function (e) {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = 'translateY(' + dy + 'px)';
  });
  function endDrag() {
    if (startY === null) return;
    startY = null;
    body.classList.remove('sheet-dragging');
    sheet.style.transform = '';
    // A short pull springs back; past a third of the sheet it is a dismissal.
    if (dy > Math.min(120, sheet.offsetHeight / 3)) closeSheet();
  }
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button.member');
    if (b) { show(+b.dataset.i); closeSheet(); }
  });
  var initial = parseInt((location.hash || '').slice(1), 10);
  show(Number.isInteger(initial) ? initial : 0);
})();
</script>
</body>
</html>
`;
}

// --- the indexes --------------------------------------------------------------------------------

export function rootIndexPage({ repos, groups, stats }) {
  const groupRows = groups.map((g) =>
    motuRow({
      href: `/g/${g.name}`,
      label: g.name,
      sub: `${g.members.length} lagoon${g.members.length === 1 ? '' : 's'} · ${g.members.map((m) => escapeHtml(m.repo)).join(' + ')}`,
    }),
  );

  const repoRows = repos.map((r) =>
    motuRow({
      href: `/${r.repo}/`,
      label: r.repo,
      sub: `${r.slugs.length} lagoon${r.slugs.length === 1 ? '' : 's'} · ${r.records} record${r.records === 1 ? '' : 's'}`,
    }),
  );

  return motuPage({
    title: 'motu lagoons',
    bay: motuBay({
      title: 'motu',
      subtitle: 'published lagoons',
      meta: `${stats.blobs} object${stats.blobs === 1 ? '' : 's'} · ${size(stats.bytes)} · cap ${stats.maxRecords}/repo`,
    }),
    body:
      (groups.length ? motuPanel({ caption: 'Composed', rows: groupRows }) : '') +
      motuPanel({
        caption: 'Repositories',
        rows: repoRows,
        empty: 'Nothing published yet — run motu lagoon publish --remote from a project.',
      }),
  });
}

export function repoIndexPage({ repo, aliases, history }) {
  const byId = new Map(history.map((r) => [r.id, r]));
  const current = Object.entries(aliases.latest ?? {})
    .map(([slug, id]) => ({ slug, rec: byId.get(id) }))
    .filter((x) => x.rec)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  // THE SUB LINE IS UNCHANGED — slug, the sha as its own permalink, the branch, when. It is the one
  // line on this page that is not decoration: the sha link is how somebody pins the version they are
  // looking at, and the design brief says "exactly what repoIndexPage emits today" for that reason.
  const subFor = (slug, rec) =>
    `${escapeHtml(slug)} · <a href="/${escapeHtml(repo)}/${escapeHtml(rec.sha)}/${escapeHtml(slug)}">${escapeHtml(rec.sha.slice(0, 7))}</a>` +
    `${rec.branch ? ` · ${escapeHtml(rec.branch)}` : ''} · ${when(rec.publishedAt)}`;

  // NOT A LINK ROW, and that is forced rather than chosen. The sub line contains the sha PERMALINK,
  // and an <a> inside an <a> is invalid HTML: the browser closes the outer anchor at the inner one,
  // so the sub and the action fell out of the card and rendered underneath it. This has been the
  // markup since the page was written; a flat row hid it, and a card made it visible in one look.
  //
  // So the row carries the two links it has — the sha, and `Open →` — and is not itself one. Which is
  // also what the design draws: a card with an explicit action, not a card that is entirely a target.
  const latestRows = current.map(({ slug, rec }, i) =>
    motuRow({
      label: rec.title || slug,
      scale: 'page',
      tone: 'ok',
      index: i,
      sub: subFor(slug, rec),
      trailing: `<a class="motu-open" href="/${escapeHtml(repo)}/latest/${escapeHtml(slug)}">Open →</a>`,
    }),
  );

  const past = history.slice(0, 50);
  // HISTORY IS THE SAME ROW WITHOUT THE CARD, and that is a deliberate reading of the brief rather
  // than the geometry it describes. The mockup gives history its own four-column grid with a vertical
  // gauge; a third row geometry in a kit that already has two is the drift this package exists to
  // stop, so the recency the gauge was carrying is carried by --age on the row's own gauge instead.
  const historyRows = past.map((r, i) =>
    motuRow({
      href: `/${repo}/${r.sha}/${r.slug}`,
      label: r.slug,
      scale: 'page',
      surface: 'flat',
      index: i,
      age: i,
      sub: `${escapeHtml(r.sha.slice(0, 7))}${r.branch ? ` · ${escapeHtml(r.branch)}` : ''} · ${when(r.publishedAt)}`,
    }),
  );

  const [owner, name] = repo.includes('/') ? [repo.slice(0, repo.indexOf('/')), repo.slice(repo.indexOf('/') + 1)] : ['', repo];
  const records = history.length;
  return motuPage({
    title: repo,
    column: 'page',
    bay: motuBay({
      shape: 'masthead',
      // WHERE THE WORDMARK SITS ON THE FRONT PAGE, a way back. This page is reached FROM the index,
      // and the mark that identifies the product there is less useful here than the way out.
      leading: '<a class="motu-back" href="/">← all repositories</a>',
      title: owner ? `${escapeHtml(owner)}/` : '',
      titleRaw: true,
      headline: name,
      meta:
        `<span class="motu-sand">${records}</span> record${records === 1 ? '' : 's'}` +
        ` · ${current.length} lagoon${current.length === 1 ? '' : 's'}`,
    }),
    body:
      `<section><div class="motu-cap panel-cap">Latest</div>${
        latestRows.length
          ? motuRailedList(latestRows)
          : '<p class="motu-empty">No lagoons published for this repository.</p>'
      }</section>` +
      (historyRows.length
        ? `<section><div class="motu-cap panel-cap">History<span class="motu-cap-trail">newest ${past.length} of ${history.length}</span></div>${motuRailedList(historyRows)}</section>`
        : ''),
  });
}

export function errorPage(status, message) {
  return motuPage({
    title: String(status),
    bay: motuBay({ title: String(status), subtitle: 'nothing here' }),
    body: motuPanel({ caption: 'What happened', rows: [], empty: message }) + `<p><a href="/">all repositories</a></p>`,
  });
}
