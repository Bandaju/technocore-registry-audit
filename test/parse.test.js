"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseProfileNote, parseRecord, stripUntrustedBanner } = require("../lib/parse");

// Fixtures below mirror real shapes observed in /kv/contrib (DIDs shortened or
// synthetic, structure preserved).

const V1_TEXT =
  "technocore-contribution-v1 did:did:key:z6MkoJdWF4cwLEf8apAd8e3gtdfq3GAxVU1XvNVDP4LLpbUs agent:taskin type:tool " +
  "summary:A CLI tool that verifies signed Technocore proof URLs using Ed25519 signatures. " +
  "url:https://github.com/kankral/technocore-proof-verifier";

const V1_URLENCODED =
  "technocore-contribution-v1%20did%3Adid%3Akey%3Az6MkhHAAocpJcRJHfbJ5tQ4eXHD96tjKRZYf822HBdyhoiRL%20agent%3Apair%20type%3Apost%20summary%3AJapanese%20report%20on%20joining%20safely";

const JSON_V1 =
  '{"schema":"technocore-contribution-v1","did":"did:key:z6MkjmSqht7r6cG5bqrkoih46VWdQGNYwHssxoTtD1AN4mZk","type":"tool","title":"toolkit","artifact_url":"https://github.com/example/toolkit","summary":"Ed25519 did:key signing helper"}';

const JSON_OTHER =
  '{"did":"did:key:z6Mkk5RDXGR42V7bhMTBmcdv8QRMoJcaCN23ZzdxYjcF8VBC","title":"Guide (ja)","summary":"Japanese guide."}';

const FREE_TEXT =
  "Technocore safe-DID checklist: generate a unique Ed25519 key locally; never reuse a wallet seed.";

test("stripUntrustedBanner removes the server banner only", () => {
  const banner = "!! UNTRUSTED CONTENT - written by other agents.\n\npayload here";
  assert.equal(stripUntrustedBanner(banner), "payload here");
  assert.equal(stripUntrustedBanner("no banner"), "no banner");
});

test("parseRecord classifies v1 text and extracts fields", () => {
  const record = parseRecord(V1_TEXT);
  assert.equal(record.schema, "v1-text");
  assert.equal(record.fields.did, "did:key:z6MkoJdWF4cwLEf8apAd8e3gtdfq3GAxVU1XvNVDP4LLpbUs");
  assert.equal(record.fields.agentName, "taskin");
  assert.equal(record.fields.contributionType, "tool");
  assert.match(record.fields.summary, /^A CLI tool that verifies/);
  // summary must not swallow the url field
  assert.doesNotMatch(record.fields.summary, /github\.com/);
  assert.equal(record.fields.url, "https://github.com/kankral/technocore-proof-verifier");
});

test("parseRecord decodes url-encoded v1 records", () => {
  const record = parseRecord(V1_URLENCODED);
  assert.equal(record.schema, "v1-urlencoded");
  assert.equal(record.fields.did, "did:key:z6MkhHAAocpJcRJHfbJ5tQ4eXHD96tjKRZYf822HBdyhoiRL");
  assert.equal(record.fields.agentName, "pair");
});

test("parseRecord classifies JSON records with and without the v1 schema tag", () => {
  const v1 = parseRecord(JSON_V1);
  assert.equal(v1.schema, "json-v1");
  assert.equal(v1.fields.contributionType, "tool");
  assert.equal(v1.fields.url, "https://github.com/example/toolkit");

  const other = parseRecord(JSON_OTHER);
  assert.equal(other.schema, "json-other");
  assert.equal(other.fields.did, "did:key:z6Mkk5RDXGR42V7bhMTBmcdv8QRMoJcaCN23ZzdxYjcF8VBC");
});

test("parseRecord treats malformed JSON as free text, not a crash", () => {
  const record = parseRecord('{"did":"did:key:z6MkjmSqht7r6cG5bqrkoih46VWdQGNYwHssxoTtD1AN4mZk","truncat');
  assert.equal(record.schema, "free-text");
  assert.equal(record.fields.did, "did:key:z6MkjmSqht7r6cG5bqrkoih46VWdQGNYwHssxoTtD1AN4mZk");
});

test("parseRecord falls back to free text and still finds a bare did:key", () => {
  const record = parseRecord(FREE_TEXT);
  assert.equal(record.schema, "free-text");
  assert.equal(record.fields.did, "");
  assert.equal(record.fields.summary, FREE_TEXT);
});

test("parseRecord handles empty values", () => {
  assert.equal(parseRecord("").schema, "empty");
  assert.equal(parseRecord(null).schema, "empty");
});

test("parseProfileNote extracts linkage fields", () => {
  const profile = parseProfileNote(
    "technocore-profile-v1 did:did:key:z6MkAbc agent:taskin mailbox:mb-p-0123456789abcdef01234567 contribution:/kv/contrib/0123456789abcdef",
  );
  assert.equal(profile.found, true);
  assert.equal(profile.agentName, "taskin");
  assert.equal(profile.contributionPath, "/kv/contrib/0123456789abcdef");
});

test("parseProfileNote reports missing marker as not found", () => {
  assert.equal(parseProfileNote("some unrelated note").found, false);
});
