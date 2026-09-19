/**
 * The published directory, served the way GitHub Pages serves it.
 *
 * Until U14 every browser spec opened the game from `file://`, which is the
 * right origin for R8 and the wrong one for everything about storage: a
 * `file://` document has an opaque origin, so `localStorage` is either absent
 * or per-file, and "the save survives a reload" cannot be asked at all. So the
 * specs that are about storage, and the ones that are about the *site* rather
 * than the document, get a real `http://127.0.0.1` origin here.
 *
 * `scripts/dev.ts` is not this. That server has one route because the readable
 * build is one file, and it rebuilds on change; this one serves a directory of
 * static files and never builds anything. What it copies from Pages is the
 * part the deploy depends on and nothing else:
 *
 *   * `/` resolves to `index.html`;
 *   * an unknown path is answered with `404.html` **and status 404**, which is
 *     the behaviour `404.html` exists for and the one a plain file server gets
 *     wrong by sending its own plain-text 404;
 *   * a path outside the root is refused rather than resolved, so a spec
 *     cannot accidentally prove something about a file the deploy will not
 *     publish.
 *
 * Content types are a small table rather than a dependency: the published
 * directory holds four extensions and an extension-less `.nojekyll`, and a
 * lookup that answers for those and `application/octet-stream` otherwise is
 * the whole requirement.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const HOST = '127.0.0.1';

/** Everything `dist/` contains, plus the two a future asset could be. */
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon',
});

export interface StaticSite {
  /** `http://127.0.0.1:<port>/`, with the trailing slash a page load wants. */
  readonly url: string;
  /** Every path requested since the server started, in order, `/` first. */
  readonly requested: string[];
  close(): Promise<void>;
}

/**
 * Serve `root` on an ephemeral port.
 *
 * Port 0 rather than a fixed number: the suite runs one worker but several
 * spec files, and a fixed port turns a server left open by a failing spec into
 * a confusing failure in the next one.
 */
export async function serveDirectory(root: string): Promise<StaticSite> {
  const base = resolve(root);
  const requested: string[] = [];

  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://${HOST}`).pathname;
    requested.push(path);

    const relative = normalize(decodeURIComponent(path === '/' ? '/index.html' : path)).replace(/^[/\\]+/, '');
    const file = join(base, relative);
    // `normalize` has already collapsed `..`; this is what makes the result
    // load-bearing rather than decorative.
    const inside = file === base || file.startsWith(base + sep);

    if (!inside || !existsSync(file) || !statSync(file).isFile()) {
      const notFound = join(base, '404.html');
      response.writeHead(404, {
        'content-type': CONTENT_TYPES['.html']!,
        'cache-control': 'no-store',
      });
      if (existsSync(notFound)) createReadStream(notFound).pipe(response);
      else response.end('Not found\n');
      return;
    }

    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, HOST, done);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('static server did not bind a port');

  return {
    url: `http://${HOST}:${address.port}/`,
    requested,
    close: () => new Promise<void>((done) => {
      server.close(() => done());
      server.closeAllConnections();
    }),
  };
}
