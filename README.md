# Role Window

[Try the fictional simulator](https://brodyga45.com/apps/role-window/) · [Operator guide](https://brodyga45.com/apps/role-window/guide.html)

A one-server Discord verification-role timer with persistent state, a preview mode and a fictional browser simulator. It complements an existing verification flow: it does not assign a verification role or replace your verification provider.

## Try the simulator

Node24+ only; no npm install, token, Discord account or network API is required:

```sh
node demo/server.mjs
```

Open http://127.0.0.1:8801. Verify Alex, advance15minutes, restart the demo worker, and try a simulated lost response. All names and actions are fictional. Browser-local storage keeps this sandbox’s state. The simulator shares the timer engine with the actual bot, but its persistence adapter is localStorage rather than SQLite.

## Real bot setup

Use your own bot application and one server you administer. The supplied example starts in preview mode.

1. Use Node24+, then run `npm ci --ignore-scripts`.
2. Copy `config.example.json` to `config.json`; set the server ID and the existing unverified-role ID. Keep the config and runtime database in your environment.
3. Enable the Guild Members intent under the bot’s current Discord portal requirements. Message Content and Presence intents are not requested. Install the bot in that one server with Kick Members; its role must be above members it is intended to moderate. Administrator is not required.
4. Supply `DISCORD_BOT_TOKEN` through your local secret manager or private environment. Never paste a token into the demo, a support chat, a public file or a Git commit.
5. Run `node bot/discord.mjs config.json`. Inspect the ready/mode/queue summary and the persistent audit history. Default `dryRun:true` rechecks and logs without making kick requests; hierarchy problems are reported as blocked.
6. Choose the backlog/reconnect policy described below. Verify the exact role, exemption list and preview list on a small authorized test case before activating the agreed moderation policy.
7. Once the server operator has agreed the scope and current preview, setting `dryRun:false` enables real kicks. A kick does not ban the person. Due timers are checked every10seconds and the member is fetched again immediately before a request.

Run exactly one worker per database. Use your existing always-on host/process supervisor. No hosted service, subscription, server account or paid resource is supplied by this repository.

## Role age, restarts and offline gaps

Discord’s current member object exposes current roles and a guild join time, not the historic time each role was granted. We therefore do not use join time as proof of role age. A previously unseen unverified member receives a fresh15-minute grace from first observation. A live role removal cancels the timer; a later regrant starts a new generation and grace.

Timers and audit records survive a SQLite reopen. Offline role removal/regrant events may still be unknowable. The supplied **fresh_grace** reconnect policy conservatively grants known, still-unverified members another full grace after startup/reconnect. This can extend their wait; it does not pretend the original role grant was just observed. The explicit **preserve_known** option retains existing deadlines, accepting that an offline remove/regrant cannot be reconstructed. Choose it only when that limitation fits the operator’s actual policy. Neither option invents a historical role age for a new backlog member.

The browser’s “Restart demo worker” proves storage restoration; it does not simulate the real gateway reconnect policy. Unknown moderation requests remain held across a reconnect.

## Held outcomes and permissions

A failed recheck causes no moderation request. A permission/hierarchy block is held. Before a real kick the request is durably marked unknown; success then closes that timer. Discord REST retries are explicitly disabled (the SDK default is three retries), so a timeout/500 cannot silently resend a moderation request below this engine. If the response is lost or the process stops in between, the worker does not blindly replay the request.

Stop the worker before reviewing a held record:

```sh
node bot/review.mjs config.json MEMBER_ID --inspect
```

This makes a fresh membership read and no kick request. If the person is absent, verified or exempt, the hold is cleared without claiming which earlier action removed them. If they still have the role, the hold stays. After reviewing the case, `--fresh-grace` explicitly replaces it with a new15-minute grace rather than retrying the unknown request. Restart the single worker afterward. The optional browser action models this same explicit choice on fictional members.

Bots, the guild owner and configured exempt roles are excluded. State contains member IDs/timer/audit data, so keep runtime/ and config private. The audit is bounded to1000entries; this is a small moderation tool, not an immutable compliance archive.

## What has actually been checked

- Eight local tests pass: SQLite reopen, preview without kick, verification cancellation/regrant, changed generation during recheck, uncertain response/no retry, hierarchy block/review and both reconnect policies. A real discord.js REST client against a fictional loopbackHTTP500 makes exactly one request with retries disabled.
- discord.js14.27.0 was installed from the public npm registry with scripts disabled. Import, Client construction, event names and the member REST route were checked without calling login.
- Author browser checks exercised the fictional verify→expiry→preview, restart, simulated removal and held-response paths. Current screenshots/checkpoint are recorded separately from this source.
- No real Discord login, API membership read, server permissions, bot installation, real member kick, customer acceptance or payment has been performed. A real-server activation test remains part of an agreed setup.

## Setup option

The worker source is MIT licensed. Physalia documents the same15-minute role timer, existing verification compatibility, optional backlog handling and kick-not-ban behaviour in its [verification guide](https://physalia.app/docs/basics#verification); its site lists these modules as free apart from branding. We have not installed or runtime-compared it. The ordinary15-minute requirement alone is therefore not a reason to buy a custom bot.

Role Window is an optional own-bot/source/local-state choice for an operator who actually needs that control or an agreed setup. A US$60 one-server setup option has been proposed: agreed role/backlog policy, configuration, preview/live acceptance checks, source and setup notes, and one correction round. The customer supplies the bot account and always-on hosting; tokens stay in their environment. Indicative delivery is two working days after scope, hosting and business payment are agreed. This is not an accepted order or a hosted-service promise.

## Primary technical references

- [Discord guild member fields and removal endpoint](https://docs.discord.com/developers/resources/guild).
- [Guild Members privileged intent](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents).
- [discord.js14.27 GuildMember, kickable and hierarchy](https://discord.js.org/docs/packages/discord.js/14.27.0/GuildMember:Class).

Third-party dependency notices are retained in THIRD_PARTY_NOTICES.txt. The bot uses the official API through discord.js, never a user-account token.

## Source provenance

This repository distributes the already-public v4 source from23October2026. Runtime code and tests are unchanged. The GitHub edition adds the links above, ignores local config.json, and includes the immutable source ZIP so the local simulator’s source-download link works. The ZIP is36,995bytes with SHA-256 `cf84a7b9bb44b2d562bb6e44c09066e503a78c4ac54f44d5746ce98914b7a03c`. SOURCE-MANIFEST.json records the distribution hashes.
