import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { CUT, END_CARD_SECONDS, FPS, type Shot } from './cut';
import take from '../public/take.json';

type Marker = { id: string; t: number; url?: string };
const markers = (take as { markers: Marker[] }).markers;
const at = (id: string) => markers.find((m) => m.id === id)?.t;

const INK = '#1d2140';
const GOLD = '#e2c48a';
const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';

/** Each shot resolved against this take's markers: where it reads from, how fast, how long. */
export const plan = () => {
  let from = 0;
  return CUT.flatMap((shot) => {
    const a = at(shot.from), b = at(shot.to);
    if (a == null || b == null || b <= a) return []; // a scene that did not happen is not in the film
    const rawSec = (b - a) / 1000;
    const outSec = Math.min(shot.seconds, rawSec);
    const frames = Math.round(outSec * FPS);
    const p = { shot, startFrame: Math.round((a / 1000) * FPS), rate: rawSec / outSec, frames, from, rawSec };
    from += frames;
    return [p];
  });
};

export const totalFrames = () => {
  const p = plan();
  return (p.at(-1) ? p.at(-1)!.from + p.at(-1)!.frames : 0) + Math.round(END_CARD_SECONDS * FPS);
};

/**
 * The address the browser is on, while it is on it. Recorded by record.mjs at each step it opened —
 * the fullscreen browser has no URL bar, and "every step is a URL" should be seen, not claimed.
 */
function UrlChip({ a, rate }: { a: number; rate: number }) {
  const f = useCurrentFrame();
  const ms = a + (f / FPS) * rate * 1000; // where in the recording this frame is
  const current = markers.filter((m) => m.url && m.t <= ms).at(-1);
  if (!current || ms - current.t > 60_000) return null;
  return (
    <div style={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 24, color: '#fff', background: 'rgba(29,33,64,.88)', padding: '10px 20px', borderRadius: 10, border: `2px solid ${GOLD}`, whiteSpace: 'nowrap' }}>
      localhost{current.url}
    </div>
  );
}

function Caption({ shot, frames, first }: { shot: Shot; frames: number; first: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!shot.caption) return null;
  // The very first frame is GitHub's poster: the opening caption is already there, not fading in.
  const enter = first ? 1 : spring({ frame: f - 4, fps, config: { damping: 200 } });
  const exit = interpolate(f, [frames - 10, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', left: 64, bottom: 72, maxWidth: 1200, opacity: enter * exit,
      transform: `translateY(${(1 - enter) * 24}px)`, fontFamily: FONT,
    }}>
      <div style={{ display: 'inline-block', background: 'rgba(29,33,64,.88)', padding: '18px 28px 20px', borderRadius: 14, borderLeft: `6px solid ${GOLD}`, boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <div style={{ color: '#fff', fontSize: 56, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05 }}>{shot.caption}</div>
        {shot.sub && <div style={{ color: GOLD, fontSize: 28, fontWeight: 600, marginTop: 8 }}>{shot.sub}</div>}
      </div>
    </div>
  );
}

function SpeedBadge({ rate, rawSec }: { rate: number; rawSec: number }) {
  if (rate < 4) return null; // only the timelapse says so; a 2× trim is just editing
  const real = rawSec >= 90 ? `${Math.round(rawSec / 60)} min` : `${Math.round(rawSec)} s`;
  return (
    <div style={{ position: 'absolute', top: 36, right: 40, fontFamily: FONT, fontSize: 26, fontWeight: 700, color: '#fff', background: 'rgba(29,33,64,.8)', padding: '8px 16px', borderRadius: 999 }}>
      ▶▶ {Math.round(rate)}× · {real} real time
    </div>
  );
}

function Footage({ startFrame, rate, frames, shot }: { startFrame: number; rate: number; frames: number; shot: Shot }) {
  const f = useCurrentFrame();
  const z = shot.zoom;
  const s = z ? interpolate(f, [0, frames], [1, z.scale], { extrapolateRight: 'clamp' }) : 1;
  return (
    <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: z ? `${z.x}% ${z.y}%` : 'center' }}>
      <OffthreadVideo src={staticFile('take.mp4')} startFrom={startFrame} playbackRate={rate} muted />
    </AbsoluteFill>
  );
}

function EndCard() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 14 } });
  const line = (d: number) => ({ opacity: interpolate(f, [d, d + 12], [0, 1], { extrapolateRight: 'clamp' }) });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 35%, #2b3270, ${INK})`, alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: '#fff' }}>
      <Img src={staticFile('motu-icon.svg')} style={{ width: 160, height: 160, transform: `scale(${pop})` }} />
      <div style={{ fontSize: 120, fontWeight: 900, letterSpacing: -4, marginTop: 12, ...line(6) }}>motu</div>
      <div style={{ fontSize: 34, color: GOLD, fontWeight: 600, marginTop: 4, ...line(14) }}>Build a page one region at a time — coherent by what is declared.</div>
      <div style={{ fontSize: 30, marginTop: 48, opacity: 0.9, ...line(24) }}>github.com/Scorbutics/motu · try the live lagoon at motu.bulgarelli.dev</div>
    </AbsoluteFill>
  );
}

export const Hero: React.FC = () => {
  const p = plan();
  const endFrom = p.at(-1) ? p.at(-1)!.from + p.at(-1)!.frames : 0;
  return (
    <AbsoluteFill style={{ background: INK }}>
      {p.map(({ shot, startFrame, rate, frames, from, rawSec }, i) => (
        <Sequence key={shot.from} from={from} durationInFrames={frames}>
          <Footage startFrame={startFrame} rate={rate} frames={frames} shot={shot} />
          <SpeedBadge rate={rate} rawSec={rawSec} />
          {markers.some((m) => m.url && m.t >= at(shot.from)! && m.t <= at(shot.to)!) && <UrlChip a={at(shot.from)!} rate={rate} />}
          <Caption shot={shot} frames={frames} first={i === 0} />
        </Sequence>
      ))}
      <Sequence from={endFrom} durationInFrames={Math.round(END_CARD_SECONDS * FPS)}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
