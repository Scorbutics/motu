// OBS Studio over its built-in WebSocket server (OBS 28+). Start/stop and the recording clock — the
// clock is what places every scene marker on the recording's own timeline.
import OBSWebSocket from 'obs-websocket-js';
import { OBS } from '../config.mjs';

export async function connectObs() {
  const obs = new OBSWebSocket();
  try {
    await obs.connect(OBS.url, OBS.password);
  } catch (e) {
    throw new Error(
      `cannot reach OBS at ${OBS.url} (${e.message}).\n` +
        '  In OBS: Tools → WebSocket Server Settings → Enable, then export OBS_PASSWORD=<the password>.',
    );
  }
  return {
    async setDir(dir) { await obs.call('SetRecordDirectory', { recordDirectory: dir }); },
    async start() {
      await obs.call('StartRecord');
      for (let i = 0; i < 50; i++) {
        const s = await obs.call('GetRecordStatus');
        if (s.outputActive) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('OBS did not start recording');
    },
    /** Milliseconds into the recording, by OBS's own clock. */
    async now() { return (await obs.call('GetRecordStatus')).outputDuration; },
    async stop() { return (await obs.call('StopRecord')).outputPath; },
    async status() { return obs.call('GetRecordStatus'); },
    disconnect: () => obs.disconnect(),
  };
}
