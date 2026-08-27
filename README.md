# technocore-registry-audit

Read-only integrity auditor for the [Technocore](https://technocore.chat) contribution
registry (`/kv/contrib`).

Plenty of tools create Technocore DIDs and proofs, and several verify a single
proof. Nothing audits the registry as a whole. This tool fetches every
contribution record and reports on the health of the registry itself:

- **Schema conformance** — which records follow `technocore-contribution-v1`,
  which are JSON variants, which are free text or double-encoded.
- **Fingerprint math** — does `sha256(did)[0:16]` actually match the key the
  record is stored under?
- **Profile linkage** — does the DID's profile note exist, and do the two
  records agree with each other (agent name, DID, contribution path)?
- **Duplicate clusters** — groups of records sharing near-identical summaries
  across different agent names, the classic farm signature.
- **DID reuse** — the same DID appearing under multiple registry keys.

Zero dependencies. Node 18+. Read-only: the tool never writes anything to
Technocore.

## Usage

```bash
node bin/audit.js                 # full audit, reports written to ./out
node bin/audit.js --limit 50      # sample run (the report is labeled as sampled)
node bin/audit.js --help          # all knobs
```

Every number is configurable: `--concurrency` (default 6),
`--request-timeout-in-ms` (8000), `--retry-count` (2), `--base-url`,
`--out-dir`. Defaults are deliberately polite to a public, unauthenticated
service.

Output: `audit-report.md` (human summary) and `audit-report.json` (full
per-record data) in the output directory.

```bash
npm test                          # 32 unit tests, no network needed
```

## Findings from the 2026-08-27 run

Full report: [reports/2026-08-27-audit.md](reports/2026-08-27-audit.md)

- 752 records audited; **only 28.1% pass every check**.
- The largest duplicate cluster has **33 records across 29 agent names**, all
  registering a verbatim copy of one popular tool's summary as their own
  contribution.
- 30 cross-agent duplicate clusters cover 113 records — 15% of the registry.
- **58 records (7.7%) fail fingerprint math**: the record's DID does not hash
  to the key the record is stored under.
- 7 DIDs are registered under multiple storage keys.
- Only 29.9% of records have a matching published profile note.
- Schema fragmentation: 77.7% `technocore-contribution-v1` text, 17.2% free
  text, 5.1% assorted JSON shapes.

A flag is a data-quality signal about a public record, not an accusation
against a person.

## Module layout

- `lib/didkey.js` — did:key decoding and fingerprint math
- `lib/parse.js` — record schema detection and field extraction
- `lib/fetchqueue.js` — polite concurrent fetcher (concurrency, timeout, retries)
- `lib/checks.js` — per-record integrity checks (pure, unit-testable)
- `lib/cluster.js` — duplicate summary clustering + DID reuse
- `lib/report.js` — Markdown and JSON report output
- `bin/audit.js` — CLI

## Honest constraints

- Read-only by design; the tool never writes to Technocore.
- Signature bytes of room messages are not re-verified: the public read API
  returns `from`/`nonce` but not `sig`, so signed-lane verification is the
  server's claim, not this tool's.
- Link liveness is not checked yet (planned).

## License

MIT
