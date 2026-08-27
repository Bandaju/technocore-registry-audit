"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { clusterDuplicates, findDidReuse, jaccard, normalizeSummary, shingles } = require("../lib/cluster");

function record(key, agentName, did, summary) {
  return { key, fields: { agentName, did, summary } };
}

const FARM_SUMMARY = "Exploring signed agent communication and verifiable identity through the Technocore DID starter and developer workflow";

test("normalizeSummary strips urls, punctuation and case", () => {
  assert.equal(
    normalizeSummary("A CLI tool! See https://example.com/x — Fast."),
    "a cli tool see fast",
  );
});

test("jaccard on identical and disjoint sets", () => {
  const a = shingles("one two three four", 3);
  assert.equal(jaccard(a, a), 1);
  assert.equal(jaccard(a, shingles("five six seven eight", 3)), 0);
});

test("exact duplicate summaries across different agents form one cluster", () => {
  const records = [
    record("aaaaaaaaaaaaaaaa", "sibling4", "did:key:zA", FARM_SUMMARY),
    record("bbbbbbbbbbbbbbbb", "sibling5", "did:key:zB", FARM_SUMMARY),
    record("cccccccccccccccc", "mayor", "did:key:zC", FARM_SUMMARY),
    record("dddddddddddddddd", "honest", "did:key:zD", "A registry auditor that cross-checks fingerprints and profile linkage."),
  ];
  const clusters = clusterDuplicates(records);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 3);
  assert.equal(clusters[0].distinctAgents, 3);
});

test("near-duplicates with small edits still cluster", () => {
  const records = [
    record("aaaaaaaaaaaaaaaa", "a1", "did:key:zA", "Japanese guide covering Technocore onboarding safely with signed messages and DID setup for beginners"),
    record("bbbbbbbbbbbbbbbb", "a2", "did:key:zB", "Japanese guide covering Technocore onboarding safely with signed messages and DID setup for everyone"),
  ];
  const clusters = clusterDuplicates(records);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 2);
});

test("short summaries are ignored to avoid noise clusters", () => {
  const records = [
    record("aaaaaaaaaaaaaaaa", "a1", "did:key:zA", "nice tool"),
    record("bbbbbbbbbbbbbbbb", "a2", "did:key:zB", "nice tool"),
  ];
  assert.equal(clusterDuplicates(records).length, 0);
});

test("distinct summaries do not cluster", () => {
  const records = [
    record("aaaaaaaaaaaaaaaa", "a1", "did:key:zA", "A zero-dependency Ed25519 signing helper for the Technocore message lane."),
    record("bbbbbbbbbbbbbbbb", "a2", "did:key:zB", "Turkish walkthrough video showing mailbox creation and profile publication."),
  ];
  assert.equal(clusterDuplicates(records).length, 0);
});

test("findDidReuse reports a DID stored under multiple keys", () => {
  const records = [
    record("aaaaaaaaaaaaaaaa", "a1", "did:key:zSAME", "s1"),
    record("bbbbbbbbbbbbbbbb", "a2", "did:key:zSAME", "s2"),
    record("cccccccccccccccc", "a3", "did:key:zOTHER", "s3"),
  ];
  const reuse = findDidReuse(records);
  assert.equal(reuse.length, 1);
  assert.equal(reuse[0].did, "did:key:zSAME");
  assert.deepEqual(reuse[0].keys, ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"]);
});
