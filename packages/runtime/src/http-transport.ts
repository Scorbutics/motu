import { MotuError, SessionExpiredError, type Transport } from './index';

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  // Group 1 exists whenever the match does — the pattern has exactly one capture.
  return match ? decodeURIComponent(match[1]!) : undefined;
}

/**
 * Talks to the motu dispatcher mounted inside the legacy app's existing JAX-RS `/rest` stack.
 *
 * It inherits that stack's XSRF protection: AngularJS promotes an XSRF cookie into a matching
 * header, and the app's `XsrfFilter` validates it. The names are module-specific (web-console uses
 * cookie `M-XSRF-TOKEN` -> header `X-M-XSRF-TOKEN`), so they are configurable here.
 *
 * Auth failures come back as HTTP 401 (the app deliberately avoids 403 to sidestep an IP-ban
 * heuristic), and an expired session may surface as a legacy 302 -> HTML redirect that `fetch`
 * follows transparently; both are handled below.
 */
export interface HttpTransportOptions {
  /** Name of the XSRF cookie the host module sets (e.g. 'M-XSRF-TOKEN' for web-console). */
  xsrfCookieName?: string;
  /** Name of the header the host's XsrfFilter validates (e.g. 'X-M-XSRF-TOKEN'). */
  xsrfHeaderName?: string;
  onSessionLost?: () => void;
}

export class HttpTransport implements Transport {
  private readonly xsrfCookieName: string;
  private readonly xsrfHeaderName: string;
  private readonly onSessionLost: () => void;

  constructor(
    private readonly base: string = '/rest/motu',
    opts: HttpTransportOptions = {},
  ) {
    this.xsrfCookieName = opts.xsrfCookieName ?? 'XSRF-TOKEN';
    this.xsrfHeaderName = opts.xsrfHeaderName ?? 'X-XSRF-TOKEN';
    this.onSessionLost =
      opts.onSessionLost ??
      (() => {
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        location.href = '/login?returnUrl=' + returnUrl;
      });
  }

  async call<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const xsrf = readCookie(this.xsrfCookieName);

    const res = await fetch(`${this.base}/${service}/${method}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(xsrf ? { [this.xsrfHeaderName]: xsrf } : {}),
      },
      body: JSON.stringify(args),
    });

    if (res.status === 401) {
      this.onSessionLost();
      throw new SessionExpiredError();
    }

    // Backstop for a legacy 302 -> login HTML that fetch followed and returned as 200 text/html.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      this.onSessionLost();
      throw new SessionExpiredError();
    }

    if (!res.ok) {
      throw new MotuError(res.status, await res.text());
    }

    return (await res.json()) as T;
  }
}
