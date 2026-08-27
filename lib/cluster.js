"use strict";

// Farm signature: many "different" agents registering near-identical
// summaries. Thresholds are knobs, not magic numbers.
const DEFAULTS = {
  near_duplicate_jaccard_threshold: 0.7,
  shingle_size_in_words: 3,
  min_cluster_size: 2,
  summary_min_length_in_chars: 20,
};

function normalizeSummary(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(normalized, size) {
  const words = normalized.split(" ");
  if (words.length < size) return new Set(words.filter(Boolean));
  const out = new Set();
  for (let i = 0; i <= words.length - size; i += 1) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

// Union-find over records whose summaries are exact-normalized equal or whose
// shingle sets clear the Jaccard threshold.
function clusterDuplicates(records, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const eligible = records
    .map((record, index) => ({
      index,
      key: record.key,
      agentName: record.fields.agentName || "",
      did: record.fields.did || "",
      normalized: normalizeSummary(record.fields.summary),
    }))
    .filter((item) => item.normalized.length >= config.summary_min_length_in_chars);

  const parent = eligible.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  // Pass 1: exact normalized equality via map (cheap).
  const byNormalized = new Map();
  eligible.forEach((item, i) => {
    const existing = byNormalized.get(item.normalized);
    if (existing !== undefined) union(existing, i);
    else byNormalized.set(item.normalized, i);
  });

  // Pass 2: near-duplicates via shingle Jaccard. O(n^2) on ~1k records is
  // a few hundred thousand set intersections, fine for a CLI audit.
  const sets = eligible.map((item) => shingles(item.normalized, config.shingle_size_in_words));
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      if (find(i) === find(j)) continue;
      if (jaccard(sets[i], sets[j]) >= config.near_duplicate_jaccard_threshold) union(i, j);
    }
  }

  const groups = new Map();
  eligible.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });

  return [...groups.values()]
    .filter((members) => members.length >= config.min_cluster_size)
    .map((members) => ({
      size: members.length,
      distinctDids: new Set(members.map((m) => m.did).filter(Boolean)).size,
      distinctAgents: new Set(members.map((m) => m.agentName).filter(Boolean)).size,
      sampleSummary: members[0].normalized.slice(0, 160),
      members: members.map(({ key, agentName, did }) => ({ key, agentName, did })),
    }))
    .sort((a, b) => b.size - a.size);
}

// Same DID registered under multiple storage keys.
function findDidReuse(records) {
  const byDid = new Map();
  for (const record of records) {
    const did = record.fields.did;
    if (!did) continue;
    if (!byDid.has(did)) byDid.set(did, []);
    byDid.get(did).push(record.key);
  }

  return [...byDid.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([did, keys]) => ({ did, keys }))
    .sort((a, b) => b.keys.length - a.keys.length);
}

module.exports = { DEFAULTS, clusterDuplicates, findDidReuse, jaccard, normalizeSummary, shingles };
