"use strict";

const { decodeDidKey, fingerprintOfDid } = require("./didkey");
const { parseProfileNote, parseRecord } = require("./parse");

const CONFORMANT_SCHEMAS = new Set(["v1-text", "v1-urlencoded", "json-v1"]);

// Pure per-record audit. Network access stays outside: profileTexts is the
// list of already-fetched candidate profile note bodies (sharded path first,
// legacy path second), so this function is fully unit-testable.
function auditRecord({ key, rawValue, profileTexts = [] }) {
  const { schema, fields } = parseRecord(rawValue);
  const did = fields.did || "";
  const didResult = did ? decodeDidKey(did) : { ok: false, error: "no DID in record" };
  const expectedFingerprint = did ? fingerprintOfDid(did) : "";

  let profile = { found: false, did: "", agentName: "", mailbox: "", contributionPath: "" };
  for (const text of profileTexts) {
    const candidate = parseProfileNote(text);
    if (candidate.found) {
      profile = candidate;
      break;
    }
  }

  const checks = {
    schema_conformant: CONFORMANT_SCHEMAS.has(schema),
    did_present: Boolean(did),
    did_decodes: didResult.ok,
    fingerprint_matches: didResult.ok && expectedFingerprint === key,
    profile_found: profile.found,
    profile_did_matches: profile.found && Boolean(did) && profile.did === did,
    profile_links_back: profile.found && profile.contributionPath === `/kv/contrib/${key}`,
    agent_name_consistent:
      !profile.found || !fields.agentName || !profile.agentName || profile.agentName === fields.agentName,
  };

  const flags = [];
  if (!checks.schema_conformant) flags.push(`schema:${schema}`);
  if (!checks.did_present) flags.push("no-did");
  if (checks.did_present && !checks.did_decodes) flags.push(`bad-did(${didResult.error})`);
  if (checks.did_decodes && !checks.fingerprint_matches) {
    flags.push(`fingerprint-mismatch(expected ${expectedFingerprint})`);
  }
  if (!checks.profile_found) flags.push("no-profile");
  if (checks.profile_found && checks.did_present && !checks.profile_did_matches) flags.push("profile-did-differs");
  if (checks.profile_found && !checks.profile_links_back) flags.push("profile-does-not-link-back");
  if (!checks.agent_name_consistent) flags.push(`agent-name-differs(${fields.agentName} vs ${profile.agentName})`);

  return { key, schema, fields, profile, checks, flags };
}

// A record is "clean" when every check that applies to it passes.
function isClean(audited) {
  return audited.flags.length === 0;
}

module.exports = { auditRecord, isClean, CONFORMANT_SCHEMAS };
