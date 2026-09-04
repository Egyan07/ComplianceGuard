/**
 * Regression tests for scripts/check-package-secrets.js (CG-C1 packaging
 * guard). Marker text is assembled from fragments so this test file can never
 * contain a contiguous private-key block literal that the guard (which scans
 * packaged inputs, including this directory) would flag.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkPackageSecrets } from '../../scripts/check-package-secrets.js';

function fakePrivateKeyBlock() {
  const head = ['-----', 'BEGIN '].join('');
  const body = ['PRIVATE ', 'KEY'].join('');
  const tail = ['-----', 'END '].join('') + body + '-----';
  return `${head}${body}-----\nMDAwMDAwMDAwMDAwMA==\n${tail}\n`;
}

function fakePublicKeyBlock() {
  return '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA1234567890abcdefghijklmnopqrstuvwxyz==\n-----END PUBLIC KEY-----\n';
}

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pkg-guard-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel, content) {
  const p = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

describe('check-package-secrets', () => {
  it('flags a packaged .private-key.pem containing a private key block', () => {
    write('app/electron/licensing/.private-key.pem', fakePrivateKeyBlock());
    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toMatch(/\.private-key\.pem$/);
  });

  it('flags a *.key file whose content is a private key block', () => {
    write('app/signing.key', fakePrivateKeyBlock());
    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('private-key block');
  });

  it('flags PKCS#12 / PFX bundles by filename', () => {
    write('app/cert.p12', 'not-a-text-block');
    write('app/code-signing.pfx', 'not-a-text-block');
    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations.map((v) => v.reason)).toEqual([
      'private-key filename: cert.p12',
      'private-key filename: code-signing.pfx',
    ]);
  });

  it('does NOT flag public keys or unrelated files', () => {
    write('app/public.pem', fakePublicKeyBlock());
    write('app/license-crypto.js', 'const ok = true; // public key only');
    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toEqual([]);
  });

  it('flags private key material nested under deep directories', () => {
    write('app/resources/secret/keys/.private-key.pem', fakePrivateKeyBlock());
    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toHaveLength(1);
  });

  it('finds a private key block buried deep inside an asar (whole-file stream scan)', () => {
    // asar payloads are larger than any prefix cap. Build a >4 MB "asar" and
    // place the key block near the end, past where a prefix-only scan stops.
    const asarPath = write('app/resources/app.asar', '');
    const filler = Buffer.alloc(5 * 1024 * 1024, 0x41); // 5 MB of 'AAAA…'
    const fd = fs.openSync(asarPath, 'w');
    fs.writeSync(fd, filler, 0, filler.length, 0);
    const block = Buffer.from(fakePrivateKeyBlock(), 'utf8');
    fs.writeSync(fd, block, 0, block.length, filler.length); // offset > 4 MB
    fs.closeSync(fd);

    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toMatch(/\.asar$/);
    expect(violations[0].reason).toContain('private-key block');
  });

  it('finds a key block at the very tail of a chunk-aligned asar (no tail off-by-one)', () => {
    // File size is an exact multiple of the scan chunk size and the block sits
    // at the end — guards against an off-by-one that skips the final chunk.
    const CHUNK = 1024 * 1024;
    const asarPath = write('app/resources/app.asar', '');
    const filler = Buffer.alloc(CHUNK * 2, 0x43); // exactly 2 chunks
    const fd = fs.openSync(asarPath, 'w');
    fs.writeSync(fd, filler, 0, filler.length, 0);
    const block = Buffer.from(fakePrivateKeyBlock(), 'utf8');
    fs.writeSync(fd, block, 0, block.length, filler.length);
    fs.closeSync(fd);

    const { violations } = checkPackageSecrets({ targets: [tmpRoot] });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('private-key block');
  });

  it('scans packaged source inputs and finds no private key material', () => {
    const root = path.join(__dirname, '..', '..');
    // Explicitly the packaging input dirs (electron, shared). dist/ is the
    // CI artifact check and may not exist or may hold stale artifacts locally.
    const { violations } = checkPackageSecrets({
      root,
      targets: ['electron', 'shared'],
    });
    expect(violations).toEqual([]);
  }, 30000);
});
