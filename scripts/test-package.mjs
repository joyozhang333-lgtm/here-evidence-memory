import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exercise, testBrowser } from "./test-browser.mjs";

const root = process.cwd();
const temporary = mkdtempSync(join(root, ".package-test-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  execFileSync(npm, ["run", "build"], { cwd: root, stdio: "inherit" });
  const packed = JSON.parse(execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], { cwd: root, encoding: "utf8" }))[0];
  assert.deepEqual(packed.files.map(file => file.path).sort(), [
    "LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.cjs", "dist/index.d.ts",
    "dist/index.d.cts", "dist/here-evidence-memory.iife.js",
  ].sort());
  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "synthetic-memory-consumer", private: true, type: "module" }));
  execFileSync(npm, ["install", join(temporary, packed.filename), "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--offline"], { cwd: consumer, stdio: "inherit" });
  const example = `
import { retrieveEvidence, verifyEvidence, formatEvidenceContext, isSourceEligible, EVIDENCE_MEMORY_VERSION } from 'here-evidence-memory';
const source = { id: 'synthetic-message', ownerId: 'synthetic-owner', sessionId: 'synthetic-session', role: 'user', text: '今天我想谈工作边界。', observedAt: '2026-01-01T00:00:00.000Z' };
const options = { ownerId: source.ownerId, query: '工作边界', now: '2026-02-01T00:00:00.000Z' };
const result = retrieveEvidence([source], options);
if (EVIDENCE_MEMORY_VERSION !== '0.3.0' || result.evidence.length !== 1 || !isSourceEligible(source, options) || !verifyEvidence(result.evidence[0], source, options) || !formatEvidenceContext(result).includes(source.id)) throw new Error('Packed ESM consumer failed');
`;
  execFileSync(process.execPath, ["--input-type=module", "-e", example], { cwd: consumer, stdio: "inherit" });
  const run = `const exercise = ${exercise.toString()}; exercise(HEM);`;
  execFileSync(process.execPath, ["--input-type=module", "-e", `import * as HEM from 'here-evidence-memory'; ${run}`], { cwd: consumer, stdio: "inherit" });
  execFileSync(process.execPath, ["--input-type=commonjs", "-e", `const HEM = require('here-evidence-memory'); ${run}`], { cwd: consumer, stdio: "inherit" });
  const dist = join(consumer, "node_modules/here-evidence-memory/dist");
  mkdirSync(join(consumer, "vendor"));
  copyFileSync(join(dist, "index.cjs"), join(consumer, "vendor/evidence-memory.cjs"));
  execFileSync(process.execPath, ["--input-type=commonjs", "-e", `const HEM = require('./vendor/evidence-memory.cjs'); ${run}`], { cwd: consumer, stdio: "inherit" });
  writeFileSync(join(consumer, "consumer.ts"), `
import { retrieveEvidence, verifyEvidence, formatEvidenceContext, isSourceEligible, type MemorySource, type MemoryEvidence, type MemoryCoverage, type RetrievalOptions } from 'here-evidence-memory';
const source: MemorySource = { id: 'typed-source', ownerId: 'typed-owner', sessionId: 'typed-session', role: 'user', text: 'A synthetic statement.', observedAt: '2026-01-01T00:00:00.000Z' };
const options: RetrievalOptions = { ownerId: source.ownerId, query: 'synthetic', now: '2026-02-01T00:00:00.000Z' };
const result = retrieveEvidence([source], options);
const evidence: MemoryEvidence | undefined = result.evidence[0];
const coverage: MemoryCoverage = result.coverage;
const verified: boolean = evidence ? verifyEvidence(evidence, source, options) : false;
const eligible: boolean = isSourceEligible(source, options);
isSourceEligible(source, { ownerId: source.ownerId, query: 'synthetic', now: options.now });
const context: string = formatEvidenceContext(result);
void [coverage, verified, eligible, context];
`);
  execFileSync(process.execPath, [resolve(root, "node_modules/typescript/lib/tsc.js"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], { cwd: consumer, stdio: "inherit" });
  const typedBody = `
const boundary: HEM.MemoryBoundaryOptions = { ownerId: 'local-synthetic', memoryEnabled: true };
const sessions: HEM.LocalSession[] = [{ id: 'session', createdAt: '2026-01-01', timeline: [{ id: 'entry', type: 'bubble', role: 'user', text: 'Synthetic work boundaries.' }] }];
const adapted: HEM.SessionAdapterResult = HEM.adaptSessions(sessions, boundary);
const source: HEM.AdaptedMemorySource = adapted.sources[0];
const ref: HEM.SessionSourceRef = adapted.sourceRefs[source.id];
const diagnostic: HEM.SessionAdapterDiagnostic | undefined = adapted.diagnostics[0];
const options: HEM.RetrievalOptions = { ...boundary, query: 'work boundaries' };
const result = HEM.retrieveEvidence(adapted.sources, options);
const evidence: HEM.MemoryEvidence = result.evidence[0];
const coverage: HEM.MemoryCoverage = result.coverage;
const precision: HEM.ObservedAtPrecision = source.observedAtPrecision;
const verified: boolean = HEM.verifyEvidence(evidence, source, options);
const eligible: boolean = HEM.isSourceEligible(source, boundary);
const context: string = HEM.formatEvidenceContext(result);
const claimOptions: HEM.ClaimVerificationOptions = { ...boundary, currentTurnSourceIds: [], fullHistoryLoaded: true };
const claimCorpus: HEM.ClaimVerificationCorpus = HEM.collectClaimVerificationCorpus(adapted.sources, claimOptions);
const id: string = HEM.createSessionSourceId(boundary.ownerId, ref.sessionId, ref.entryId);
type CustomEntry = { key: string; value: string };
type CustomSession = { key: string; messages: CustomEntry[] };
const mapping: HEM.SessionMapping<CustomSession, CustomEntry> = { sessionId: s => s.key, entries: s => s.messages, entryId: e => e.key, text: e => e.value, isUserEntry: () => true, sessionDate: () => '2026-01-01' };
const adapterOptions: HEM.SessionAdapterOptions<CustomSession, CustomEntry> = { ...boundary, mapping };
HEM.adaptSessions([{ key: 'custom', messages: [{ key: 'entry', value: 'Original text.' }] }], adapterOptions);
void [diagnostic, coverage, precision, verified, eligible, context, claimCorpus, id];
`;
  writeFileSync(join(consumer, "adapter.ts"), `import * as HEM from 'here-evidence-memory';\n${typedBody}`);
  writeFileSync(join(consumer, "adapter.cts"), `import HEM = require('here-evidence-memory');\n${typedBody}`);
  const tsc = resolve(root, "node_modules/typescript/lib/tsc.js");
  execFileSync(process.execPath, [tsc, "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "adapter.ts", "adapter.cts"], { cwd: consumer, stdio: "inherit" });
  execFileSync(process.execPath, [tsc, "--noEmit", "--strict", "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "adapter.ts"], { cwd: consumer, stdio: "inherit" });
  const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/here-evidence-memory/package.json"), "utf8"));
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  assert.equal(Object.keys(manifest.optionalDependencies || {}).length, 0);
  assert.equal(Object.keys(manifest.peerDependencies || {}).length, 0);
  await testBrowser(dist);
  console.log(`Package verified: ${packed.filename}; ${packed.files.length} allowlisted files; ${packed.size} bytes; ESM, CJS, renamed vendor CJS, both TS formats, bundler types and real Chromium ESM/IIFE passed.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
