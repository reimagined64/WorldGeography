/**
 * Dev server for the readable build.
 *
 * Serves the single built file over `http://127.0.0.1` and rebuilds it when a
 * source changes. HTTP rather than `file://` is the point: a real origin gives
 * `localStorage` and the rest of the storage-backed behavior somewhere to
 * live, which is what lets the browser suite exercise saved runs instead of
 * deferring them. Shipping is still one file opened from a disk, and
 * `tests/browser/` checks that separately.
 *
 * There is exactly one route because there is exactly one file — no asset
 * directory, no fallback, nothing that could quietly succeed here and 404 in
 * the shipped build.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READABLE_OUTPUT, REPO_ROOT, WATCH_PATHS, buildReadable } from './build.ts';

export const DEFAULT_PORT = 4173;
export const HOST = '127.0.0.1';

/** Coalesces the burst of events an editor's save emits into one rebuild. */
const DEBOUNCE_MS = 60;

export interface DevServerOptions {
  readonly root?: string;
  /** 0 asks the OS for a free port, which is how the suite avoids collisions. */
  readonly port?: number;
  readonly log?: (message: string) => void;
}

export interface DevServer {
  readonly url: string;
  readonly port: number;
  /** Settles when the next rebuild does; register it *before* touching a file. */
  nextBuild(): Promise<void>;
  close(): Promise<void>;
}

export async function startDevServer(options: DevServerOptions = {}): Promise<DevServer> {
  const root = options.root ?? REPO_ROOT;
  const log = options.log ?? ((message: string) => console.log(message));
  const outFile = join(root, READABLE_OUTPUT);

  let html = '';
  let pending: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

  async function rebuild(): Promise<void> {
    const waiting = pending;
    pending = [];
    try {
      html = await buildReadable(root);
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, html, 'utf8');
      log(`Built ${outFile} (${Buffer.byteLength(html, 'utf8').toLocaleString('en-US')} bytes)`);
      for (const waiter of waiting) waiter.resolve();
    } catch (error) {
      // Keep serving the last good document: a syntax error mid-edit should
      // cost the next reload, not the running page.
      log(`Rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
      for (const waiter of waiting) waiter.reject(error);
    }
  }

  await rebuild();

  let timer: NodeJS.Timeout | undefined;
  const watchers: FSWatcher[] = [];
  for (const relative of WATCH_PATHS) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    watchers.push(watch(path, { recursive: true }, () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void rebuild(); }, DEBOUNCE_MS);
    }));
  }

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://${HOST}`).pathname;
    if (path !== '/' && path !== '/index.html') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`No ${path}. The build is a single file; everything is inside it.\n`);
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      // The document is rewritten in place on every rebuild, so a reload must
      // actually re-fetch it.
      'cache-control': 'no-store',
    });
    response.end(html);
  });

  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(options.port ?? DEFAULT_PORT, HOST, done);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Dev server did not bind a port');
  const port = address.port;

  return {
    url: `http://${HOST}:${port}/`,
    port,
    nextBuild: () => new Promise<void>((done, fail) => pending.push({ resolve: done, reject: fail })),
    close: () => new Promise<void>((done) => {
      if (timer !== undefined) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      server.close(() => done());
      server.closeAllConnections();
    }),
  };
}

const USAGE = 'Usage: node scripts/dev.ts [--root <dir>] [--port <n>]';

async function main(argv: readonly string[]): Promise<void> {
  let root = REPO_ROOT;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || (flag !== '--root' && flag !== '--port')) throw new Error(USAGE);
    if (flag === '--root') root = resolve(value);
    else port = Number(value);
  }

  const dev = await startDevServer({ root, port });
  console.log(`Serving ${join(root, READABLE_OUTPUT)} at ${dev.url}`);
  console.log('Watching ' + WATCH_PATHS.join(', ') + ' — Ctrl+C to stop.');
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
