import { MockTransport } from '../dist/mock.js';
let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -> ' + detail : ''}`); };

// 1. no `after` on any candidate: every call behaves exactly as before this feature existed.
{
  const transport = new MockTransport([{ service: 'challenges', method: 'fetchState', response: 'ok' }]);
  const first = await transport.call('challenges', 'fetchState', []);
  const second = await transport.call('challenges', 'fetchState', []);
  t('unguarded fixture answers every call the same way', first === 'ok' && second === 'ok');
}

// 2. the motivating case: the first call succeeds, the second (and every one after) fails — the
//    property no fixture could express before `after`, because both calls share the same arguments.
{
  const transport = new MockTransport([
    { service: 'challenges', method: 'fetchState', response: 'good-data' },
    { service: 'challenges', method: 'fetchState', status: 500, after: 2, message: 'boom' },
  ]);
  const firstOk = await transport.call('challenges', 'fetchState', []);
  t('call #1 uses the unguarded fixture', firstOk === 'good-data');

  let threw = null;
  try {
    await transport.call('challenges', 'fetchState', []);
  } catch (err) {
    threw = err;
  }
  t('call #2 is caught by the after:2 fixture', threw?.status === 500 && threw?.message === 'boom', String(threw));

  let thirdThrew = null;
  try {
    await transport.call('challenges', 'fetchState', []);
  } catch (err) {
    thirdThrew = err;
  }
  t('the after-guarded fixture stays in effect for every later call', thirdThrew?.status === 500, String(thirdThrew));
}

// 3. call counts are per service/method — one endpoint failing does not affect an unrelated one.
{
  const transport = new MockTransport([
    { service: 'challenges', method: 'fetchState', status: 500, after: 2 },
    { service: 'challenges', method: 'fetchState', response: 'good-data' },
    { service: 'members', method: 'fetchOne', response: 'member-data' },
  ]);
  await transport.call('challenges', 'fetchState', []); // call #1 on challenges/fetchState
  const memberResult = await transport.call('members', 'fetchOne', []); // call #1 on a DIFFERENT key
  t('an unrelated service/method is unaffected by another endpoint\'s call count', memberResult === 'member-data');
}

// 4. `after` combines with `match`: the request-keyed tier is still preferred, and within it the
//    highest SATISFIED `after` wins.
{
  const transport = new MockTransport([
    { service: 'challenges', method: 'fetchState', match: ['m-1'], response: 'm1-first' },
    { service: 'challenges', method: 'fetchState', match: ['m-1'], status: 503, after: 2 },
    { service: 'challenges', method: 'fetchState', match: [undefined], response: 'other-member' },
  ]);
  const m1First = await transport.call('challenges', 'fetchState', ['m-1']);
  t('a matched fixture still wins over the wildcard on call #1', m1First === 'm1-first');

  let m1SecondThrew = null;
  try {
    await transport.call('challenges', 'fetchState', ['m-1']);
  } catch (err) {
    m1SecondThrew = err;
  }
  t('the after:2 matched fixture takes over on call #2 for the SAME args', m1SecondThrew?.status === 503);

  // The call counter is shared per service/method (not per matched args), but `match` still excludes
  // the m-1-only fixtures for a different member's args regardless of that shared count, so the
  // wildcard fixture answers correctly rather than 503ing on m-2 because of m-1's history.
  const otherMember = await transport.call('challenges', 'fetchState', ['m-2']);
  t('a differently-matched fixture is unaffected by another match\'s satisfied `after`', otherMember === 'other-member');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
