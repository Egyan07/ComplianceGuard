#!/usr/bin/env node
/**
 * License Key Generator (DEV ONLY — never ship this file)
 *
 * SECURITY (rotation in v4.0.0): the signing keypair must NEVER be
 * generated inside the repository. electron-builder packages `electron/**/*`
 * (including dotfiles) into the application ASAR, so a keypair written here
 * would ship to every user and void the offline license model.
 *
 * Usage:
 *   node generate-key.js --init [--dir <outside-repo-path>]   # Generate keypair
 *   node generate-key.js --tier pro --email user@example.com --days 365 [--dir <keydir>]
 *
 * Key material lives in the directory given by --dir, or by default in
 * `~/.complianceguard-licensing/` (outside any repository). `--init` refuses
 * to run when the target directory is inside this repository.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function defaultKeyDir() {
  return path.join(os.homedir(), '.complianceguard-licensing');
}

function findRepoRoot(fromDir) {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function ensureKeyDir(keyDir) {
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }
  return keyDir;
}

function assertOutsideRepo(keyDir) {
  const repoRoot = findRepoRoot(__dirname);
  const resolved = path.resolve(keyDir);
  if (repoRoot && (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep))) {
    console.error(
      `Refusing to write private key material inside the repository (${resolved}).\n` +
      `The packaged tree (electron/**/*) would ship the private key in the ASAR.\n` +
      `Run with --dir pointing OUTSIDE this repo, e.g.:\n` +
      `  node electron/licensing/generate-key.js --init --dir "$HOME/.complianceguard-licensing"`
    );
    process.exit(1);
  }
}

function generateKeypair(keyDir) {
  const privateKeyFile = path.join(keyDir, '.private-key.pem');
  const publicKeyFile = path.join(keyDir, '.public-key.pem');

  if (fs.existsSync(privateKeyFile)) {
    console.error(
      `A keypair already exists in ${keyDir}.\n` +
      `Refusing to overwrite it. If you intend to ROTATE the keypair, move the old files aside first.`
    );
    process.exit(1);
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(privateKeyFile, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyFile, publicKey);

  console.log('Keypair generated.');
  console.log('Private key saved to:', privateKeyFile);
  console.log('Public key saved to:', publicKeyFile);
  console.log('\nPublic key (paste into electron/licensing/license-crypto.js and backend/app/core/license.py):\n');
  console.log(publicKey);
}

function generateLicense(tier, email, days, keyDir) {
  const privateKeyFile = path.join(keyDir, '.private-key.pem');
  if (!fs.existsSync(privateKeyFile)) {
    console.error(`No private key found in ${keyDir}. Run with --init first.`);
    process.exit(1);
  }

  const privateKey = fs.readFileSync(privateKeyFile, 'utf8');
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

function argValue(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const dirArg = argValue('--dir');
const keyDir = ensureKeyDir(dirArg ? path.resolve(dirArg) : defaultKeyDir());

if (args.includes('--init')) {
  assertOutsideRepo(keyDir);
  generateKeypair(keyDir);
} else {
  const tier = argValue('--tier') || 'pro';
  const email = argValue('--email') || 'test@example.com';
  const days = parseInt(argValue('--days')) || 365;
  generateLicense(tier, email, days, keyDir);
}
