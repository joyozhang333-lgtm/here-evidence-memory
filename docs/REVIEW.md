# 0.1.0 release review

Reviewed 2026-09-06 before the first public repository push.

## Product behavior

The package retrieves source quotations rather than generating inferred user facts. It keeps timestamps and selects a limited mix of relevant, recent and older evidence. It does not promise that every past message will appear in every model request. Full conversation storage is outside this package.

## Privacy and ownership

Same-owner user messages are required; assistant messages, revoked records and excluded sources are rejected. Nonempty malformed deletion watermarks fail closed. Verification must be repeated if the host permits a source to change after retrieval. Authentication, database authorization, encryption, consent, deletion and concurrent lifecycle operations remain host responsibilities.

## Provenance and model boundaries

Every selected quote is an exact source slice with UTF-16 positions and a timestamp. Fabricated quotes and changed owner, session, role or time are rejected. Source matching does not establish objective truth or current validity. Historical prompt injection remains untrusted data; labeling it is not an LLM security guarantee.

## Regression and availability

Twenty-one synthetic tests cover 100 / 300 / 1,000 messages at 7 / 30 / 90 days, long-message tails, corrections, revocation, cross-owner filtering, duplicate IDs, forged quotes, numeric budgets and mixed UTC offsets. Non-finite budgets fail safely and evidence has fixed item/character caps. The caller must bound input corpus size and decoding cost; output limits do not bound input work.

Two issues discovered during review were fixed before release: non-finite numeric limits could bypass budgets, and lexicographic ISO-string sorting could report the wrong chronology for timestamps with different offsets. The shared product core and this package were resynchronized after those fixes.

## Distribution and public data

The package contains five allowlisted files: ESM output, TypeScript declarations, README, license and package manifest. The runtime has zero dependencies. Examples and tests use anonymous synthetic data. No product configuration, encrypted archive, credentials, private operational files or real user conversations are distributed.

The real `npm pack` archive was installed in an isolated temporary consumer. ESM imports and every public TypeScript type compiled successfully. `npm run check`, all 21 tests, package-consumer checks and the official npm audit passed; audit reported zero vulnerabilities. npm registry publication is not part of this release.

## Remaining limits

- Lexical matching is not semantic understanding; recall and relevance can fail.
- A quotation window can cut across a sentence or Unicode character boundary; fetch original context before making important claims.
- The package is not a clinical assessment, diagnosis or treatment system.
- CI verifies supported Node versions after GitHub push; results must be checked separately from local success.

Review outcome: ready for a public source release within these documented boundaries.
