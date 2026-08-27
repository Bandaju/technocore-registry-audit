"use strict";

const V1_MARKER = "technocore-contribution-v1";
// Known k:v keys in v1 text records. summary: is greedy, so extraction for it
// stops only at one of these.
const V1_KEYS = ["did", "agent", "type", "summary", "url", "x", "guide", "lang", "version", "status", "record", "proof"];

// The public server prepends an untrusted-content banner to text/plain reads.
// It is transport framing, not record content.
function stripUntrustedBanner(text) {
  return String(text || "").replace(/^!![^\n]*\n+/, "").trim();
}

function looksUrlEncoded(text) {
  return /%(?:20|3A|3a)/.test(text) && !/\s/.test(text.trim());
}

function fieldAfter(text, key) {
  const stopKeys = V1_KEYS.filter((item) => item !== key).map((item) => `${item}:`).join("|");
  const match = text.match(new RegExp(`(?:^|\\s)${key}:(.*?)(?=\\s(?:${stopKeys})|$)`, "s"));
  return match ? match[1].trim() : "";
}

function parseV1Text(text) {
  // v1 quirk: the did field is written as "did:did:key:..." so the value of
  // the did key itself starts with "did:key:".
  return {
    did: fieldAfter(text, "did"),
    agentName: fieldAfter(text, "agent"),
    contributionType: fieldAfter(text, "type"),
    summary: fieldAfter(text, "summary"),
    url: fieldAfter(text, "url") || fieldAfter(text, "guide"),
    xHandle: fieldAfter(text, "x").replace(/^@/, ""),
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseJsonRecord(payload) {
  return {
    did: firstString(payload.did),
    agentName: firstString(payload.agent, payload.agentName, payload.name),
    contributionType: firstString(payload.type, payload.contributionType),
    summary: firstString(payload.summary, payload.description, payload.activity, payload.title),
    url: firstString(payload.url, payload.artifact_url, payload.repo, payload.source_note),
    xHandle: firstString(payload.x, payload.xHandle).replace(/^@/, ""),
  };
}

// Classifies one raw registry value and extracts whatever fields it can.
// schema: v1-text | v1-urlencoded | json-v1 | json-other | free-text | empty
function parseRecord(rawValue) {
  let text = stripUntrustedBanner(rawValue);
  if (!text) {
    return { schema: "empty", fields: {}, raw: "" };
  }

  let urlDecoded = false;
  if (looksUrlEncoded(text)) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded.includes(V1_MARKER) || /\bdid:key:/.test(decoded)) {
        text = decoded;
        urlDecoded = true;
      }
    } catch {
      // leave as-is; will classify as free-text
    }
  }

  if (text.startsWith("{")) {
    try {
      const payload = JSON.parse(text);
      const schema = String(payload.schema || "") === V1_MARKER ? "json-v1" : "json-other";
      return { schema, fields: parseJsonRecord(payload), raw: text };
    } catch {
      // fall through: truncated or malformed JSON is a finding, not a crash
    }
  }

  if (text.includes(V1_MARKER)) {
    return { schema: urlDecoded ? "v1-urlencoded" : "v1-text", fields: parseV1Text(text), raw: text };
  }

  // Free text: best effort, pull a bare did:key if one is present anywhere.
  const didMatch = text.match(/did:key:z[1-9A-HJ-NP-Za-km-z]+/);
  return {
    schema: "free-text",
    fields: { did: didMatch ? didMatch[0] : "", agentName: "", contributionType: "", summary: text, url: "", xHandle: "" },
    raw: text,
  };
}

// Profile notes (/kv/did-xx/<key>) use the same k:v style with marker
// technocore-profile-v1.
function parseProfileNote(rawValue) {
  const text = stripUntrustedBanner(rawValue);
  if (!text.includes("technocore-profile-v1")) {
    return { found: false, did: "", agentName: "", mailbox: "", contributionPath: "" };
  }

  const field = (name) => {
    const match = text.match(new RegExp(`(?:^|\\s)${name}:([^\\s]+)`));
    return match ? match[1] : "";
  };

  return {
    found: true,
    did: field("did"),
    agentName: field("agent"),
    mailbox: field("mailbox"),
    contributionPath: field("contribution"),
  };
}

module.exports = {
  parseProfileNote,
  parseRecord,
  stripUntrustedBanner,
};
