# Moving the lagoon host to a domain you own

From `something.duckdns.org` to `lagoon.example.com`, with no window where neither works.
Worked through for **Porkbun** DNS; any registrar with plain A records is the same shape.

The whole thing is four steps and about twenty minutes, most of it waiting for DNS.

---

## 0. First decide what the A record points at

This is the one decision in the runbook, and getting it wrong is invisible until the day
it matters.

An OCI **ephemeral** public IP lasts as long as the instance: it survives reboots and
stop/start, and is released only on terminate. So "ephemeral" is a worse word than the
behaviour deserves — it is not a treadmill.

But the reason to care is not stop/start, it is **terminate**, and on Always Free there is
one path to a terminate you did not ask for: **Oracle's idle-instance reclamation.** A
lagoon host is idle by their definition nearly all the time — it serves a page when someone
opens it and does nothing in between. Today `duckdns.org` is what makes that survivable:
rebuild the box and the record repairs itself within five minutes.

Moving to a hand-written A record on an ephemeral IP **throws that insurance away and buys
nothing**. Pick one of these instead:

| | what | cost |
|---|---|---|
| **Reserve the IP** (recommended) | OCI console → Networking → **Reserved public IPs**, then reassign the instance's VNIC to it. An A record then points at an address you keep, and a replacement instance can re-attach it. | free, ~2 min, and duckdns stops being needed |
| CNAME at duckdns | `lagoon` → `CNAME` → `something.duckdns.org`. The timer keeps repairing, the pretty name follows. | zero effort, costs a lookup and a dependency on duckdns |
| A record at the ephemeral IP | works until the instance is ever replaced, then silently points at nothing | don't |

Reserving is free and permanent. Do that.

---

## 1. Add the DNS record at Porkbun

**Domain → Details → DNS**, then add:

| Type | Host | Answer | TTL |
|---|---|---|---|
| `A` | `lagoon` | *the reserved IPv4* | `600` |

Use a **600s TTL while cutting over** — it costs nothing and means a mistake is ten minutes
to undo instead of a day. Raise it to `3600` once it works.

Porkbun serves plain DNS with no proxy in front, which is what you want here: Caddy's ACME
challenge has to reach the box directly.

Confirm before going further — a name that does not resolve cannot get a certificate, and
Caddy's failure for that arrives minutes later in a log nobody is reading:

```bash
dig +short lagoon.example.com          # must print the reserved IP
```

`provision.sh` now checks this too and warns rather than proceeding silently.

---

## 2. Re-run provisioning with BOTH names

```bash
sudo /opt/motu/deploy/oracle/provision.sh lagoon.example.com,something.duckdns.org
```

One site block, both hostnames, a certificate for each. The old URL keeps working, so
nothing that has the old link breaks while you are still testing. The **first** name is
canonical — it is what gets printed and what belongs in `host.json`.

If you kept the duckdns name and still have the token, pass it and the timer is rebuilt:

```bash
sudo DUCKDNS_TOKEN=xxxx /opt/motu/deploy/oracle/provision.sh lagoon.example.com,something.duckdns.org
```

Check both answer:

```bash
curl -sS https://lagoon.example.com/api/live      # -> {"live":[]}
curl -sS https://something.duckdns.org/api/live   # -> {"live":[]}
```

`.dev` IS HSTS-PRELOADED — every browser refuses plain HTTP for the whole TLD, with no
warning page and no click-through. There is nothing to configure (Caddy redirects to HTTPS
anyway), but it does mean a certificate that failed to issue looks like a dead domain rather
than an insecure one. If the page will not load at all, check the certificate first.

---

## 3. Point the CLI at the new name

`~/.config/motu/host.json` on every machine that publishes:

```json
{ "url": "https://lagoon.example.com", "token": "<unchanged>" }
```

The token is unchanged — it lives in `/etc/motu-host.env` on the box and is not tied to a
hostname.

```bash
motu lagoon publish --remote      # should print URLs on the new host
```

If the box's access policy pins the old hostname (`Network access → Custom` in the README's
hardening section), add the new name there too or publishing will 403 against a host that is
otherwise healthy.

---

## 4. Drop the old name, later

Not today. Leave both live until nothing points at the duckdns URL — old links in commit
messages, a bookmark, a README. When you are ready:

```bash
sudo /opt/motu/deploy/oracle/provision.sh lagoon.example.com
```

Caddy stops serving the old name. The duckdns timer stays installed and harmless; remove it
with `systemctl disable --now duckdns.timer` if you reserved the IP and no longer want it.
