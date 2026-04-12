#!/usr/bin/env node
/**
 * License Key Generator (DEV ONLY — never ship this file)
 *
 * Usage:
 *   node generate-key.js --init              # Generate keypair (first run)
 *   node generate-key.js --tier pro --email user@example.com --days 365
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_FILE = path.join(__dirname, '.private-key.pem');
const PUBLIC_KEY_FILE = path.join(__dirname, '.public-key.pem');

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(PRIVATE_KEY_FILE, privateKey);
  fs.writeFileSync(PUBLIC_KEY_FILE, publicKey);

  console.log('Keypair generated.');
  console.log('Private key saved to:', PRIVATE_KEY_FILE);
  console.log('Public key saved to:', PUBLIC_KEY_FILE);
  console.log('\nPublic key (paste into license-crypto.js):\n');
  console.log(publicKey);
}

function generateLicense(tier, email, days) {
  if (!fs.existsSync(PRIVATE_KEY_FILE)) {
    console.error('No private key found. Run with --init first.');
    process.exit(1);
  }

  const privateKey = fs.readFileSync(PRIVATE_KEY_FILE, 'utf8');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const payload = {
    licenseId: `CG-${tier.toUpperCase()}-${crypto.randomBytes(8).toString('hex')}`,
    tier,
    email,
    maxMachines: tier === 'enterprise' ? 9999 : 10,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.sign(null, payloadBuffer, privateKey);

  const key = payloadBuffer.toString('base64url') + '.' + signature.toString('base64url');

  console.log('License generated:\n');
  console.log(key);
  console.log('\nPayload:', JSON.stringify(payload, null, 2));
}

// Parse CLI args
const args = process.argv.slice(2);

if (args.includes('--init')) {
  generateKeypair();
} else {
  const tier = args[args.indexOf('--tier') + 1] || 'pro';
  const email = args[args.indexOf('--email') + 1] || 'test@example.com';
  const days = parseInt(args[args.indexOf('--days') + 1]) || 365;
  generateLicense(tier, email, days);
}
