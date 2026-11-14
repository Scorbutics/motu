// Everything the recording depends on, in one place. Override any of it with the env var named beside it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILM = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(FILM, '../..');

export const LAGOON = process.env.FILM_LAGOON ?? 'http://localhost:8817'; // motu lagoon serve --watch
export const APP = process.env.FILM_APP ?? 'http://localhost:5300'; //      pnpm --filter @demo-app/app dev
export const STUDIO = process.env.FILM_STUDIO ?? 'http://127.0.0.1:54523'; // supabase studio (db:start)

// Dennis Shaw: ACTIVE, even member_no → the seed gives him availability over the next 21 weekdays.
export const MEMBER_ID = '00000000-0000-4000-8000-000000702564';
// The app keeps "who you are" here (roots/app/src/lib/session.ts). A fresh recording profile would be a guest.
export const SESSION_KEY = 'motu-club:signed-in-as';

// The prompt, validated with the author. Typed on camera, character by character.
export const PROMPT =
  "Build the booking calendar on the profile page with several agents, one per planned island. When it's merged and checked, open the lagoon on picking a day, then a slot, and the summary confirming it.";

export const ARCHIPELAGO = path.join(REPO, 'demo-app/src/archipelagos/profile/profile.archipelago.ts');
export const USERS_ARCHIPELAGO = path.join(REPO, 'demo-app/src/archipelagos/users/users.archipelago.ts');

export const OBS = {
  url: process.env.OBS_URL ?? 'ws://127.0.0.1:4455',
  password: process.env.OBS_PASSWORD, // Tools → WebSocket Server Settings → Show Connect Info
};

export const TMUX = 'film';
// Whatever starts Claude Code for the take. Add a permission mode here if you want fewer prompts on camera.
export const CLAUDE_CMD = process.env.FILM_CLAUDE ?? 'claude';

// The build is "done" when the archipelago has no planned island left AND the Claude pane has been
// still this long. Or press F9 in the terminal: the manual cue always wins.
export const IDLE_MS = Number(process.env.FILM_IDLE_MS ?? 90_000);

export const TAKES = path.join(FILM, 'takes');
