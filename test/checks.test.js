"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { auditRecord, isClean } = require("../lib/checks");
const { fingerprintOfDid } = require("../lib/didkey");

// Real published pair (technocore-did-tool README), safe to use as fixture.
const DID = "did:key:z6Mkt9W7ZFhqDUgVYA6hx6sCfAacc3x1sQhVnioh8KET2rAu";
const FINGERPRINT = "65bf859626f3d8ea";

const RECORD = `technocore-contribution-v1 did:${DID} agent:ufuk_agent type:tool summary:A simple web tool url:https://github.com/UfukNode/technocore-did-tool`;
const PROFILE = `technocore-profile-v1 did:${DID} agent:ufuk_agent mailbox:mb-p-e260047ca74509d02e9bca85 contribution:/kv/contrib/${FINGERPRINT}`;

test("fixture sanity: DID hashes to the fixture fingerprint", () => {
  assert.equal(fingerprintOfDid(DID), FINGERPRINT);
});

test("clean record with matching profile passes every check", () => {
  const audited = auditRecord({ key: FINGERPRINT, rawValue: RECORD, profileTexts: [PROFILE] });
  assert.equal(isClean(audited), true);
  assert.deepEqual(audited.flags, []);
  assert.equal(audited.checks.fingerprint_matches, true);
  assert.equal(audited.checks.profile_links_back, true);
});

test("record stored under the wrong key gets fingerprint-mismatch", () => {
  const audited = auditRecord({ key: "00000000deadbeef", rawValue: RECORD, profileTexts: [] });
  assert.equal(audited.checks.fingerprint_matches, false);
  assert.ok(audited.flags.some((flag) => flag.startsWith("fingerprint-mismatch")));
});

test("missing profile is flagged but does not fail unrelated checks", () => {
  const audited = auditRecord({ key: FINGERPRINT, rawValue: RECORD, profileTexts: [] });
  assert.equal(audited.checks.fingerprint_matches, true);
  assert.equal(audited.checks.profile_found, false);
  assert.deepEqual(audited.flags, ["no-profile"]);
});

test("profile owned by a different DID is flagged", () => {
  const otherProfile = PROFILE.replace(DID, "did:key:z6MkoJdWF4cwLEf8apAd8e3gtdfq3GAxVU1XvNVDP4LLpbUs");
  const audited = auditRecord({ key: FINGERPRINT, rawValue: RECORD, profileTexts: [otherProfile] });
  assert.equal(audited.checks.profile_did_matches, false);
  assert.ok(audited.flags.includes("profile-did-differs"));
});

test("free-text record without a DID collects the right flags", () => {
  const audited = auditRecord({ key: FINGERPRINT, rawValue: "just some prose about airdrops", profileTexts: [] });
  assert.equal(audited.schema, "free-text");
  assert.ok(audited.flags.includes("schema:free-text"));
  assert.ok(audited.flags.includes("no-did"));
});

test("agent name disagreement between record and profile is flagged", () => {
  const profile = PROFILE.replace("agent:ufuk_agent", "agent:someone_else");
  const audited = auditRecord({ key: FINGERPRINT, rawValue: RECORD, profileTexts: [profile] });
  assert.equal(audited.checks.agent_name_consistent, false);
});
