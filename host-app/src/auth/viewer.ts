// WHO IS ASKING, reduced to the two things a screen needs.
//
// A HANDLE AND A LETTER, and deliberately nothing else. GitHub hands us a name, an email, a provider
// id and an `avatar_url`; every one of those is more than a badge in the corner of a page requires,
// and two of them are the visitor's to keep. The email in particular never leaves the server here.
//
// AND NOT THE AVATAR URL. It points at `avatars.githubusercontent.com`, so rendering it would make
// every page load of this host a request to GitHub carrying the visitor's IP and referer — for a
// 30px circle. The sand disc with an initial is the design's own avatar anyway; it costs no request,
// it cannot fail to load, and it keeps the host's pages self-contained, which is the property
// `lagoon publish` warns about losing.

/** What a screen may know about whoever is signed in. */
export type Viewer = {
  /** Their GitHub login. What a person recognises themselves by. */
  handle: string
  /** One character for the disc. Upper-cased here so no component has to decide. */
  initial: string
}

type UserLike = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
} | null

/**
 * The handle, from whichever field the provider actually filled.
 *
 * FOUR FALLBACKS, in the order of how much they say. `user_name` is the GitHub login and is what is
 * populated in practice; the rest are here because a provider that is not GitHub — or a GitHub
 * account with an unusual profile — must still produce a badge rather than an empty circle.
 */
export function viewerFrom(user: UserLike): Viewer | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  const pick = (key: string) => (typeof meta[key] === 'string' && meta[key] ? (meta[key] as string) : null)
  const handle =
    pick('user_name') ?? pick('preferred_username') ?? pick('name') ?? (user.email ? user.email.split('@')[0] : null)
  if (!handle) return null
  return { handle, initial: handle.slice(0, 1).toUpperCase() }
}
