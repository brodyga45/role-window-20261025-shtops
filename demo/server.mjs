import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['demo/index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['demo/app.mjs', 'text/javascript; charset=utf-8']],
  ['/guide.html', ['demo/guide.html', 'text/html; charset=utf-8']],
  ['/role-window-source.zip', ['demo/role-window-source.zip', 'application/zip']],
  ['/engine.mjs', ['core/engine.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['demo/styles.css', 'text/css; charset=utf-8']]
]);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname, file = files.get(path);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const body = await readFile(new URL(file[0], root));
    res.writeHead(200, {'content-type': file[1], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Demo asset unavailable'); }
});
const port = Number(process.env.PORT || 8801);
server.listen(port, '127.0.0.1', () => console.log(`Role Window fictional simulator ready at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeAllConnections(); });
