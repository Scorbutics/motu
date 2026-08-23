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
import { motuChromeCss, motuPage, motuBay, motuPanel, motuRow, escapeHtml } from '@motu/chrome';

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
button.member {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 11px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--ink);
  font: 600 12.5px/1.35 inherit;
  cursor: pointer;
  animation: motu-swim 260ms cubic-bezier(.2,.9,.3,1) both;
}
button.member:hover { background: var(--surface-row); border-color: var(--line); }
button.member[aria-current="true"] {
  background: var(--surface-row);
  border-color: var(--tide-accent);
  box-shadow: inset 3px 0 0 var(--tide-accent);
}
button.member small { display: block; margin-top: 2px; font-weight: 500; color: var(--ink-muted); }
aside footer { margin-top: auto; padding: 12px 14px; border-top: 1px solid var(--line); word-break: break-all; }
main.stage { flex: 1; position: relative; background: #fff; }
main.stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }

/* --- the switcher, on a phone -------------------------------------------------------------------
   The rail used to stack above the stage at max-height 40vh, so on a 844px-tall phone half the screen
   was a list of four buttons and the lagoon — the thing being looked at — got the rest. A composed
   view exists to SHOW the lagoons, so the switcher becomes a bar you can read in one line and a sheet
   you pull up when you actually want to switch. Desktop is unchanged: a 268px rail beside a wide
   stage costs nothing there and is faster than any sheet. */
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
    border-right: 0; border-top: 1px solid var(--line);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -12px 34px rgba(6, 46, 43, .26);
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
/* The drag handle only means anything on the sheet. */
.grab { display: none; padding: 8px 0 2px; cursor: grab; touch-action: none; }
.grab i { display: block; width: 40px; height: 4px; margin: 0 auto; border-radius: 999px; background: var(--line); }
`;

/**
 * One frame per member, created on FIRST selection and then kept mounted.
 *
 * Lazy because a composed lagoon is N × ~430 kB of inlined bundle and nobody looks at all of it;
 * kept because re-pointing a single frame would throw away whatever state you had just driven the
 * region into, which is the one thing you opened it to look at.
 */
export function composedPage({ id, group, members }) {
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
              `<button class="member" data-i="${m.i}" aria-current="${m.i === 0}">` +
              `${escapeHtml(m.title || m.slug)}<small>${escapeHtml(m.slug)} · ${escapeHtml(m.sha.slice(0, 7))}</small></button>`,
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
    <div class="who">
      <strong id="tb-title">${escapeHtml(members[0]?.title || members[0]?.slug || group)}</strong>
      <span id="tb-sub">${escapeHtml(group)} · ${members.length} lagoon${members.length === 1 ? '' : 's'}</span>
    </div>
    <button type="button" id="tb-switch" aria-haspopup="dialog" aria-expanded="false" aria-controls="switcher">Switch</button>
  </header>
  <div class="scrim" id="scrim" hidden></div>
  <aside id="switcher" aria-label="Choose a lagoon">
    <div class="grab" id="grab" aria-hidden="true"><i></i></div>
    ${motuBay({ title: group, subtitle: `${members.length} lagoon${members.length === 1 ? '' : 's'}`, compact: true })}
    <div class="rail">${rail}</div>
    <footer class="motu-cap">manifest ${escapeHtml(id)}</footer>
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

  const latestRows = current.map(({ slug, rec }) =>
    motuRow({
      href: `/${repo}/latest/${slug}`,
      label: rec.title || slug,
      sub:
        `${escapeHtml(slug)} · <a href="/${escapeHtml(repo)}/${escapeHtml(rec.sha)}/${escapeHtml(slug)}">${escapeHtml(rec.sha.slice(0, 7))}</a>` +
        `${rec.branch ? ` · ${escapeHtml(rec.branch)}` : ''} · ${when(rec.publishedAt)}`,
    }),
  );

  const past = history.slice(0, 50);
  const historyRows = past.map((r) =>
    motuRow({
      href: `/${repo}/${r.sha}/${r.slug}`,
      label: r.slug,
      sub: `${escapeHtml(r.sha.slice(0, 7))}${r.branch ? ` · ${escapeHtml(r.branch)}` : ''} · ${when(r.publishedAt)}`,
    }),
  );

  return motuPage({
    title: repo,
    bay: motuBay({ title: repo, subtitle: 'lagoons', meta: `<a style="color:inherit" href="/">all repositories</a>` }),
    body:
      motuPanel({ caption: 'Latest', rows: latestRows, empty: 'No lagoons published for this repository.' }) +
      (historyRows.length ? motuPanel({ caption: `History · newest ${past.length}`, rows: historyRows }) : ''),
  });
}

export function errorPage(status, message) {
  return motuPage({
    title: String(status),
    bay: motuBay({ title: String(status), subtitle: 'nothing here' }),
    body: motuPanel({ caption: 'What happened', rows: [], empty: message }) + `<p><a href="/">all repositories</a></p>`,
  });
}
