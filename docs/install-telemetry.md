# Install counting

Downloads are not installs. Every release has 15 assets, and the updater
fetches `latest.yml` and `.blockmap` files on its own, so the GitHub download
count answers "how many files were served", not "how many people run this".
That gap is the reason this exists.

## What it does

One small POST from a machine that opted in, at most once per day.

Payload, exactly five fields:

```json
{ "installId": "<random uuid v4>", "appVersion": "4.3.1", "platform": "win32", "arch": "x64", "firstPing": true }
```

`installId` is generated locally with `crypto.randomUUID()` on first run and
stored in `install-id.json` under the app's `userData` directory with mode 0600.
It is not derived from the hostname, the username, a serial number, or anything
else about the machine. Deleting that file makes the install look new.

## What it never sends

No hostname, no username, no IP, no MAC, no serial, no file paths, no evidence
data, no control results, no organisation name. The worker does not log request
headers and does not store the caller's address.

## Policy: on by default, off on request

Release builds report by default. `electron/telemetry-config.js` holds the baked
endpoint and `defaultEnabled: true`, and `electron/main.js` fires the ping after
the licence loads.

- `CG_TELEMETRY_ENABLED=0` stops it permanently. That wins over the build default.
- `CG_TELEMETRY_ENABLED=1` plus `CG_TELEMETRY_URL` points a build at another
  collector, which is how the endpoint is tested.
- A cleartext URL is ignored rather than used, so a mistake cannot quietly
  downgrade the channel. If the baked endpoint itself is not https, nothing is
  sent.
- Enterprise licences never report: `main.js` skips the ping entirely when
  `licenseManager.getTier() === 'enterprise'`, matching the
  `enterprise_no_telemetry` gate in `shared/constants.json`.
- The first run shows a notification saying the count is on, what it sends, and
  how to stop it. `noticePending()` records that it was shown, so it never nags.

Why default-on: the alternative is a counter that stays at zero and a number
nobody can defend. The cost of default-on is that it must be disclosed, so it is
disclosed in the README, in this file, and in the app itself on first run.

## Deploying the collector

The worker lives in `worker/install-ping/`.

1. `npx wrangler kv namespace create INSTALLS`, paste the id into `wrangler.toml`.
2. `npx wrangler secret put STATS_TOKEN` with a long random string.
3. `npx wrangler deploy`.
4. Read the numbers: `GET https://<worker>/stats?token=<STATS_TOKEN>` returns
   `{ installs, pings, dau, day }`, where `installs` is distinct installations
   ever seen and `dau` is distinct installations seen that UTC day.

## Reading the numbers honestly

Opt-in counting undercounts. Some people never set the flag, and an install that
blocks outbound traffic never reports. So the number is a floor, not a total,
and it should be described that way: "N installs reporting in", never "N users".

Each install is a machine, not a person, and one person with a laptop and a
desktop is two installs. That is still far closer to the truth than a download
count, and unlike a download count it can be defended when somebody asks how it
was measured.

## Tests

`npx vitest run --config vitest.config.electron.cjs electron/install-ping.test.js`
covers the opt-in gate, the https-only rule, id stability, payload shape (no
hostname or username in it), daily throttling, and the failure paths.

## Deployment record (2026-11-26)

Live and verified, not just configured:

- Worker: `https://complianceguard-install-ping.cguard.workers.dev`
- KV namespace `INSTALLS`: `21c076aa0b48444fb93d7c02858d7dea`
- Secret `STATS_TOKEN` is set on the worker. The value is NOT in this repo; it is
  kept by the operator.
- Read the counters:
  `curl "https://complianceguard-install-ping.cguard.workers.dev/stats?token=<STATS_TOKEN>"`

Checked on the day of deployment: a valid ping returns 202; the same install id
sent twice does not double count; a malformed id returns 400; a body carrying
`hostname` and `username` is accepted but those fields are ignored and never
stored; `/stats` returns 403 without the token; a fresh install increments both
`installs` and `dau`. The real client module was run against the live worker and
returned `sent`, then `throttled` on the second call, then `disabled` with no
flag, which is the whole contract in three calls.

A first-ping bug was found here and fixed in `f0123dbe`: a brand new install was
counted in `installs` but not in `dau`, because only repeat pings bumped the
daily counter.

## What the number still cannot tell you

Installs already shipped at the time of writing predate this code, so they never
report. Only builds cut from this commit onward count. A machine that blocks
outbound traffic never reports either. So the figure is a floor for the period
after the first release that includes this code, and it is worth nothing as a
measure of the past.
