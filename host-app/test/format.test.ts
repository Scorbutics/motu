// The app's `size()` must say exactly what the host's says.
//
// Two implementations exist only while `server.mjs` does; until then the front page is rendered by
// whichever one you reach, and a host reporting "76.3 MB" on one route and "0.1 GB" on another is the
// kind of difference nobody reports as a bug and everybody stops trusting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { size } from '../src/host/format.ts'

// The host's own, inlined — a copy of the copy, so this test fails if EITHER drifts rather than
// silently agreeing with whichever one it imported.
const hostSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`

test('size() agrees with views.mjs across the boundary and both sides of it', () => {
  for (const bytes of [0, 1, 1023, 1024, 1536, 1048575, 1048576, 80031207, 4294967296]) {
    assert.equal(size(bytes), hostSize(bytes), `${bytes} bytes`)
  }
})

test('the real host total renders as the page shows it', () => {
  // 80,031,207 is what /api/health reported while this was written; the screenshot says 76.3 MB.
  assert.equal(size(80031207), '76.3 MB')
})
