import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function exercise(HEM) {
  const options = { ownerId: "synthetic-local", query: "work boundaries", now: "2026-06-01T08:00:00Z" };
  const sessions = ["session-1", "session-2"].map(id => ({
    id, createdAt: "2026-01-01", timeline: [
      { id: "same-entry", type: "bubble", role: "user", text: "I want work boundaries." },
      { id: "coach", type: "bubble", role: "coach", text: "An interpretation." },
    ],
  }));
  const { sources, sourceRefs } = HEM.adaptSessions(sessions, options);
  const result = HEM.retrieveEvidence(sources, options);
  if (HEM.EVIDENCE_MEMORY_VERSION !== "0.2.0" || result.evidence.length !== 2) throw new Error("Retrieval failed");
  for (const source of sources) {
    const evidence = result.evidence.find(e => e.sourceId === source.id);
    if (!HEM.isSourceEligible(source, options) || !HEM.verifyEvidence(evidence, source, options) ||
      source.id !== HEM.createSessionSourceId(options.ownerId, source.sessionId, source.entryId) ||
      sourceRefs[source.id].entryId !== "same-entry" || evidence.observedAtPrecision !== "session-date") {
      throw new Error("Provenance or time precision failed");
    }
    if (HEM.verifyEvidence(evidence, source, { ...options, memoryEnabled: false }) ||
      HEM.verifyEvidence(evidence, source, { ...options, excludedBefore: options.now })) throw new Error("Boundary failed");
  }
  if (!HEM.formatEvidenceContext(result).includes(JSON.stringify(result))) throw new Error("Context serialization failed");
  return { exports: Object.keys(HEM).sort(), result, sourceRefs };
}

export async function testBrowser(dist) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(process.cwd(), "node_modules/.cache/ms-playwright");
  const { chromium } = await import("playwright");
  const esm = await import(pathToFileURL(join(dist, "index.js")).href);
  const expected = JSON.parse(JSON.stringify(exercise(esm)));
  const routes = new Map([
    ["/index.js", readFileSync(join(dist, "index.js"))],
    ["/here-evidence-memory.iife.js", readFileSync(join(dist, "here-evidence-memory.iife.js"))],
  ]);
  const server = createServer((req, res) => {
    const file = routes.get(req.url);
    res.writeHead(file || req.url === "/" ? 200 : 404, { "Content-Type": file ? "text/javascript" : "text/html" });
    res.end(file ?? "<!doctype html><title>Synthetic package test</title>");
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    for (const format of ["iife", "esm"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.addScriptTag({ content: `window.exercise = ${exercise.toString()};` });
      if (format === "iife") await page.addScriptTag({ url: "/here-evidence-memory.iife.js" });
      const actual = await page.evaluate(async format => {
        if (typeof require !== "undefined" || typeof process !== "undefined") throw new Error("Unexpected Node globals");
        const HEM = format === "iife" ? window.HereEvidenceMemory : await import("/index.js");
        return window.exercise(HEM);
      }, format);
      assert.deepEqual(actual, expected);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
