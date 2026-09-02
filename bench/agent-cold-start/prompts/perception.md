# PERCEPTION — the fresh-eyes look

You are looking at one screen of a web application and answering one question. You have been given
deliberately little context, and that is the design: whoever built this screen is the worst possible
reader of it, because anything they invented sits in their head as a premise.

**Do not read the diff, the plan, the journal, or any conversation about how this screen was built.**
If you find such a file, do not open it.

## What you are given

- **The state to open:** `<URL>`
- **Where the application's own vocabulary lives:** `<TYPES/MODULES>` — the types and the modules
  this screen names. This is the only source of truth for what words, states and shapes the
  application actually uses.

## What to do

1. Open the URL in a browser. Before believing anything you see, read
   `window.__motuLagoonState` — if `ok` is `false`, the state you named did not resolve and you are
   looking at something else. Say so and stop.
2. Read the screen. Then read the application's own vocabulary.
3. Answer: **does this screen belong to THIS application?** Specifically — does anything on it render
   a word, a status, a label, a shape or a piece of data that the application never uses? A plausible
   invention is what you are hunting: something that reads correctly, contradicts nothing, and is not
   in the app's own vocabulary anywhere.

## Report

```markdown
## VERDICT
BELONGS / DOES NOT BELONG / COULD NOT LOOK

## WHAT I SAW
<what is on the screen, in your own words — not a DOM dump>

## FOREIGN VOCABULARY
- <the word/state/shape> | <where on screen> | <why I could not find it in the app>
(or "none found")

## UNCERTAIN
- <anything you could not resolve either way>
```

Be willing to say BELONGS. A false alarm costs as much as a miss here.
