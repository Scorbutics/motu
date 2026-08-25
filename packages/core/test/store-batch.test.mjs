import { Store } from '../dist/store.js';
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

// 1. setAll never publishes the interleaving
const a = new Store();
a.setAll({ isCurrentWeek: false, isOtherWeek: true });
const seen = [];
a.subscribe(() => seen.push(`${a.get('isCurrentWeek')}/${a.get('isOtherWeek')}`));
a.setAll({ isCurrentWeek: true, isOtherWeek: false });
t('setAll notifies once', seen.length === 1, `${seen.length} notification(s)`);
t('the impossible state is never observed', !seen.includes('true/true'), seen.join(', '));

// 2. plain set is still SYNCHRONOUS — the guarantee model-b asserts
const b = new Store();
let sync = false;
b.subscribe(() => { sync = true; });
b.set('k', 1);
t('a plain set still notifies synchronously', sync === true);

// 3. an empty batch, and a batch that changes nothing, notify nobody
const c = new Store();
c.set('k', 1);
let n = 0;
c.subscribe(() => n++);
c.batch(() => {});
t('an empty batch notifies nobody', n === 0, String(n));
c.batch(() => c.set('k', 1));          // same value
t('a batch that changes nothing notifies nobody', n === 0, String(n));

// 4. nesting flushes once, at the outermost exit
const d = new Store();
let m = 0;
d.subscribe(() => m++);
d.batch(() => { d.set('x', 1); d.batch(() => { d.set('y', 2); }); t('inner batch has not flushed yet', m === 0, String(m)); });
t('nested batch flushes once at the outer exit', m === 1, String(m));

// 5. a throw inside a batch must not leave the store permanently silent
const e = new Store();
let k = 0;
e.subscribe(() => k++);
try { e.batch(() => { e.set('a', 1); throw new Error('boom'); }); } catch {}
e.set('b', 2);
t('a throw inside a batch still flushes and restores notifications', k >= 1, `${k} notification(s)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
