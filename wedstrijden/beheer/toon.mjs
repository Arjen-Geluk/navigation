// Kleine lokale webserver voor testen: serveert de hele repo zoals GitHub Pages,
// zodat /wedstrijden/ en /polartool/ dezelfde origin hebben (nodig voor "Openen in wedstrijd").
//   npm run toon   →  http://localhost:8642/navigation/wedstrijden/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = +(process.env.PORT || 8642);
const TYPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  let pad = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/navigation/, '');
  pad = normalize(join(ROOT, pad));
  if (!pad.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(pad)).isDirectory()) pad = join(pad, 'index.html');
    const data = await readFile(pad);
    res.writeHead(200, { 'content-type': TYPE[extname(pad)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('niet gevonden'); }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/navigation/wedstrijden/`));
