/**
 * U2 — the byte-identity gate.
 *
 * `scripts/build.ts` is a port of the archived `scripts/build.py`. The only
 * proof the port is faithful is that it reproduces the shipped v7 file byte for
 * byte, so this suite reads nothing but frozen fixtures and must keep passing
 * for the life of the project.
 *
 * The gate alone is a weak oracle for the builder's guards: several of them are
 * no-ops on today's inputs (no JSON value contains `</`, no marker repeats), so
 * a green hash says nothing about whether they work. Each guard therefore gets
 * a direct test over synthetic input.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocument,
  buildFromDirectory,
  inlineJson,
  pythonFloatRepr,
  V7_SOURCE_FILES,
  type InlineSource,
} from '../../scripts/build.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const baselineRoot = join(root, 'tests/fixtures/baseline');

const V7_SHA256 = 'e4c7343e6321f0de4a2f1c1068890c525e28e602885db25896574b4db46b846d';
const V7_BYTES = 1_990_211;

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const raw = (text: string): InlineSource => ({ kind: 'raw', text });
const json = (text: string): InlineSource => ({ kind: 'json', text });

describe('byte-identity gate', () => {
  const built = Buffer.from(buildFromDirectory(baselineRoot), 'utf8');

  it('reproduces the v7 hash and size from the frozen inputs', () => {
    expect(sha256(built)).toBe(V7_SHA256);
    expect(built.byteLength).toBe(V7_BYTES);
  });

  it('is byte-identical to the shipped v7 file', () => {
    // Distinct from the hash: a mismatch here can be diffed, a hash cannot.
    expect(built.equals(readFileSync(join(baselineRoot, 'v7-index.html')))).toBe(true);
  });

  it('substitutes in the order build.py did', () => {
    // Order is observable only if an inlined text contains a later marker. No
    // input does today, so the contract is pinned here rather than by the hash.
    expect(Object.keys(V7_SOURCE_FILES)).toEqual([
      'NOTICES', 'CSS', 'CORE', 'CLOCK', 'AUDIO', 'GLOBE', 'APP',
      'COUNTRIES', 'FLAGS', 'MAP', 'SOURCES',
    ]);
  });

  it('runs as a script and writes the same bytes', () => {
    const out = mkdtempSync(join(tmpdir(), 'wg-build-'));
    try {
      const file = join(out, 'index.html');
      execFileSync('node', ['scripts/build.ts', '--root', baselineRoot, '--out', file], {
        cwd: root,
        stdio: 'pipe',
      });
      expect(sha256(readFileSync(file))).toBe(V7_SHA256);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('marker substitution', () => {
  it('names the marker that survived substitution', () => {
    expect(() => buildDocument('<p>/*__FOO__*/</p>', {})).toThrow(/FOO/);
  });

  it('substitutes every occurrence of a repeated marker', () => {
    // Python's str.replace is global; JS's replace(string, string) is not.
    expect(buildDocument('[/*__A__*/][/*__A__*/]', { A: raw('x') })).toBe('[x][x]');
  });

  it('treats replacement text as literal, not as a substitution pattern', () => {
    // `$&`, "$`" and `$$` are special to replaceAll's string form, and the
    // inlined content is arbitrary data that may contain them.
    const value = '$& $\' $` $$ $1';
    const source = JSON.stringify({ note: value });

    expect(buildDocument('(/*__A__*/)', { A: json(source) })).toBe(`(${source})`);
    expect(buildDocument('(/*__A__*/)', { A: raw(value) })).toBe(`(${value})`);
  });

  it('normalizes newlines the way a Python universal-newline read does', () => {
    // fs.readFileSync does not translate line endings; read_text does. Every
    // input is pure LF today, so this only bites under a Windows checkout.
    const crlf = buildDocument('a\r\n/*__A__*/\r\n', { A: raw('x\r\ny\rz') });

    expect(crlf).toBe(buildDocument('a\n/*__A__*/\n', { A: raw('x\ny\nz') }));
    expect(crlf).toBe('a\nx\ny\nz\n');
  });
});

describe('inlined text cannot escape its host element', () => {
  it('rejects a JS input containing </script', () => {
    expect(() => buildDocument('<script>/*__APP__*/</script>', {
      APP: raw('const marker = "</script>";'),
    })).toThrow(/APP.*<\/script/s);
  });

  it('rejects a CSS input containing </style', () => {
    expect(() => buildDocument('<style>/*__CSS__*/</style>', {
      CSS: raw('/* </style> */'),
    })).toThrow(/CSS.*<\/style/s);
  });

  it('escapes </ inside JSON, keeping the value parseable', () => {
    // No JSON input contains `</` today, so the gate cannot exercise this.
    const value = '</script><script>alert(1)</script>';
    const inlined = inlineJson(JSON.stringify({ note: value }));

    expect(inlined).not.toContain('</');
    expect(inlined).toContain('<\\/script>');
    expect((JSON.parse(inlined) as { note: string }).note).toBe(value);
  });
});

describe('JSON numbers keep the formatting Python gave them', () => {
  it('keeps an integral float integral', () => {
    // JSON.stringify would emit `20`, costing the gate 270 bytes: the frozen
    // map.json holds 135 integral-float coordinates such as 180.0.
    expect(inlineJson('{"lat":20.0}')).toBe('{"lat":20.0}');
    expect(readFileSync(join(baselineRoot, 'data/map.json'), 'utf8')).toContain('180.0');
  });

  it('reproduces Python repr for exponents, and renormalizes as Python does', () => {
    expect(inlineJson('[1e-5,1.5e-7,1e16,1e15,2.50,3e2,-0.0,0.00001,1e21]')).toBe(
      '[1e-05,1.5e-07,1e+16,1000000000000000.0,2.5,300.0,-0.0,1e-05,1e+21]',
    );
  });

  it('keeps integers exact past the IEEE-754 range', () => {
    expect(inlineJson('[12345678901234567890,-0]')).toBe('[12345678901234567890,0]');
  });

  it('reports a number it cannot reproduce rather than diverging silently', () => {
    // Python emits a bare `Infinity` here, which is not valid JSON; refusing is
    // the only honest option once the Python oracle is gone.
    expect(() => inlineJson('[1e400]')).toThrow(/1e400/);
  });

  it('matches Python float repr at the edges of the double range', () => {
    expect(pythonFloatRepr(5e-324)).toBe('5e-324');
    expect(pythonFloatRepr(1.7976931348623157e308)).toBe('1.7976931348623157e+308');
    expect(pythonFloatRepr(0.0001)).toBe('0.0001');
    expect(pythonFloatRepr(0)).toBe('0.0');
    expect(pythonFloatRepr(-0)).toBe('-0.0');
  });
});
