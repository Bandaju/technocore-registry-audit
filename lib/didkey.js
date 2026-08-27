"use strict";

const crypto = require("node:crypto");

const DID_KEY_PREFIX = "did:key:z";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58].map((char, index) => [char, index]));
// multicodec ed25519-pub varint prefix
const ED25519_PREFIX = [0xed, 0x01];
const ED25519_KEY_LENGTH_IN_BYTES = 32;

function base58btcDecode(text) {
  let n = 0n;
  for (const char of text) {
    const value = BASE58_INDEX.get(char);
    if (value === undefined) {
      throw new Error(`Invalid base58 character: ${JSON.stringify(char)}`);
    }
    n = n * 58n + BigInt(value);
  }

  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");

  let leadingZeros = 0;
  for (const char of text) {
    if (char !== BASE58[0]) break;
    leadingZeros += 1;
  }

  return Buffer.concat([Buffer.alloc(leadingZeros), body]);
}

// Decodes a did:key string. Returns { ok, publicKey?, error? } and never throws:
// audit input is untrusted registry text, a bad DID is a finding, not a crash.
function decodeDidKey(did) {
  const text = String(did || "").trim();
  if (!text.startsWith(DID_KEY_PREFIX)) {
    return { ok: false, error: "not a did:key with multibase base58btc (z) prefix" };
  }

  let bytes;
  try {
    bytes = base58btcDecode(text.slice(DID_KEY_PREFIX.length));
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (bytes.length !== ED25519_PREFIX.length + ED25519_KEY_LENGTH_IN_BYTES) {
    return { ok: false, error: `decoded length ${bytes.length}, expected ${ED25519_PREFIX.length + ED25519_KEY_LENGTH_IN_BYTES}` };
  }

  if (bytes[0] !== ED25519_PREFIX[0] || bytes[1] !== ED25519_PREFIX[1]) {
    return { ok: false, error: "multicodec prefix is not ed25519-pub (0xed01)" };
  }

  return { ok: true, publicKey: bytes.subarray(ED25519_PREFIX.length) };
}

// Registry convention: fingerprint = first 16 hex chars of sha256(did).
function fingerprintOfDid(did) {
  return crypto.createHash("sha256").update(String(did), "utf8").digest("hex").slice(0, 16);
}

// Profile notes are sharded: /kv/did-<first 2 hex>/<remaining 14 hex>.
// Older records used the unsharded /kv/did/<fingerprint> path.
function profilePathsForFingerprint(fingerprint) {
  const text = String(fingerprint || "").trim().toLowerCase();
  if (!/^[a-f0-9]{16}$/.test(text)) {
    throw new Error("Fingerprint must be 16 lowercase hex characters.");
  }

  return [`/kv/did-${text.slice(0, 2)}/${text.slice(2)}`, `/kv/did/${text}`];
}

module.exports = {
  base58btcDecode,
  decodeDidKey,
  fingerprintOfDid,
  profilePathsForFingerprint,
};
