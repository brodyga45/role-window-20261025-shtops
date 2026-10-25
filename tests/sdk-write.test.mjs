import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client, GatewayIntentBits, REST, Routes} from 'discord.js';

test('actual discord.js REST does not replay a failed moderation request against the fictional loopback API', async () => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.writeHead(500, {'content-type':'application/json'});
    res.end(JSON.stringify({message:'Fictional outcome could not be confirmed'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = `http://127.0.0.1:${server.address().port}`;
    const rest = new REST({api, version:'10', retries:0, timeout:1000}).setToken('fictional-not-a-real-credential');
    await assert.rejects(rest.delete(Routes.guildMember('111111111111111111','222222222222222222')), error => error.status === 500);
    assert.equal(calls, 1);
    const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers], rest:{retries:0,timeout:10000}});
    assert.equal(client.rest.options.retries, 0);
    await client.destroy();
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
