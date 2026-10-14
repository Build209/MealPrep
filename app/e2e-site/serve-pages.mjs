// Serves the built site folder (app/site, from app/scripts/build-site.sh) the way GitHub Pages
// serves it, for the tests in this folder. No dependencies.
//
//   node e2e-site/serve-pages.mjs [siteDir] [port] [--e2e-controls]     defaults: site 4174
//
// What it copies from GitHub Pages (as documented and as seen on the live site; not every detail
// of Pages is public, see the notes):
//   - an existing file is served with 200;
//   - /foo with no file but foo.html present serves foo.html (Pages' extensionless URLs);
//   - /foo where foo/ is a folder with index.html: 301 to /foo/ (Pages adds the slash);
//   - /foo/ serves foo/index.html;
//   - anything else: the site's /404.html with status 404 (the app, so deep links open it).
// Notes: when both foo.html and foo/index.html exist this serves foo.html; the site's redirect
// stubs exist in both forms with the same content, so either choice gives the same result.
// Pages sends "cache-control: max-age=600"; this server sends no-store so tests are not cached.
//
// --e2e-controls (tests only): GET /__e2e__/sw-mode?mode=old|site switches what /sw.js returns.
// "old" serves fixtures/old-sw.js (the old app's worker, simplified) at /sw.js, so a browser can
// install it at the same address and scope the old app used; "site" serves the site's own sw.js
// again (the clean-up worker). GET /__e2e__/old-page serves fixtures/old-page.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const controls = args.includes('--e2e-controls');
const positional = args.filter((a) => !a.startsWith('--'));
const root = resolve(positional[0] ?? 'site');
const port = Number(positional[1] ?? process.env.PORT ?? 4174);
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

let swMode = 'site';

async function kind(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? 'file' : s.isDirectory() ? 'dir' : null;
  } catch {
    return null;
  }
}

function inside(path) {
  return path === root || path.startsWith(root + sep);
}

async function send(res, status, file, extraHeaders = {}) {
  const body = await readFile(file);
  res.writeHead(status, {
    'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

/** Pages' lookup: returns { status, file } or { redirect }. */
async function resolvePath(pathname) {
  const wanted = normalize(join(root, pathname));
  if (!inside(wanted)) return { status: 404, file: join(root, '404.html') };
  const k = await kind(wanted);
  if (k === 'file') return { status: 200, file: wanted };
  if (k === 'dir') {
    const index = join(wanted, 'index.html');
    if ((await kind(index)) === 'file') {
      if (!pathname.endsWith('/')) {
        if ((await kind(wanted + '.html')) === 'file') return { status: 200, file: wanted + '.html' };
        return { redirect: pathname + '/' };
      }
      return { status: 200, file: index };
    }
  }
  if (!pathname.endsWith('/') && !extname(pathname) && (await kind(wanted + '.html')) === 'file') {
    return { status: 200, file: wanted + '.html' };
  }
  return { status: 404, file: join(root, '404.html') };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = url.pathname;
    }

    if (controls && pathname === '/__e2e__/sw-mode') {
      const mode = url.searchParams.get('mode');
      if (mode === 'old' || mode === 'site') swMode = mode;
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(swMode);
      return;
    }
    if (controls && pathname === '/__e2e__/old-page') {
      await send(res, 200, join(fixtures, 'old-page.html'));
      return;
    }
    if (controls && swMode === 'old' && pathname === '/sw.js') {
      await send(res, 200, join(fixtures, 'old-sw.js'));
      return;
    }

    const found = await resolvePath(pathname);
    if (found.redirect) {
      res.writeHead(301, { location: found.redirect + url.search, 'cache-control': 'no-store' }).end();
      return;
    }
    if ((await kind(found.file)) !== 'file') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found (and no 404.html in the site)');
      return;
    }
    await send(res, found.status, found.file);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} like GitHub Pages at http://127.0.0.1:${port}${controls ? ' (test controls on)' : ''}`);
});
