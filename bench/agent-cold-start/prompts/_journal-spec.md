# Journal spec (shared by every arm)

Write `<RUN_DIR>/journal.md` AS YOU GO — not at the end. A journal reconstructed from memory loses
exactly the events this bench exists to count.

```markdown
# Journal — <arm id>

## FRICTION
One line per event, in the order it happened:
- STEP <n> | <what I was trying to do> | <what happened> | <how I got past it> | KIND: <kind>

KIND is one of:
  docs-dive            I had to open motu's docs/ to proceed
  source-dive          I had to read motu's packages/ source to proceed
  cli-error-unclear    a command failed and its message did not tell me what to do
  hand-edit-generated  I edited a file the CLI generates
  workaround           I did something motu did not intend, to get past something
  missing-command      I wanted a command that does not exist
  wrong-default        a default was wrong for this project and I had to change it
  env-broken           install/browser/port — NOT motu's model. Report, do not repair.

## DOC DIVES
- <file I opened under /home/scorbutics/dev/motu> | <the question it answered> | <could `motu --help`
  or the failing command's own output have answered it? yes/no>

## LAST MILE
- first moment the region was green in the lagoon: STEP <n>
- files touched after that, to land it on the real page: <list>
- surprises the lagoon had not shown me: <list, or "none">

## WHAT I COULD NOT DO
- <anything left unfinished, and why. An honest stop beats a fabricated finish.>

## VERDICT
2–4 specific sentences: did motu concretely help here versus doing this change by hand? Name the
moment it did or the moment it got in the way.
```

## Rules that bind every arm

- **The motu checkout at `/home/scorbutics/dev/motu` is READ-ONLY.** Never edit it. If you believe
  motu itself has a bug, write it in FRICTION and work around it or stop.
- **Do not repair shared infrastructure.** A failed install, a missing browser, a port that never
  opens is `env-broken`: log it and report. An agent that improvises past a broken environment
  produces a false result for everyone.
- **Report honestly.** A partial result with an accurate WHAT I COULD NOT DO is worth more to this
  bench than a finish that glosses. You are being measured on motu, not on yourself.
- **Stay in your repo.** Do not touch the other arms' repositories.
