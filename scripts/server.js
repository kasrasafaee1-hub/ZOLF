// Static file server used by `npm run serve` and by the end-to-end tests.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel === '/') rel = '/index.html';
      const path = join(root, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!path.startsWith(root)) return void res.writeHead(403).end('forbidden');
      const info = await stat(path);
      if (info.isDirectory()) return void res.writeHead(404).end('not found');
      res.writeHead(200, {
        'content-type': TYPES[extname(path)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
}

/** Starts on an ephemeral port unless one is given. Resolves with the base URL. */
export function startStaticServer(port = 0) {
  const server = createStaticServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ server, url: `http://127.0.0.1:${actual}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
