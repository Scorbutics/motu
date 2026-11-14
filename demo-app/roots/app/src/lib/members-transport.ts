// The transport the page installs: the contract's one seam, answered by the app's own source.
//
// `member-results` calls `MemberService.search(page, criteria)` and has no idea what answers it.
// In the lagoon that is a MockTransport over recorded fixtures. Here it is Postgres. Neither the
// island nor the region changes between the two, which is the property the whole design is for.
import type { Transport } from '@motujs/runtime';
import { membersSource, type MembersPort, type MemberCriteria } from 'demo-app';

export function membersTransport(ports: { members: MembersPort }): Transport {
  const source = membersSource(ports.members);
  return {
    async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
      if (service === 'MemberService' && method === 'search') {
        const [page, criteria] = args as [number, MemberCriteria];
        return (await source.search(Number(page) || 0, criteria ?? {})) as T;
      }
      // LOUD, not empty. A service this app has not implemented is a gap in the app, and returning
      // a plausible empty page for it is how that gap reaches production looking like no data.
      throw new Error(`no implementation for ${service}.${method} in this app`);
    },
  };
}
