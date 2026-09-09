/**
 * Global guard: no test may write into the repository.
 *
 * Fixtures are captured by `scripts/capture-golden.ts` and committed; a suite
 * that quietly rewrote one would turn the oracle into a mirror of whatever the
 * code currently does, which is exactly the failure this project cannot
 * afford. Scratch space belongs in `node:os` tmpdir.
 *
 * The snapshot hashes content rather than mtimes: the working tree lives in a
 * synced folder, and a sync daemon touching a timestamp is not a test writing
 * a file. 27 MB over 532 files, hashed twice, costs a fraction of a second.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP = new Set(['node_modules', '.git']);

function snapshot(dir: string, into: Map<string, string>): Map<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) snapshot(path, into);
    else if (entry.isFile()) {
      into.set(
        path.slice(ROOT.length),
        `${statSync(path).size}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
      );
    }
  }
  return into;
}

let before: Map<string, string> | undefined;

export function setup(): void {
  before = snapshot(ROOT, new Map());
}

export function teardown(): void {
  if (before === undefined) return;
  const after = snapshot(ROOT, new Map());
  const changed: string[] = [];

  for (const [path, digest] of before) {
    const now = after.get(path);
    if (now === undefined) changed.push(`deleted ${path}`);
    else if (now !== digest) changed.push(`modified ${path}`);
  }
  for (const path of after.keys()) if (!before.has(path)) changed.push(`created ${path}`);

  if (changed.length > 0) {
    // Vitest 4 prints a teardown error but still exits 0, so the exit code has
    // to be set here or CI would go green on a run that rewrote a fixture.
    process.exitCode = 1;
    throw new Error(`The test run wrote into the repository:\n  ${changed.join('\n  ')}`);
  }
}
