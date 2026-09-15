# World Geography — Arcade Edition

A Czech-and-English standalone web remake inspired by a Commodore 64 geography
game. New code, its own synthesized music, a globe, 195 countries and embedded
flags. It is not a program for the original C64, and not a reconstruction of the
original source.

Player-facing rules, the music design and the balance study stay in Czech:
[`docs/CHANGELOG_CZ.md`](docs/CHANGELOG_CZ.md),
[`docs/HUDBA_CZ.md`](docs/HUDBA_CZ.md),
[`docs/SIMULACE_CZ.md`](docs/SIMULACE_CZ.md).

## Running it

Open `dist/index.html` in any browser with JavaScript. It needs no install, no
network connection, and no external images, libraries or audio files — the whole
game, including all 195 flags, is one file. Audio starts on the first page
interaction, normally the "Zahájit expedici" button. Managed browsers in
companies and schools may block local HTML or audio outright.

## Requirements

Node 24.14.0 (pinned in `.nvmrc`) and npm. There are no runtime dependencies;
everything in `package.json` is a build- or test-time tool.

```sh
nvm use          # or any tool that reads .nvmrc
npm ci
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Emits `dist/index.html` — the obfuscated single file that GitHub Pages serves, plus the licence files beside it. |
| `npm run build:readable` | Emits `build/readable/index.html`, the same game with legible source. Not published; use it to debug. |
| `npm run dev` | Local dev server with rebuild-on-change. |
| `npm run data:refresh` | Fetches upstream reference data, merges `data/overrides/` over it and writes a diff report. Writes nothing without `--accept`. **Needs network.** |
| `npm run data:apply` | Re-merges the override layer into `data/build/` offline, with no fetch. Use after hand-editing an override. |
| `npm run data:check` | Asserts data invariants on the committed dataset. Runs in CI. |
| `npm run data:flags` | Re-renders the 195 flag PNGs from a pinned Noto Color Emoji release and reports which crops would move. Writes nothing without `--yes`. **Needs network** unless given `--font-path`. |
| `npm run verify:baseline` | Proves the TypeScript builder still reproduces the original v7 file byte for byte. |
| `npm test` | Unit suite, including the golden fixtures that pin engine behavior to v7. |
| `npm run test:browser` | Playwright suite against the built artifact: playthrough, offline purity, both locales. |
| `npm run typecheck` | `tsc --noEmit` under `strict: true`. |
| `npm run simulate` | Monte Carlo balance run, about 61 seconds. Not part of CI. |

`build` and `build:readable` are fully offline. Only `data:refresh` and
`data:flags` reach the network, and both pin every download by content hash in
`data/raw/sources.lock.json`.

## Editing the data

The quiz is only as correct as its curation, so curation is configuration rather
than code. `data/build/` holds the generated dataset; `data/overrides/` holds
hand-edited JSON that **always wins** over anything fetched. Changing a disputed
capital, reassigning a territory or adjusting a geopolitical note means editing
one JSON file and running `npm run data:apply` — no TypeScript change.

Every upstream change an override suppressed is listed in the refresh report, so
editorial positions cannot rot unnoticed.

## Licensing

The code is MIT (`LICENSE`). Embedded data and fonts carry their own terms —
see `THIRD_PARTY_NOTICES.txt` and `licenses/`. Those files ship with the built
site at the paths the in-game "Data & zdroje" dialog names, and the notices are
plain, unobfuscated text inside the HTML itself. No font file is distributed.

## What is and is not verified

Carried forward from the v7 release, and still true:

- **`file://` was never verified.** Chromium policy blocked local-file opening in
  the test environment, so the suite loads the HTML into the page directly. The
  file makes no network request either way, but "opens from disk" is a claim the
  tests do not prove.
- **Native persistence across a real browser restart was never verified.**
  Storage tests use a controlled localStorage substitute.
- **Safari, Firefox and physical mobile devices were never tested.** Mobile
  layout was checked in an emulated Chromium viewport only. Browser-language
  detection is a new surface and is likewise unverified outside Chromium.
- Some tests use virtual time for speed; the `--real` variants measure the real
  country and bonus pauses.

`docs/TEST_REPORT_CZ.txt` and `docs/provenance/` keep the evidence trail behind
these claims and behind the data the game ships.
