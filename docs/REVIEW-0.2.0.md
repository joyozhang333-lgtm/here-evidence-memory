# 0.2.0 local-session adapter review

Reviewed 2026-09-08 before commit and PR creation. This is a manual implementation review, not an independent security audit.

## Scope and baseline

The remote had no main branch. Work started from the clean default branch, codex/initial-release, at c2a0b34b909039624c8eb851a6b1022cfae533dd, after fetch. The feature branch is codex/local-session-adapter. Changes are limited to this package; no host application, storage implementation or sharing UI was modified.

## Product and API

The existing evidence functions remain available. adaptSessions and createSessionSourceId add stateless local-history adaptation with original text, sessionId, entryId, sourceRefs and text-free diagnostics. Default adaptation admits only user bubbles. Custom mapping reads legacy host fields without requiring a database, embedding service or model. Corrections remain dated original statements, not merged claims or diagnoses. Small retrieval budgets can still omit corrections; the host must keep current corrections in current context.

## Privacy, consent and lifecycle

Pause, inclusive global/session watermarks, source exclusions, invalid boundaries and revoked states were reviewed across adaptation, retrieval and verification. Duplicate session identities are excluded entirely; duplicate entry/source IDs are counted before role, timestamp or revocation filtering so a revoked copy cannot make a stale active copy usable. Owner IDs are local namespaces unless authenticated externally. No account or cross-device guarantees are introduced.

Session fallback uses only the UTC date from createdAt or an explicit mapped session date. It never uses updatedAt or current time. Precision survives retrieval, JSON formatting and verification. A session date is only an anchor and is conservatively excluded if its UTC start is not strictly after the watermark. Old records without stable IDs or usable dates are skipped, not invented.

Persistent epochs, pause-period exclusions, watermark durability, multi-tab coordination, late-reply rejection, current-snapshot verification and shared-card allowlists remain host responsibilities. The package cannot certify those behaviors in another product. A cleared history must not be resurrected by changing IDs, timestamps or namespaces.

## Security and trust boundaries

Server verification of a client-supplied source and quote establishes only their internal consistency. Tests explicitly demonstrate that a self-consistent fictional client record can pass; no database provenance or ownership authentication is claimed. Input schema/size limits, storage authorization and model/tool permissions remain separate controls. Historical text remains untrusted data. Public examples, test data and package contents were reviewed for identifying information; all conversation samples are synthetic, and diagnostics omit original text, IDs and exception details.

## Regression and distribution

0.1.x function names and valid input shapes are retained, including inline query options for isSourceEligible. The documented intentional tightenings are invalid/empty watermarks, invalid now values, unknown statuses, metadata validation and conflict handling. New precision fields are optional on legacy MemorySource/MemoryEvidence, required on adapted sources and checked consistently when present.

Build output is standalone browser ESM, standalone IIFE exposing window.HereEvidenceMemory, and standalone CJS that can be renamed to vendor/evidence-memory.cjs. ESM and CJS receive separate self-contained declarations. Conditional exports, old evidence consumers, new adapters, NodeNext CJS/ESM types and bundler type resolution were inspected and tested. There are zero runtime, optional runtime or peer dependencies. Build/test tools are development-only. The package allowlist contains exactly eight files.

No visual UI was changed, so visual consistency review is not applicable. Real Chromium behavior, not a Node VM simulation, verifies the browser entry points. HTTP/browser test processes are closed and temporary consumers are removed.

## Findings fixed during review

- Date.parse can normalize invalid calendar dates; boundaries now require a valid calendar date or explicit zoned ISO timestamp and fail closed for rollover/local-time strings.
- Filtering identity conflicts only after eligibility could admit an old active copy beside a revoked one; conflict counting now precedes eligibility.
- Narrowing isSourceEligible to boundary-only options could break existing inline query calls; the type accepts both boundary and retrieval options and package-consumer compilation covers this.
- Precision removal/upgrading and malformed quote metadata are rejected. The context formatter explicitly avoids authenticating caller-supplied history.

## Verification

- Clean npm ci --ignore-scripts --offline completed successfully.
- npm run check passed.
- npm test passed all 44 tests: the 21 existing evidence tests and 23 focused session tests.
- npm run test:package passed after the clean install: actual tarball installation, ESM/CJS imports, renamed vendor CJS, ESM/CJS declarations, bundler types, eight-file allowlist, zero runtime dependencies and real Chromium ESM/IIFE behavior.
- npm audit with development dependencies and npm audit --omit=dev both reported zero vulnerabilities.
- git diff --check passed.

Local checks ran on Node 24.14.0. GitHub CI is configured for Node 20 and 22; its post-push result must be checked separately. Browser coverage is Chromium only, not real-device Safari or a host-product acceptance test. Lexical recall, bounded excerpts and session-date approximation retain their documented limitations. No merge, deployment or npm publication is authorized here.

Review outcome: no remaining blocking finding within this package's documented scope.
