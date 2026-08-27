#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { profilePathsForFingerprint } = require("../lib/didkey");
const { createFetchQueue } = require("../lib/fetchqueue");
const { auditRecord } = require("../lib/checks");
const { clusterDuplicates, findDidReuse } = require("../lib/cluster");
const { buildSummary, toMarkdown } = require("../lib/report");

const HELP = `technocore-registry-audit — read-only integrity audit of /kv/contrib

Usage: node bin/audit.js [options]

Options:
  --base-url <origin>          Technocore origin (default https://technocore.chat)
  --out-dir <dir>              report output directory (default ./out)
  --concurrency <n>            parallel requests (default 6)
  --request-timeout-in-ms <n>  per-request timeout (default 8000)
  --retry-count <n>            retries per request (default 2)
  --limit <n>                  audit only the first n keys (sampling; the report says so)
  --help                       show this help
`;

function parseArgs(argv) {
  const options = {
    baseUrl: "https://technocore.chat",
    outDir: "out",
    concurrency: 6,
    request_timeout_in_ms: 8000,
    retry_count: 2,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--base-url") options.baseUrl = String(next() || "").replace(/\/+$/, "");
    else if (arg === "--out-dir") options.outDir = next();
    else if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--request-timeout-in-ms") options.request_timeout_in_ms = Number(next());
    else if (arg === "--retry-count") options.retry_count = Number(next());
    else if (arg === "--limit") options.limit = Number(next());
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  if (!/^https?:\/\//.test(options.baseUrl)) {
    process.stderr.write("--base-url must be an http(s) origin.\n");
    process.exit(2);
  }
  return options;
}

function progressLine(label) {
  let lastShown = 0;
  return (done, total) => {
    if (done - lastShown >= 25 || done === total) {
      lastShown = done;
      process.stderr.write(`${label}: ${done}/${total}\n`);
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const queue = createFetchQueue(options);

  process.stderr.write(`Listing ${options.baseUrl}/kv/contrib ...\n`);
  const listing = await queue.fetchText(`${options.baseUrl}/kv/contrib`);
  if (!listing.ok) {
    process.stderr.write(`Failed to list registry (status ${listing.status}).\n`);
    process.exit(1);
  }

  let keys = listing.text
    .split("\n")
    .map((line) => line.trim().split("/").pop())
    .filter((key) => /^[a-f0-9]{16}$/.test(key));
  const totalKeys = keys.length;
  if (options.limit > 0 && keys.length > options.limit) {
    keys = keys.slice(0, options.limit);
    process.stderr.write(`Sampling: auditing ${keys.length} of ${totalKeys} keys (--limit).\n`);
  } else {
    process.stderr.write(`Auditing all ${keys.length} keys.\n`);
  }

  const audited = await queue.mapConcurrent(
    keys,
    async (key) => {
      const record = await queue.fetchText(`${options.baseUrl}/kv/contrib/${key}`);
      // Profile lives at the fingerprint of the record's own DID, which may
      // legitimately differ from the storage key (that mismatch is what the
      // fingerprint check reports). Read profile paths for the storage key:
      // that is where a correctly published profile links back from.
      const profileTexts = [];
      for (const profilePath of profilePathsForFingerprint(key)) {
        const profile = await queue.fetchText(`${options.baseUrl}${profilePath}`);
        if (profile.ok && profile.text) {
          profileTexts.push(profile.text);
          break; // sharded path found; legacy read not needed
        }
      }
      return auditRecord({ key, rawValue: record.text, profileTexts });
    },
    progressLine("records"),
  );

  const clusters = clusterDuplicates(audited);
  const didReuse = findDidReuse(audited);
  const summary = buildSummary(audited, clusters, didReuse, {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
  });
  if (options.limit > 0 && totalKeys > keys.length) {
    summary.sampling = { auditedKeys: keys.length, totalKeys };
  }

  fs.mkdirSync(options.outDir, { recursive: true });
  const jsonPath = path.join(options.outDir, "audit-report.json");
  const markdownPath = path.join(options.outDir, "audit-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, records: audited, clusters, didReuse }, null, 2));
  fs.writeFileSync(markdownPath, toMarkdown(summary, audited, clusters, didReuse));

  process.stderr.write(
    `\nDone. ${summary.totals.records} records, ${summary.totals.clean} clean, ` +
      `${summary.totals.flagged} flagged, ${summary.totals.farmClusters} cross-agent duplicate clusters.\n` +
      `HTTP: ${queue.stats.requests} requests, ${queue.stats.retries} retries, ${queue.stats.failures} failures.\n` +
      `Reports: ${markdownPath}, ${jsonPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
