// FIXTURE CAPTURE, as an act rather than a view.
//
// Everything else the lens exports answers a question about the region. This DOES something to it:
// start the recorder, stop it, and turn what was captured into the same request-keyed fixtures text
// the CLI writes. So it does not belong in a tab beside the sheet and the findings — it belongs with
// the other controls, and the panel that offers it needs verbs, not getters.
//
// EXTRACTED FROM THE PANEL rather than reimplemented beside it. The panel's own button called a local
// `exportFixtures`, and a second copy would have been correct exactly until one of them was fixed.
// Both call this now.
//
// READ-ONLY WHILE IT RUNS: the recorder observes `call()` and the host-fed writes, and changes
// nothing about what the region does. Stopping is what produces the file.
import { startSeedRecording, stopSeedRecording, type RecordedSeed } from '@motu/core';
import { startRecording, stopRecording, type RecordedCall } from '@motu/runtime';
import { renderRecordedFixtures } from './model';
import { lens } from './store';

/**
 * Serialise a capture, hand it to the human, and say what happened.
 *
 * BOTH DOWNLOAD AND CLIPBOARD, because a browser cannot write into the workspace and neither route
 * is reliable on its own: a sandboxed page may refuse the download, a page without focus may refuse
 * the clipboard. Whichever works, the text got out.
 */
export function exportFixtures(calls: RecordedCall[], seedWrites: RecordedSeed[]): string {
  const seen = new Set<string>();
  const unique: RecordedCall[] = [];
  for (const c of calls) {
    const key = `${c.service}.${c.method}(${JSON.stringify(c.args)})`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  // Host-fed writes (channels + provide) reduced to a last-wins seed of REAL host config.
  const seed: Record<string, unknown> = {};
  for (const w of seedWrites) seed[w.key] = w.value;
  const seedKeys = Object.keys(seed);
  if (!unique.length && !seedKeys.length) return 'nothing captured (no calls, no host-fed writes)';

  const text = renderRecordedFixtures(unique, seed);
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fixtures.recorded.ts';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unsupported — clipboard still carries it */
  }
  navigator.clipboard?.writeText(text).catch(() => {});
  const parts: string[] = [];
  if (unique.length) parts.push(`${unique.length} call(s)`);
  if (seedKeys.length) parts.push(`${seedKeys.length} seed key(s)`);
  return `${parts.join(' + ')} → fixtures.recorded.ts (downloaded + copied)`;
}

/** Start if stopped, stop-and-export if running. Returns the state the caller should now show. */
export function toggleRecording(): { recording: boolean; status: string } {
  if (!lens.recording) {
    startRecording();
    startSeedRecording();
    lens.recording = true;
    lens.recStatus = '';
  } else {
    const calls = stopRecording();
    const seedWrites = stopSeedRecording();
    lens.recording = false;
    lens.recStatus = exportFixtures(calls, seedWrites);
  }
  lens.changedNow();
  return { recording: lens.recording, status: lens.recStatus };
}

/** What a panel should be showing right now, without having to have been the one that started it. */
export function recordingState(): { recording: boolean; status: string } {
  return { recording: lens.recording, status: lens.recStatus };
}
