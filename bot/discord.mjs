import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {RoleWindow} from '../core/engine.mjs';
import {SqliteStore} from '../core/sqlite-store.mjs';
import {reconcileMembers} from './reconcile.mjs';

const filename = process.argv[2] || 'config.json';
const config = JSON.parse(readFileSync(filename, 'utf8'));
for (const key of ['guildId', 'roleId']) if (!/^\d{15,22}$/.test(config[key] || '')) throw new Error(`Set a real ${key} in your own config`);
if (!Number.isFinite(config.graceMinutes) || config.graceMinutes < 1 || config.graceMinutes > 1440) throw new Error('graceMinutes must be between1 and1440');
if (!['fresh_grace', 'preserve_known'].includes(config.reconnectPolicy)) throw new Error('Choose fresh_grace or preserve_known explicitly');
if (!process.env.DISCORD_BOT_TOKEN) throw new Error('Set DISCORD_BOT_TOKEN in the bot owner’s environment. Never send it in chat.');
const {Client, Events, GatewayIntentBits, PermissionFlagsBits} = await import('discord.js');
const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], rest: {retries: 0, timeout: 10000}});
const store = new SqliteStore(resolve(config.database || 'runtime/role-window.sqlite'));
const engine = new RoleWindow(store, {guildId: config.guildId, roleId: config.roleId, graceMs: config.graceMinutes * 60000, dryRun: config.dryRun !== false});
const exemptions = new Set(config.exemptRoleIds || []);
let guild = null, ready = false, reconciling = false, stopping = false;
const memberView = member => ({hasRole: member.roles.cache.has(config.roleId), excluded: member.user.bot || member.id === member.guild.ownerId || member.roles.cache.some(r => exemptions.has(r.id)), kickable: member.kickable});
const adapter = {
  async fetchMember(memberId) {
    try {
      const member = await guild.members.fetch({user: memberId, force: true, cache: false});
      return memberView(member);
    } catch (error) {
      if (error.code === 10007) return null; // Discord Unknown Member; not a transport failure.
      throw error;
    }
  },
  async kick(memberId, reason) { await guild.members.kick(memberId, reason); }
};

async function reconcile() {
  if (reconciling || stopping) return;
  reconciling = true;
  ready = false;
  try {
    guild = await client.guilds.fetch(config.guildId);
    const role = await guild.roles.fetch(config.roleId);
    if (!role) throw new Error('Configured role does not exist in this guild');
    const me = await guild.members.fetchMe({force: true});
    const canKick = me.permissions.has(PermissionFlagsBits.KickMembers);
    if (!engine.config.dryRun && !canKick) throw new Error('Kick Members permission is required for execution; use preview while correcting it');
    const members = await guild.members.fetch();
    reconcileMembers(engine, [...members.values()].map(member => ({id: member.id, ...memberView(member)})), config.reconnectPolicy);
    engine.log('reconciled', null, `${config.reconnectPolicy}; ${engine.config.dryRun ? 'preview' : 'execution'}; no message content intent`);
    engine.save();
    ready = true;
    console.log(JSON.stringify({event: 'ready', mode: engine.config.dryRun ? 'preview' : 'execution', queued: Object.keys(engine.state.timers).length, reconnectPolicy: config.reconnectPolicy, kickPermission: canKick}));
  } catch (error) {
    console.error(JSON.stringify({event: 'reconciliation_failed', code: error.code || 'configuration_or_connection', message: String(error.message).replaceAll(process.env.DISCORD_BOT_TOKEN, '[redacted]')}));
  } finally { reconciling = false; }
}

client.on(Events.ClientReady, reconcile);
client.on(Events.ShardDisconnect, () => { ready = false; });
client.on(Events.ShardResume, reconcile);
client.on(Events.ShardReady, () => { if (client.isReady()) reconcile(); });
client.on(Events.GuildMemberAdd, member => { if (ready && member.guild.id === config.guildId) engine.observe(member.id, memberView(member)); });
client.on(Events.GuildMemberUpdate, (_old, member) => { if (ready && member.guild.id === config.guildId) engine.observe(member.id, memberView(member)); });
client.on(Events.GuildMemberRemove, member => { if (member.guild.id === config.guildId) engine.observe(member.id, {hasRole: false}); });
client.on(Events.Error, () => { ready = false; console.error(JSON.stringify({event: 'gateway_error', moderationPaused: true})); });
const sweep = setInterval(async () => {
  if (!ready || stopping) return;
  const outcomes = await engine.sweep(adapter);
  if (Array.isArray(outcomes) && outcomes.length) console.log(JSON.stringify({event: 'sweep', outcomes}));
}, 10000);
const resync = setInterval(() => { if (!ready && client.isReady()) reconcile(); }, 60000);
async function stop() {
  if (stopping) return;
  stopping = true; ready = false; clearInterval(sweep); clearInterval(resync);
  client.destroy();
  while (engine.busy) await new Promise(r => setTimeout(r, 30));
  store.close();
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
await client.login(process.env.DISCORD_BOT_TOKEN);
