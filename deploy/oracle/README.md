# A lagoon host on Oracle Cloud Always Free

Free, permanently, for a box far larger than this needs. What it costs instead is a
signup that asks for a card (never charged on Always Free), a scarce instance shape,
and two firewall layers that are famous for wasting an afternoon.

The host itself is undemanding: pure Node, no native dependencies, no browser, no
image diffing — the CLI does that client-side and only uploads the result. So the
smallest Always Free shape is already oversized, and the real constraint is **disk**.

## 1. Account

Sign up at <https://signup.cloud.oracle.com>. Two things that cannot be changed later:

- **Home region.** Always Free resources exist only there, and cannot cross regions
  later to find capacity. From Australia: **Sydney** (`ap-sydney-1`) — better
  international peering — or **Melbourne** (`ap-melbourne-1`), which sometimes has
  Ampere capacity when Sydney does not.

  Latency lands the right way round. You browsing the gallery and watching live
  reloads is the interactive loop and wants to be close (~10-30 ms). A Claude Code
  cloud session publishing from US infrastructure is one ~1 MB POST plus a 30 s
  heartbeat across a ~200 ms link, which nobody will notice.
- The card is for identity verification. Always Free stays free as long as you never
  click "Upgrade to Paid".

## 2. The instance

Compute → Instances → **Create instance**.

| Field | Value |
| --- | --- |
| Image | Canonical **Ubuntu 24.04** — see the warning below |
| Shape | **VM.Standard.A1.Flex** (Ampere, ARM) |
| OCPUs / memory | 2 OCPU / 12 GB — half the free allowance, leaving room for a second box |
| Boot volume | 50 GB (of the 200 GB free total) |
| SSH keys | paste your `~/.ssh/id_ed25519.pub` |

ARM is a non-issue here: nothing on this box compiles native code or runs Chromium.

**Change the image explicitly, and check it again after changing the shape.** The
wizard defaults to **Oracle Linux**, and the image and shape pickers re-render
together — so switching shape (which you will, when A1 has no capacity) can silently
put the image back. The symptom arrives two steps later and does not mention images:
`ssh ubuntu@…` gives `Permission denied (publickey)` because Oracle Linux's user is
`opc`, and once you are in, `git` and `apt` are both missing. `provision.sh` is
apt-based and does not run on Oracle Linux; recreating the instance with Ubuntu is
much cheaper than porting it, and the VCN, subnet, route table and security list
rules all survive the rebuild.

**"Out of host capacity" is the normal outcome, not an error on your side.** A1 is
oversubscribed in most regions. Options, in order of effort: try a different
availability domain in the same region; try again at a quiet hour; drop to 1 OCPU /
6 GB, which is still plenty; or fall back to the two Always Free AMD micro
instances (`VM.Standard.E2.1.Micro`, 1 GB RAM). That fallback is a real possibility
in the Australian regions, so `provision.sh` adds 2 GB of swap by itself on any box
under 2 GB — the host runs fine in 1 GB, but `tsc` across the workspace OOMs without
it, and the failure looks like an install that simply stopped.

## 3. Open the ports — BOTH layers

This is the step everyone loses an hour to. Oracle blocks inbound traffic in two
independent places and fixing one produces no visible change.

**Layer 1 — the VCN (web console).** Networking → Virtual Cloud Networks → your VCN
→ Subnets → your subnet → its Security List → **Add Ingress Rules**:

| Source | IP protocol | Destination port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**Layer 2 — the instance's own iptables.** Oracle's Ubuntu image ships an INPUT chain
that ends in REJECT. `provision.sh` handles this, including persisting it across
reboots with `netfilter-persistent` — without that, the rules vanish on the first
restart and the site goes dark for no visible reason.

## 4. A hostname, free

Caddy needs a real name to get a certificate. If you do not own a domain:

- **DuckDNS** — <https://www.duckdns.org>, sign in with GitHub, claim
  `something.duckdns.org`, point it at the instance's public IP. Free, no expiry.
- **sslip.io** — no signup at all: `1-2-3-4.sslip.io` resolves to `1.2.3.4`. Fine for
  a first test; the shared Let's Encrypt rate limits make it a poor permanent home.

## 5. Provision

```bash
ssh ubuntu@<public-ip>
git clone --depth 1 https://github.com/Scorbutics/motu.git /tmp/motu
sudo /tmp/motu/deploy/oracle/provision.sh your-name.duckdns.org
```

It installs Node 22, pnpm, Caddy, builds the workspace, generates an upload token,
and starts both services. It is idempotent — re-run it after any change.

Then, on your laptop, `~/.config/motu/host.json`:

```json
{ "url": "https://your-name.duckdns.org", "token": "<printed by provision.sh>" }
```

Verify: `curl -sS https://your-name.duckdns.org/api/live` → `{"live":[]}`.

## 6. Before pointing anything real at it

**Reads are open by default.** On a laptop behind a tunnel that was obscurity; on a
public domain it is publication. Close the door for everything at once — including
repos that do not exist yet, which is the only way to beat the window between an
agent's first publish and your marking it private:

```bash
sudo -u motu MOTU_HOST_DIR=/var/lib/motu-host \
  node /opt/motu/packages/host/src/cli.mjs access --default private
```

A publisher keeps full access to its own lagoon: the upload token reads as admin, so
an agent can read back what it published without holding a read secret. To read a
private lagoon in a BROWSER, mint one and visit it once — it becomes a cookie and the
secret is redirected out of the URL, so every later link is a plain one:

```bash
... access --read          # then open https://<host>/?k=<secret> once, per browser
```

Or decide per repo:

```bash
sudo -u motu MOTU_HOST_DIR=/var/lib/motu-host \
  node /opt/motu/packages/host/src/cli.mjs access --repo Scorbutics/motu --private
```

`MOTU_HOST_DIR` must be set in *your shell too* — the unit file's copy is not in your
environment, and `access` writing a correct policy into the wrong directory reports
success and changes nothing.

**Back up the store.** `/var/lib/motu-host` holds the snapshot baselines, and
accepting a baseline is a decision, not a computation — losing them throws away
judgment you would have to make again.

```bash
# from your laptop, nightly
rsync -az ubuntu@<ip>:/var/lib/motu-host/ ~/backups/motu-host/
```

## Living with Always Free

- **Idle reclamation.** Oracle may reclaim an Always Free compute instance that stays
  idle for 7 days (low CPU, low network). A lagoon host you publish to a few times a
  week is probably fine; a dormant one is not. The cheapest insurance is to keep
  using it, or a cron'd `curl` against your own host.
- **200 GB total block storage**, and the unit caps the store at 1 GB per repo
  (`--max-bytes`). The default is 4 GB per repo, which fills a 50 GB boot volume
  faster than you would expect.
- **No support and no SLA.** This is a preview host, so that is the right trade — but
  do not put anything on it you would be upset to re-create.

## Then: Claude Code cloud sessions

Once the host answers on a public name, cloud sessions can publish to it. In the
cloud environment settings at claude.ai/code:

- **Network access → Custom**, add `your-name.duckdns.org`, and keep the default
  package-manager list ticked or `pnpm install` fails.
- **Environment variables**: `MOTU_HOST_URL` and `MOTU_HOST_TOKEN`. They take
  precedence over `~/.config/motu/host.json`, so no setup script is needed for config.
- Ask the agent to `motu lagoon publish --remote` when it finishes UI work. Each cloud
  session works on its own branch, so each lands at its own URL in the same gallery.
