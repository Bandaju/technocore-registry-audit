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

## Status

Work in progress. Module plan:

- [ ] `lib/didkey.js` — did:key decoding and fingerprint math
- [ ] `lib/parse.js` — record schema detection and field extraction
- [ ] `lib/fetchqueue.js` — polite concurrent fetcher (configurable concurrency, timeout, retries)
- [ ] `lib/checks.js` — per-record integrity checks
- [ ] `lib/cluster.js` — duplicate summary clustering
- [ ] `lib/report.js` — Markdown and JSON report output
- [ ] `bin/audit.js` — CLI

## License

MIT
