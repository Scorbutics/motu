# The README film

A ~75 s silent video for the top of the motu README: the demo app's booking calendar, built on camera
by agents, with captions instead of a voice. Everything that can be scripted is scripted; the build
itself is real and only sped up.

    record.mjs          the take: drives the browser, the terminal and OBS; writes scene markers
    lib/up.mjs          the tmux stage the fullscreen terminal shows
    lib/watch-worktrees the right-hand pane during the build: each agent's files appearing
    take.sh             takes are branches (film/take-N), so nothing reaches main unreviewed
    edit/src/cut.ts     THE EDIT: captions, durations, zooms — change and re-render
    edit/prepare.mjs    a take's recording → the edit       edit/render.mjs   → hero.mp4 (< 10 MB)

## Once

```
cd demo-app/film && pnpm install --ignore-workspace     # standalone, not a workspace member
```

OBS (33+), first launch:
1. **Tools → WebSocket Server Settings**: enable, set a password, then `export OBS_PASSWORD=…`
2. **Sources → + → Screen Capture (PipeWire)**: pick the screen (GNOME asks once).
3. **Settings → Output → Recording**: format **mkv**, encoder **NVIDIA NVENC H.264**, quality *Indistinguishable*.
   **Video**: base and output 1920×1080, 30 fps.

## Each take

Terminal 1 — the services (leave them running):
```
pnpm --filter @demo-app/app db:start        # if Supabase is not already up
pnpm --filter @demo-app/app dev             # http://localhost:5300
motu lagoon serve --watch --detach          # http://localhost:8817
```

Then, from the repo root on `film/hero`:
```
bash demo-app/film/take.sh new              # → film/take-N, fresh database
```

Terminal 2 — the camera's terminal. Make it **fullscreen (F11)**, font **~18 pt**, then:
```
cd demo-app/film && pnpm up
```
You land in the `ctl` window. Claude Code is already starting in the `stage` window. Turn on
**Do Not Disturb**, close everything else (14 GB is tight with OBS + Chrome + Supabase + 4 agents),
then press **Enter**. From there:

| scene | what happens | you |
|---|---|---|
| wall · real · declared | Chrome goes fullscreen: lagoon, the app, Studio, the profile's "Declared, not built" | watch |
| prompt | Chrome minimises; the prompt is typed into Claude Code | watch |
| build | the agents work; the right pane shows their worktrees filling | **answer any permission prompt**; press **F9** if it is done but still not moving on |
| lagoon | Chrome returns on the member screen, then the agents' flow step by step | watch |
| checks · failure | `motu check`, `integrate check`, then one line makes `users` go red, and back | watch |
| same | lagoon and app side by side | watch |

The build ends by itself when `profile.archipelago.ts` has no `planned: true` left **and** Claude has
been still for 90 s (`FILM_IDLE_MS`). The recording and `markers.json` land in `takes/take-N/`.

Afterwards: `pnpm take:keep` (commits the build on the take branch, back to `film/hero`) or
`pnpm take:reset` (throws it away — worktrees, files, database — to retry the same take).
`tmux kill-session -t film` before the next `pnpm up`.

## Edit

```
pnpm prepare-edit take-N        # remux, markers → edit/public
pnpm studio                     # scrub it; tune edit/src/cut.ts (captions, seconds, zoom)
pnpm render                     # edit/out/hero.mp4, two-pass to fit 9.5 MB
```
Drag `hero.mp4` into the README editor on github.com: it becomes a `user-attachments` URL. GitHub
does not autoplay README video, so frame 0 is the poster — it opens on the lagoon with its caption.

## Honest by construction

- Every caption must be something the footage shows. "Same component, different answers" — never
  "the same code path runs in both" (../RECORDING.md, *What is NOT proved*).
- The build shot carries its real speed-up and real duration (`▶▶ 64× · 23 min real time`).
- The URL chip during the lagoon steps is the address record.mjs actually opened, from the markers.
