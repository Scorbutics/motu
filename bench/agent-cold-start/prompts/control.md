# CONTROL — the same change, without motu

You are making a UI change to an application you have never seen, using the application's own
toolchain. You are being observed, and the point is to record how the work actually went — where you
guessed, what you verified, and what you never saw with your own eyes.

**You have never heard of motu. Do not read, install, or run anything named `motu`.** If you find
files or configuration mentioning it in the repository, ignore them; they are not yours.

## Your environment

- **Your repository:** `/home/scorbutics/dev/motu-bench/formbricks` — the Formbricks
  monorepo. The Next.js app is `apps/web`. Dependencies are installed; do not run `pnpm install`.
- **Typecheck:** `pnpm --filter @formbricks/web run typecheck` from the repo root. Its baseline
  before your change is `/tmp/base-fb-tsc.log` — only NEW errors are yours.
- **Your run directory:** `/home/scorbutics/dev/motu-bench/runs/control/` — create it.

## The change

`apps/web/modules/auth/login/components/login-form.tsx` (~369 lines) is the sign-in form: email +
password, OAuth/SSO provider buttons, a pending state, a server error, an "email just verified"
notice, a prefilled email.

Split the OAuth / SSO provider buttons out of `LoginForm` into their own component. The two pieces
then share one piece of state: which provider the user has picked and is waiting on. While a provider
is pending, the email/password form must show a pending state and not be submittable.

Land it on the real page (`apps/web/modules/auth/login/page.tsx` renders it), and get the app's
typecheck green.

## What I need recorded

Write `/home/scorbutics/dev/motu-bench/runs/control/journal.md` **as you go**:

```markdown
# Journal — control

## WHAT I DID
- STEP <n> | <action> | <how I knew it was right>

## VERIFICATION
- Did I ever SEE this screen rendered? yes/no — and if yes, how, and in which of its states
  (idle / pending / server error / just-verified / prefilled email). If no, say so plainly.
- What did I rely on instead of seeing it?

## SHARED STATE
- Where does the "pending provider" state live now, and which components read or write it?
- Is there anything stopping a future change from writing it from a second place?

## RISK
- What could be broken in this change that nothing I ran would have caught?

## COST
- Roughly how many tool calls, and where did they go?
```

Be exact and unflattering in VERIFICATION and RISK — a confident "it's fine" is the least useful
thing you can write here.

## Budget and stopping

Work efficiently. If stuck for more than ~15 tool calls on one thing, record it and move on.

## Your final report to me

Short: what you changed, whether you ever saw it render, and the one thing you are least sure about.
