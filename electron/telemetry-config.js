'use strict';

/**
 * Build-time telemetry defaults.
 *
 * `defaultEnabled: true` means a release build reports one anonymous ping a day
 * unless the user turns it off. That is deliberate: a counter nobody opts into
 * counts nothing, and this product's numbers should be measured rather than
 * guessed. The trade is disclosure, so `docs/install-telemetry.md`, the README
 * and a one-time in-app notice all say what is sent and how to stop it.
 *
 * To ship a build with no reporting at all, set `defaultEnabled` to false here.
 * To disable just one machine, `CG_TELEMETRY_ENABLED=0` wins over this file.
 *
 * Enterprise licences are excluded by the caller regardless of what this says,
 * because `enterprise_no_telemetry` is part of what that tier buys.
 */

module.exports = {
  url: 'https://complianceguard-install-ping.cguard.workers.dev/',
  defaultEnabled: true,
};
