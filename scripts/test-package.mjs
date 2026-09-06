import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "here-evidence-memory-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  execFileSync(npm, ["run", "build"], { cwd: root, stdio: "inherit" });
  const packed = JSON.parse(execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], { cwd: root, encoding: "utf8" }))[0];
  assert.ok(packed.files.length > 0);
  for (const file of packed.files) {
    assert.match(file.path, /^(dist\/(index\.js|index\.d\.ts)|README\.md|LICENSE|package\.json)$/);
  }
  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "synthetic-memory-consumer", private: true, type: "module" }));
  execFileSync(npm, ["install", join(temporary, packed.filename), "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--offline"], { cwd: consumer, stdio: "inherit" });
  const example = `
import { retrieveEvidence, verifyEvidence, formatEvidenceContext, isSourceEligible, EVIDENCE_MEMORY_VERSION } from 'here-evidence-memory';
const source = { id: 'synthetic-message', ownerId: 'synthetic-owner', sessionId: 'synthetic-session', role: 'user', text: '今天我想谈工作边界。', observedAt: '2026-01-01T00:00:00.000Z' };
const options = { ownerId: source.ownerId, query: '工作边界', now: '2026-02-01T00:00:00.000Z' };
const result = retrieveEvidence([source], options);
if (EVIDENCE_MEMORY_VERSION !== '0.1.0' || result.evidence.length !== 1 || !isSourceEligible(source, options) || !verifyEvidence(result.evidence[0], source, options) || !formatEvidenceContext(result).includes(source.id)) throw new Error('Packed ESM consumer failed');
`;
  execFileSync(process.execPath, ["--input-type=module", "-e", example], { cwd: consumer, stdio: "inherit" });
  writeFileSync(join(consumer, "consumer.ts"), `
import { retrieveEvidence, verifyEvidence, formatEvidenceContext, isSourceEligible, type MemorySource, type MemoryEvidence, type MemoryCoverage, type RetrievalOptions } from 'here-evidence-memory';
const source: MemorySource = { id: 'typed-source', ownerId: 'typed-owner', sessionId: 'typed-session', role: 'user', text: 'A synthetic statement.', observedAt: '2026-01-01T00:00:00.000Z' };
const options: RetrievalOptions = { ownerId: source.ownerId, query: 'synthetic', now: '2026-02-01T00:00:00.000Z' };
const result = retrieveEvidence([source], options);
const evidence: MemoryEvidence | undefined = result.evidence[0];
const coverage: MemoryCoverage = result.coverage;
const verified: boolean = evidence ? verifyEvidence(evidence, source, options) : false;
const eligible: boolean = isSourceEligible(source, options);
const context: string = formatEvidenceContext(result);
void [coverage, verified, eligible, context];
`);
  execFileSync(process.execPath, [resolve(root, "node_modules/typescript/lib/tsc.js"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], { cwd: consumer, stdio: "inherit" });
  const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/here-evidence-memory/package.json"), "utf8"));
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  console.log(`Package verified: ${packed.filename}; ${packed.files.length} allowlisted files; ${packed.size} bytes; ESM and TypeScript consumer passed.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
