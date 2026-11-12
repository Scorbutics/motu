# share-links — the final look, by a fresh agent (2026-11-12)

Given: six lagoon state URLs, where the app's share-link vocabulary lives, and the question "does this
screen belong to THIS application?". Not given: the spec, the diff, the transcript.

**Verdict: belongs, with gaps.** Statuses (revoked beats expiry), scope (null = every), "never" as a
deliberate choice, the token shape (randomBytes(24) base64url) and revoked rows staying on the list all
match the app's own code.

Findings (verbatim in substance):
1. The form defaults to a WHOLE-PROJECT link — the scope mint-share-link.mjs says "should be rare".   → Q3
2. Only the bare token, never the link to send (`/<repo>/<sha|latest>/<slug|all>?k=<token>`).        → Q2
3. "Revoke this link? Whoever holds it loses access at once." — false for an expired link, overstated
   for members (authorize falls through to the session rules).                                       → fixed
4. Revoked rows hide their expiry; the app treats revoked-after-expiry as a different fact.          → fixed
5. An expired row reads "expires <past date>".                                                       → fixed
6. "commit"/"page" are the request's words, not the code's (sha/ref, slug); no way to follow `latest`. → Q4
7. No project named on the page (lagoon: the root's own props are not filled); created_by never shown. → Q5
8. After creating a permanent link the form stays armed for another, without asking again.           → fixed
9. While a request is in flight the form stays editable.                                             → fixed
10. The fixture token AQEB… is visibly not random (shape right).                                     → kept
