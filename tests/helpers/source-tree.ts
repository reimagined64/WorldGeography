/**
 * A throwaway copy of everything a build reads.
 *
 * Two U15 scenarios — the default output location, and a source edit
 * triggering a rebuild — can only be observed by building a tree and then
 * changing it. Doing that in place would trip the `no-repo-writes` guard and,
 * worse, leave a modified working tree behind, so both work on a copy under
 * `node:os` tmpdir instead. The copy is the real source, not a stub: a build
 * that only works against a fixture proves nothing about the build.
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, SOURCE_FILES } from '../../scripts/build.ts';
import { DIST_FILES, DIST_LICENSES, OBFUSCATOR_CONFIG } from '../../scripts/obfuscate.ts';

/**
 * Directories and files a build reads, relative to the repository root.
 *
 * The first three are the readable build's inputs; the rest are U13's, which
 * are read rather than generated — the obfuscator options and the four
 * published files the game's own notices promise the reader. They are listed
 * from `scripts/obfuscate.ts` rather than spelled again, so a file added to the
 * published directory cannot be forgotten here.
 */
const BUILD_INPUTS: readonly string[] = [
  'src', 'data/build', SOURCE_FILES.NOTICES,
  OBFUSCATOR_CONFIG, DIST_LICENSES, ...Object.values(DIST_FILES),
];

export interface SourceTree {
  readonly root: string;
  remove(): void;
}

export function copySourceTree(): SourceTree {
  const root = mkdtempSync(join(tmpdir(), 'wg-src-'));
  for (const relative of BUILD_INPUTS) {
    cpSync(join(REPO_ROOT, relative), join(root, relative), { recursive: true });
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
