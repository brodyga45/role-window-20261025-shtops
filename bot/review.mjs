import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {RoleWindow} from '../core/engine.mjs';
import {SqliteStore} from '../core/sqlite-store.mjs';

// Stop the single worker before running this offline state-review command.
const [filename, memberId, choice] = process.argv.slice(2);
if (!filename || !/^\d{15,22}$/.test(memberId || '') || !['--inspect', '--fresh-grace'].includes(choice)) throw new Error('Usage: node bot/review.mjs config.json MEMBER_ID --inspect|--fresh-grace (stop worker first)');
const config = JSON.parse(readFileSync(filename, 'utf8'));
for (const key of ['guildId', 'roleId']) if (!/^\d{15,22}$/.test(config[key] || '')) throw new Error(`Invalid ${key}`);
if (!process.env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is required locally; do not send it in chat.');
const {REST, Routes} = await import('discord.js');
const rest = new REST({version: '10', retries: 0, timeout: 10000}).setToken(process.env.DISCORD_BOT_TOKEN);
let member;
try {
  const data = await rest.get(Routes.guildMember(config.guildId, memberId));
  member = {hasRole: data.roles.includes(config.roleId), excluded: data.user.bot || (config.exemptRoleIds || []).some(id => data.roles.includes(id))};
} catch (error) {
  if (error.code === 10007) member = null;
  else throw new Error(`Could not verify current membership; no state changed (${error.code || 'connection'}).`);
}
const store = new SqliteStore(resolve(config.database || 'runtime/role-window.sqlite'));
try {
  const engine = new RoleWindow(store, {guildId: config.guildId, roleId: config.roleId, graceMs: config.graceMinutes * 60000, dryRun: true});
  const outcome = engine.reviewOutcome(memberId, {member, startFreshGrace: choice === '--fresh-grace'});
  console.log(JSON.stringify({outcome, moderationRequestMade: false, note: 'A missing member does not prove which earlier action removed them.'}));
} finally { store.close(); }
