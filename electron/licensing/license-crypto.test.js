/**
 * Regression tests for license signature verification after the CG-C1 key
 * rotation. The old (pre-rotation) keypair is treated as compromised: its
 * public key is no longer in ACCEPTED_PUBLIC_KEYS, so licenses signed with
 * it are rejected. Tests use ephemeral keypairs and the injectable accepted-
 * keys parameter — no private key material lives in this repository.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyLicenseKey, ACCEPTED_PUBLIC_KEYS } from './license-crypto.js';

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function signLicense(privateKey, overrides = {}) {
  const now = Date.now();
  const payload = {
    licenseId: 'CG-PRO-test1234',
    tier: 'pro',
    email: 'customer@example.com',
    maxMachines: 10,
    issuedAt: new Date(now - 86400000).toISOString(),
    expiresAt: new Date(now + 365 * 86400000).toISOString(),
    ...overrides,
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.sign(null, payloadBuffer, privateKey);
  return payloadBuffer.toString('base64url') + '.' + signature.toString('base64url');
}

describe('license-crypto (post-rotation)', () => {
  it('ACCEPTED_PUBLIC_KEYS contains exactly the rotated production public key', () => {
    // Public verification key of the v4.0.0 keypair (rotated 2026-09-04).
    const ROTATED_PUBLIC_KEY =
      '-----BEGIN PUBLIC KEY-----\n' +
      'MCowBQYDK2VwAyEAAXl/LPC87Mil4AJn5P4zYz5rTVJKR6RfHwq2fU1LsjU=\n' +
      '-----END PUBLIC KEY-----';
    expect(ACCEPTED_PUBLIC_KEYS).toEqual([ROTATED_PUBLIC_KEY]);
    // The pre-rotation public key must NOT be accepted anymore.
    const OLD_PUBLIC_KEY =
      '-----BEGIN PUBLIC KEY-----\n' +
      'MCowBQYDK2VwAyEARu9Q8wPUkdj2SaTNXwD5nPHOsYBg72zt9pN9BEZmn54=\n' +
      '-----END PUBLIC KEY-----';
    expect(ACCEPTED_PUBLIC_KEYS).not.toContain(OLD_PUBLIC_KEY);
  });

  it('accepts a license signed by a key whose public half is in the accepted list', () => {
    const { publicKey, privateKey } = makeKeypair();
    const key = signLicense(privateKey);
    const result = verifyLicenseKey(key, [publicKey]);
    expect(result.valid).toBe(true);
    expect(result.payload.tier).toBe('pro');
    expect(result.isExpired).toBe(false);
  });

  it('rejects a license signed by a different key (forgery / old-key attempt)', () => {
    const { publicKey, privateKey } = makeKeypair();
    const { publicKey: otherPublic } = makeKeypair();
    const key = signLicense(privateKey);
    // The application only trusts the rotated key — a signature made with any
    // other private key (including the old compromised one) must fail.
    expect(verifyLicenseKey(key, [otherPublic]).valid).toBe(false);
    expect(verifyLicenseKey(key, [otherPublic]).error).toBe('Invalid license signature');
  });

  it('defaults to ACCEPTED_PUBLIC_KEYS when no key list is supplied', () => {
    const { privateKey } = makeKeypair();
    const key = signLicense(privateKey);
    // Signed with an ephemeral key not in the shipped accepted list.
    expect(verifyLicenseKey(key).valid).toBe(false);
  });

  it('rejects tampered license payloads', () => {
    const { publicKey, privateKey } = makeKeypair();
    const key = signLicense(privateKey);
    const [payloadB64, sig] = key.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    payload.tier = 'enterprise'; // tamper
    const tampered =
      Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.' + sig;
    const result = verifyLicenseKey(tampered, [publicKey]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid license signature');
  });

  it('rejects malformed keys', () => {
    expect(verifyLicenseKey('garbage').valid).toBe(false);
    expect(verifyLicenseKey('a.b.c').error).toMatch(/Invalid key format/);
    expect(verifyLicenseKey(null).valid).toBe(false);
  });

  it('rejects a license expired beyond the 7-day grace period', () => {
    const { publicKey, privateKey } = makeKeypair();
    const farPast = new Date(Date.now() - 30 * 86400000).toISOString();
    const key = signLicense(privateKey, { expiresAt: farPast });
    const result = verifyLicenseKey(key, [publicKey]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('License expired');
  });

  it('keeps a license valid inside the 7-day grace window with isGracePeriod=true', () => {
    const { publicKey, privateKey } = makeKeypair();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const key = signLicense(privateKey, { expiresAt: threeDaysAgo });
    const result = verifyLicenseKey(key, [publicKey]);
    expect(result.valid).toBe(true);
    expect(result.isGracePeriod).toBe(true);
    expect(result.isExpired).toBe(true);
  });

  it('requires the license payload fields', () => {
    const { publicKey, privateKey } = makeKeypair();
    const key = signLicense(privateKey, { tier: undefined, expiresAt: undefined });
    // Undefined fields are dropped by JSON.stringify, leaving an incomplete payload.
    const result = verifyLicenseKey(key, [publicKey]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Incomplete license data');
  });
});
