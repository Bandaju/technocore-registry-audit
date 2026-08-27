"use strict";

// Caps are presentation-only and always announced in the output itself, so a
// truncated table never reads as a complete listing.
const DEFAULTS = {
  max_clusters_in_markdown: 20,
  max_flagged_records_in_markdown: 40,
};

function percent(part, whole) {
  if (!whole) return "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function countBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    out.set(key, (out.get(key) || 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function buildSummary(audited, clusters, didReuse, meta) {
  const total = audited.length;
  const clean = audited.filter((record) => record.flags.length === 0).length;
  const checkNames = total ? Object.keys(audited[0].checks) : [];
  const checkPassCounts = Object.fromEntries(
    checkNames.map((name) => [name, audited.filter((record) => record.checks[name]).length]),
  );
  const farmClusters = clusters.filter((cluster) => cluster.distinctAgents > 1 || cluster.distinctDids > 1);
  const recordsInFarmClusters = farmClusters.reduce((sum, cluster) => sum + cluster.size, 0);

  return {
    generatedAt: meta.generatedAt,
    baseUrl: meta.baseUrl,
    totals: {
      records: total,
      clean,
      flagged: total - clean,
      duplicateClusters: clusters.length,
      farmClusters: farmClusters.length,
      recordsInFarmClusters,
      didsReused: didReuse.length,
    },
    schemaBreakdown: Object.fromEntries(countBy(audited, (record) => record.schema)),
    checkPassCounts,
    flagBreakdown: Object.fromEntries(
      countBy(audited.flatMap((record) => record.flags.map((flag) => flag.replace(/\(.*\)$/, ""))), (flag) => flag),
    ),
  };
}

function toMarkdown(summary, audited, clusters, didReuse, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const { totals } = summary;
  const lines = [];

  lines.push("# Technocore contribution registry audit");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}  `);
  lines.push(`Source: ${summary.baseUrl}/kv/contrib (read-only)`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Records | ${totals.records} |`);
  lines.push(`| Clean (all checks pass) | ${totals.clean} (${percent(totals.clean, totals.records)}) |`);
  lines.push(`| Flagged | ${totals.flagged} (${percent(totals.flagged, totals.records)}) |`);
  lines.push(`| Duplicate summary clusters | ${totals.duplicateClusters} |`);
  lines.push(`| Cross-agent (farm-like) clusters | ${totals.farmClusters} |`);
  lines.push(`| Records inside farm-like clusters | ${totals.recordsInFarmClusters} (${percent(totals.recordsInFarmClusters, totals.records)}) |`);
  lines.push(`| DIDs registered under multiple keys | ${totals.didsReused} |`);
  lines.push("");

  lines.push("## Schema breakdown");
  lines.push("");
  lines.push("| Schema | Records | Share |");
  lines.push("|---|---|---|");
  for (const [schema, count] of Object.entries(summary.schemaBreakdown)) {
    lines.push(`| ${schema} | ${count} | ${percent(count, totals.records)} |`);
  }
  lines.push("");

  lines.push("## Check pass rates");
  lines.push("");
  lines.push("| Check | Pass | Rate |");
  lines.push("|---|---|---|");
  for (const [name, count] of Object.entries(summary.checkPassCounts)) {
    lines.push(`| ${name} | ${count}/${totals.records} | ${percent(count, totals.records)} |`);
  }
  lines.push("");

  const farmClusters = clusters.filter((cluster) => cluster.distinctAgents > 1 || cluster.distinctDids > 1);
  lines.push("## Duplicate clusters (cross-agent first)");
  lines.push("");
  const shownClusters = farmClusters.slice(0, config.max_clusters_in_markdown);
  if (shownClusters.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| Size | Agents | DIDs | Sample summary | Keys |");
    lines.push("|---|---|---|---|---|");
    for (const cluster of shownClusters) {
      const keys = cluster.members.map((member) => `\`${member.key}\``).join(" ");
      lines.push(`| ${cluster.size} | ${cluster.distinctAgents} | ${cluster.distinctDids} | ${cluster.sampleSummary.replace(/\|/g, "\\|")} | ${keys} |`);
    }
    if (farmClusters.length > shownClusters.length) {
      lines.push("");
      lines.push(`Showing ${shownClusters.length} of ${farmClusters.length} cross-agent clusters. Full list in the JSON report.`);
    }
  }
  lines.push("");

  lines.push("## DID reuse");
  lines.push("");
  if (didReuse.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| DID | Keys |");
    lines.push("|---|---|");
    for (const item of didReuse) {
      lines.push(`| \`${item.did}\` | ${item.keys.map((key) => `\`${key}\``).join(" ")} |`);
    }
  }
  lines.push("");

  const flagged = audited.filter((record) => record.flags.length > 0);
  lines.push("## Flagged records");
  lines.push("");
  const shownFlagged = flagged.slice(0, config.max_flagged_records_in_markdown);
  if (shownFlagged.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| Key | Agent | Schema | Flags |");
    lines.push("|---|---|---|---|");
    for (const record of shownFlagged) {
      lines.push(`| \`${record.key}\` | ${record.fields.agentName || "-"} | ${record.schema} | ${record.flags.join(", ")} |`);
    }
    if (flagged.length > shownFlagged.length) {
      lines.push("");
      lines.push(`Showing ${shownFlagged.length} of ${flagged.length} flagged records. Full list in the JSON report.`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Method: every record under `/kv/contrib` is fetched and parsed; DID fingerprints are recomputed as `sha256(did)[0:16]` and compared to the storage key; profile notes are read from the sharded and legacy paths; summaries are clustered by exact normalized match plus 3-word-shingle Jaccard similarity. This report flags inconsistencies in public records; a flag is a data-quality signal, not an accusation.");
  lines.push("");

  return lines.join("\n");
}

module.exports = { DEFAULTS, buildSummary, toMarkdown };
