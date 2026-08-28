import { visibilityFor } from '@/src/host/visibility'
import { store } from '@/src/host/store'
import { canRead } from '@motu/host/src/access.mjs'
import { access } from '@/src/host/store'

const userId = process.argv[2]
const s = store()
const members = (s.resolveGroup as (n: string, e: unknown) => Array<{ repo: string }>)('everything', null)

const asViewer = await visibilityFor({ viewer: { userId }, shareToken: null })
const asAnon = await visibilityFor({ viewer: null, shareToken: null })

console.log('  member                              host(access.json)  app(anon)  app(signed in)')
for (const m of members) {
  const host = canRead(access(), m.repo, { adminOk: false, readSecret: null })
  console.log(
    `  ${m.repo.padEnd(36)}${String(host).padEnd(19)}${String(await asAnon(m.repo)).padEnd(11)}${await asViewer(m.repo)}`,
  )
}
