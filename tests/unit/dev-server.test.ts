/**
 * U15 — the dev server.
 *
 * Two claims worth holding: the game is reachable over a real HTTP origin
 * (which is what later units need in order to test `localStorage` instead of
 * stubbing it), and an edit to a source is picked up without a restart.
 *
 * Both run against a throwaway copy of the source tree rather than the working
 * tree, because the second one has to change a file — and a suite that writes
 * into the repository is exactly what `tests/setup/no-repo-writes.ts` exists
 * to stop.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { READABLE_OUTPUT } from '../../scripts/build.ts';
import { startDevServer, type DevServer } from '../../scripts/dev.ts';
import { copySourceTree, type SourceTree } from '../helpers/source-tree.ts';

let tree: SourceTree;
let dev: DevServer;

beforeAll(async () => {
  tree = copySourceTree();
  // Port 0 asks the OS for a free one; a fixed port would collide with a dev
  // server the developer already has running.
  dev = await startDevServer({ root: tree.root, port: 0, log: () => {} });
});

afterAll(async () => {
  await dev?.close();
  tree?.remove();
});

describe('dev server', () => {
  it('serves the built document over http', async () => {
    const response = await fetch(dev.url);
    const html = await response.text();

    expect(dev.url.startsWith('http://127.0.0.1:')).toBe(true);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Zahájit expedici');
    expect(existsSync(join(tree.root, READABLE_OUTPUT))).toBe(true);
  });

  it('rebuilds when a source changes', async () => {
    const marker = '.wg-dev-rebuild-probe{color:#123456}';
    expect(await (await fetch(dev.url)).text()).not.toContain(marker);

    // Register the waiter first: the watcher can fire before the append
    // returns, and a rebuild that finished early would otherwise be missed.
    const rebuilt = dev.nextBuild();
    appendFileSync(join(tree.root, 'src/style.css'), `\n${marker}\n`);
    await rebuilt;

    expect(await (await fetch(dev.url)).text()).toContain(marker);
  });

  it('has nothing to serve but the one document', async () => {
    // A 404 here rather than a fallback: an asset that resolves in dev and not
    // in the shipped file would be the one bug this server could hide.
    const response = await fetch(new URL('/flags/cz.png', dev.url));
    expect(response.status).toBe(404);
  });
});
