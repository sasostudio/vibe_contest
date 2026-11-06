// 로컬 시험용 서버. public 정적 파일과 api/*.js를 Vercel과 같은 경로로 띄운다.
// 실행: node scripts/dev-server.mjs [포트]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

for (const line of existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : []) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : undefined;
}

function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
  return res;
}

const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://local');
  if (pathname.startsWith('/api/')) {
    const file = join('api', `${pathname.slice(5)}.js`);
    if (!existsSync(file)) return wrap(res).status(404).json({ error: '없음' });
    const { default: handler } = await import(pathToFileURL(file).href);
    req.body = await readBody(req);
    req.query = Object.fromEntries(searchParams); // Vercel과 같게
    return handler(req, wrap(res));
  }
  const file = join('public', normalize(pathname === '/' ? 'index.html' : pathname));
  try {
    res.setHeader('Content-Type', `${TYPES[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`);
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('없음');
  }
});

server.listen(Number(process.argv[2] ?? 4173), '127.0.0.1');
