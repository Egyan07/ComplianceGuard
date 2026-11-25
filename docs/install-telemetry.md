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

## Turning it on

Off by default. Both of these have to be set, and the URL must be https:

```
CG_TELEMETRY_ENABLED=1
CG_TELEMETRY_URL=https://<worker>.<account>.workers.dev/
```

A cleartext URL is refused rather than downgraded, so a misconfiguration fails
closed. The ping is fired without `await` during startup and every failure is
swallowed, because this tool is expected to run on hosts with no outbound
network at all.

Enterprise installations must stay off: the `enterprise_no_telemetry` gate in
`shared/constants.json` already says telemetry is not part of what an
enterprise customer receives.

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
