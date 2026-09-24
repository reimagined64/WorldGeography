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

The game opens in Czech or English, chosen from the browser's own language list
and overridden by the `CS`/`EN` control in the header. The choice is remembered
in the same `localStorage` settings the rest of the setup screen uses. It is
disabled while a run is in progress: a run's questions are written once, at
creation, in one language, so switching mid-run would mix the two on one
screen.

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
| `npm run test:browser` | Playwright suite against the built artifact: it builds `dist/` first, then plays through it — gameplay in both languages, real `localStorage` over a local origin, offline purity, the globe canvas, and all 14,040 question variants generated inside the obfuscated bundle. |
| `npm run typecheck` | `tsc --noEmit` under `strict: true`. |
| `npm run simulate` | Monte Carlo balance run, about 61 seconds. Not part of CI. |

`build` and `build:readable` are fully offline. Only `data:refresh` and
`data:flags` reach the network, and both pin every download by content hash in
`data/raw/sources.lock.json`.

## How a change reaches the site

CI runs the typecheck, the dataset invariants, the unit suite and the browser
suite on every push and pull request, and uploads the `dist/` those suites ran
against, with its sha256 recorded inside the artifact.

The deploy never builds. On a push to `main`, CI calls `deploy.yml` once the
suites are green; it takes the artifact those suites ran against, re-checks the
digest, smoke-tests the files and publishes them. So the bytes on the site are
the bytes that were tested, and a push that fails CI cannot reach the site at
all. A previous good run can be put back byte for byte by dispatching the
deploy workflow with its run id.

One more workflow runs on a monthly schedule: `data-drift.yml` runs
`npm run data:refresh` against the live sources, writes nothing, and opens an
issue if anything upstream moved. It cannot fail a build.

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
