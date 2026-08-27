"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { base58btcDecode, decodeDidKey, fingerprintOfDid, profilePathsForFingerprint } = require("../lib/didkey");

// Known-good pair published by the technocore-did-tool author:
// README lists this DID next to fingerprint 65bf859626f3d8ea.
const KNOWN_DID = "did:key:z6Mkt9W7ZFhqDUgVYA6hx6sCfAacc3x1sQhVnioh8KET2rAu";
const KNOWN_FINGERPRINT = "65bf859626f3d8ea";

test("base58btcDecode round-trips hex", () => {
  const decoded = base58btcDecode("2NEpo7TZRRrLZSi2U");
  assert.equal(decoded.toString("utf8"), "Hello World!");
});

test("base58btcDecode preserves leading zeros", () => {
  const decoded = base58btcDecode("11Ldp");
  assert.equal(decoded[0], 0);
  assert.equal(decoded[1], 0);
});

test("base58btcDecode rejects invalid characters", () => {
  assert.throws(() => base58btcDecode("0OIl"), /Invalid base58 character/);
});

test("decodeDidKey accepts a known-good ed25519 did:key", () => {
  const result = decodeDidKey(KNOWN_DID);
  assert.equal(result.ok, true);
  assert.equal(result.publicKey.length, 32);
});

test("decodeDidKey round-trips a freshly generated key", () => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  // encode: multicodec prefix + raw key, base58btc
  const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(`0x${Buffer.concat([Buffer.from([0xed, 0x01]), raw]).toString("hex")}`);
  let encoded = "";
  while (n > 0n) {
    encoded = BASE58[Number(n % 58n)] + encoded;
    n /= 58n;
  }
  const result = decodeDidKey(`did:key:z${encoded}`);
  assert.equal(result.ok, true);
  assert.deepEqual([...result.publicKey], [...raw]);
});

test("decodeDidKey flags non-did:key input without throwing", () => {
  assert.equal(decodeDidKey("did:web:example.com").ok, false);
  assert.equal(decodeDidKey("").ok, false);
  assert.equal(decodeDidKey(null).ok, false);
  assert.equal(decodeDidKey("did:key:zInvalid!!!").ok, false);
});

test("fingerprintOfDid matches the published known pair", () => {
  assert.equal(fingerprintOfDid(KNOWN_DID), KNOWN_FINGERPRINT);
});

test("profilePathsForFingerprint returns sharded path first, legacy second", () => {
  assert.deepEqual(profilePathsForFingerprint(KNOWN_FINGERPRINT), [
    "/kv/did-65/bf859626f3d8ea",
    "/kv/did/65bf859626f3d8ea",
  ]);
});

test("profilePathsForFingerprint rejects malformed input", () => {
  assert.throws(() => profilePathsForFingerprint("XYZ"), /16 lowercase hex/);
});
