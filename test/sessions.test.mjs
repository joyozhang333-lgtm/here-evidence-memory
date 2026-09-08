import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptSessions, createSessionSourceId, formatEvidenceContext,
  isSourceEligible, retrieveEvidence, verifyEvidence,
} from "../dist/index.js";

const NOW = "2026-06-01T08:00:00.000Z";
const options = extra => ({ ownerId: "local-synthetic", now: NOW, query: "work boundaries", ...extra });
const entry = (extra = {}) => ({ id: "entry-1", type: "bubble", role: "user", text: "  I want work boundaries.\n", ...extra });
const session = (extra = {}) => ({ id: "session-1", createdAt: "2026-01-02T08:30:00.000Z", timeline: [entry()], ...extra });
const adapt = (sessions = [session()], extra) => adaptSessions(sessions, options(extra));

test("adapts cross-session history without mutating text, data or source references", () => {
  const sessions = [session(), session({ id: "session-2" })];
  const before = JSON.stringify(sessions);
  const result = adapt(sessions);
  assert.equal(result.sources.length, 2);
  assert.notEqual(result.sources[0].id, result.sources[1].id);
  assert.equal(result.sources[0].text, sessions[0].timeline[0].text);
  for (const source of result.sources) {
    assert.deepEqual(result.sourceRefs[source.id], { sessionId: source.sessionId, entryId: source.entryId });
    assert.equal(source.id, createSessionSourceId(options().ownerId, source.sessionId, source.entryId));
  }
  assert.equal(JSON.stringify(sessions), before);
  assert.deepEqual(adapt([...sessions].reverse()).sources.map(s => s.id).sort(), result.sources.map(s => s.id).sort());
  assert.equal(Object.keys(JSON.parse(JSON.stringify(result.sourceRefs))).length, 2);
});

test("ID encoding is unambiguous for delimiters, escapes and namespace changes", () => {
  const tuples = [["a:b", "c", "d"], ["a", "b:c", "d"], ["a", "b", "c:d"],
    ["a", "b", 'c"d'], ["a", "b", "c\\d"], ["a", "__proto__", "constructor"],
    ["owner-2", "b", "c:d"], ["a", "b", "\ud800"]];
  assert.equal(new Set(tuples.map(args => createSessionSourceId(...args))).size, tuples.length);
  for (const value of ["", " ", undefined, 1, null]) {
    assert.throws(() => createSessionSourceId("a", "b", value), TypeError);
  }
});

test("missing stable IDs are skipped, never replaced with array indexes", () => {
  const result = adapt([session({ timeline: [entry({ id: undefined }), entry({ id: "stable" })] })]);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].entryId, "stable");
  assert.deepEqual(result.diagnostics, [{ reason: "invalid-entry-id", sessionIndex: 0, entryIndex: 0 }]);
  assert.equal(adapt([session({ id: undefined })]).sources.length, 0);
});

test("only exact user bubbles qualify, never coach, recipient or a summary", () => {
  const timeline = [entry(), ...["coach", "recipient", "assistant", "system", "User", undefined]
    .map((role, i) => entry({ id: `role-${i}`, role })), entry({ id: "summary", type: "summary" }),
    entry({ id: "no-type", type: undefined }), entry({ id: "empty", text: "\n " })];
  const result = adapt([session({ timeline })]);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].entryId, "entry-1");
  assert.equal(Object.keys(result.sourceRefs).length, 1);
});

test("old records get a UTC session date, not fabricated precision or updatedAt", () => {
  const input = session({ createdAt: "2026-01-02T01:30:00+08:00", updatedAt: NOW,
    timeline: [entry(), entry({ id: "entry-2", observedAt: null })] });
  const result = adapt([input]);
  assert.equal(result.sources.length, 2);
  for (const source of result.sources) {
    assert.equal(source.observedAt, "2026-01-01");
    assert.equal(source.observedAtPrecision, "session-date");
  }
  assert.deepEqual(adapt([{ ...input, updatedAt: "2026-09-01T00:00:00Z" }]).sources, result.sources);
  assert.equal(adapt([session({ createdAt: undefined, updatedAt: NOW })]).sources.length, 0);
});

test("exact zoned message timestamps and epoch milliseconds retain message precision", () => {
  const result = adapt([session({ createdAt: undefined, timeline: [
    entry({ observedAt: "2026-01-02T01:30:00+08:00" }),
    entry({ id: "epoch", observedAt: Date.parse("2026-01-01T17:30:00Z") }),
  ] })]);
  assert.equal(result.sources.length, 2);
  result.sources.forEach(s => {
    assert.equal(s.observedAt, "2026-01-01T17:30:00.000Z");
    assert.equal(s.observedAtPrecision, "message");
  });
  assert.equal(adapt([session({ createdAt: 0 })]).sources[0].observedAt, "1970-01-01");
  assert.equal(adapt([session({ createdAt: "2024-02-29" })]).sources[0].observedAt, "2024-02-29");
});

test("invalid message times cannot fall back to a valid session date", () => {
  for (const observedAt of ["", "yesterday", "2026-01-01", "2026-01-01T12:00:00",
    "2026-02-30T00:00:00Z", "2026-01-01T24:00:00Z", NaN, Infinity, true, {},
    "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z", "2026-01-01T00:00:00+25:00"]) {
    const result = adapt([session({ timeline: [entry({ observedAt })] })]);
    assert.equal(result.sources.length, 0, String(observedAt));
    assert.equal(result.diagnostics[0].reason, "invalid-time");
  }
});

test("invalid session dates and future dates fail closed without using updatedAt", () => {
  for (const createdAt of [null, undefined, "", "2026-02-29", "2026-02-30T12:00:00Z", "06/01/2026",
    "2026-06-02", "2026-06-01T09:00:00Z", Infinity]) {
    assert.equal(adapt([session({ createdAt, updatedAt: "2026-01-01" })]).sources.length, 0, String(createdAt));
  }
  assert.equal(adapt([session({ timeline: [entry({ observedAt: "2026-06-01T09:00:00Z" })] })]).sources.length, 0);
});

test("coarse dates are conservatively excluded by same-day watermarks", () => {
  const sessions = [session({ createdAt: "2026-01-02" })];
  assert.equal(adapt(sessions, { excludedBefore: "2026-01-01T23:59:59.999Z" }).sources.length, 1);
  for (const excludedBefore of ["2026-01-02T00:00:00Z", "2026-01-02T12:00:00Z", "2026-01-03"]) {
    assert.equal(adapt(sessions, { excludedBefore }).sources.length, 0);
  }
  const exact = [session({ timeline: [entry({ observedAt: "2026-01-02T12:00:00Z" })] })];
  assert.equal(adapt(exact, { excludedBefore: "2026-01-02T11:59:59Z" }).sources.length, 1);
  assert.equal(adapt(exact, { excludedBefore: "2026-01-02T12:00:00Z" }).sources.length, 0);
});

test("global, per-session and exact source exclusions persist across re-adaptation", () => {
  const sessions = [session(), session({ id: "session-2" })];
  const id = createSessionSourceId(options().ownerId, "session-1", "entry-1");
  for (const boundary of [{ excludedSourceIds: [id] }, { sessionExcludedBefore: { "session-1": NOW } }]) {
    const result = adapt(sessions, boundary);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].sessionId, "session-2");
    assert.equal(result.sourceRefs[id], undefined);
  }
  const boundary = JSON.parse(JSON.stringify({ excludedBefore: NOW, memoryEnabled: true }));
  assert.equal(adapt(sessions, boundary).sources.length, 0);
});

test("empty and malformed supplied watermarks fail closed, including per-session", () => {
  for (const watermark of ["", " ", "invalid", "2026-02-30", "2026-02-30T00:00:00Z", "2026-01-01T12:00:00", 123, {}]) {
    assert.equal(adapt(undefined, { excludedBefore: watermark }).sources.length, 0);
    assert.equal(adapt(undefined, { sessionExcludedBefore: { "session-1": watermark } }).sources.length, 0);
  }
  assert.equal(adapt(undefined, { excludedBefore: null }).sources.length, 1);
});

test("pause blocks adaptation, cached retrieval and verification; resume keeps exclusions", () => {
  const { sources } = adapt();
  const evidence = retrieveEvidence(sources, options()).evidence[0];
  const disabled = options({ memoryEnabled: false });
  assert.equal(adapt(undefined, disabled).sources.length, 0);
  assert.equal(retrieveEvidence(sources, disabled).evidence.length, 0);
  assert.equal(verifyEvidence(evidence, sources[0], disabled), false);
  assert.equal(verifyEvidence(evidence, sources[0], options({ excludedBefore: NOW })), false);
  assert.equal(adapt(undefined, { memoryEnabled: true, excludedBefore: NOW }).sources.length, 0);
});

test("revoked and unknown statuses are excluded and cannot leave stale references", () => {
  for (const status of ["revoked", "deleted", null, true]) {
    const result = adapt([session({ timeline: [entry({ status })] })]);
    assert.equal(result.sources.length, 0);
    assert.equal(Object.keys(result.sourceRefs).length, 0);
  }
  const source = adapt().sources[0];
  const evidence = retrieveEvidence([source], options()).evidence[0];
  assert.equal(verifyEvidence(evidence, { ...source, status: "revoked" }, options()), false);
});

test("duplicate source IDs all fail closed, even if one copy is revoked or non-user", () => {
  for (const extra of [{}, { status: "revoked" }, { role: "coach" }, { observedAt: "invalid" }]) {
    const timeline = [entry(), entry({ text: "A conflicting version.", ...extra })];
    for (const order of [timeline, [...timeline].reverse()]) {
      const result = adapt([session({ timeline: order })]);
      assert.equal(result.sources.length, 0);
      assert.ok(result.diagnostics.every(d => d.reason === "duplicate-source-id"));
    }
  }
  const source = adapt().sources[0];
  assert.equal(retrieveEvidence([source, { ...source, status: "revoked" }], options()).evidence.length, 0);
});

test("duplicate sessions are not silently merged, even if one timeline is invalid", () => {
  for (const duplicate of [session(), session({ timeline: null })]) {
    const result = adapt([session(), duplicate]);
    assert.equal(result.sources.length, 0);
    assert.ok(result.diagnostics.every(d => d.reason === "duplicate-session-id"));
  }
});

test("custom mapping supports legacy fields and explicit user/revocation predicates", () => {
  const history = [{ key: "legacy-session", day: "2026-01-01", messages: [
    { key: "legacy-entry", speaker: "human", body: "Original legacy work boundaries.", removed: false },
    { key: "removed-entry", speaker: "human", body: "Withdrawn.", removed: true },
    { key: "bot-entry", speaker: "bot", body: "An interpretation.", removed: false },
  ] }];
  const mapping = {
    sessionId: s => s.key, entries: s => s.messages, sessionDate: s => s.day,
    entryId: e => e.key, isUserEntry: e => e.speaker === "human", text: e => e.body,
    observedAt: e => e.sentAt, isRevoked: e => e.removed,
  };
  const result = adaptSessions(history, { ...options(), mapping });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].text, history[0].messages[0].body);
  assert.equal(result.sources[0].entryId, "legacy-entry");
  assert.equal(result.sources[0].observedAt, "2026-01-01");
});

test("mapping errors are isolated and diagnostics never contain text or exception messages", () => {
  const secret = "Private synthetic sentence that must not be logged.";
  const result = adapt([session({ timeline: [entry(), entry({ id: "good" })] })], {
    mapping: { text: e => { if (e.id === "entry-1") throw new Error(secret); return e.text; } },
  });
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.diagnostics, [{ reason: "mapping-error", sessionIndex: 0, entryIndex: 0 }]);
  assert.equal(JSON.stringify(result.diagnostics).includes(secret), false);
});

test("precision survives retrieval and cannot be removed or upgraded during verification", () => {
  const { sources } = adapt();
  const result = retrieveEvidence(sources, options());
  const evidence = result.evidence[0];
  assert.equal(evidence.observedAtPrecision, "session-date");
  assert.equal(verifyEvidence(evidence, sources[0], options()), true);
  for (const observedAtPrecision of [undefined, "message", "unknown"]) {
    assert.equal(verifyEvidence({ ...evidence, observedAtPrecision }, sources[0], options()), false);
  }
  assert.equal(isSourceEligible({ ...sources[0], observedAtPrecision: "message" }, options()), false);
  assert.equal(formatEvidenceContext(result).includes("session-date"), true);
  assert.ok(JSON.stringify(evidence).length <= 8000);
});

test("adapted Unicode text preserves exact UTF-16 quotation offsets", () => {
  const text = " \u{1F642} \u5de5\u4f5c\u8fb9\u754c\n";
  const { sources } = adapt([session({ timeline: [entry({ text })] })]);
  const evidence = retrieveEvidence(sources, options()).evidence[0];
  assert.equal(evidence.quote, text);
  assert.equal(evidence.end, text.length);
  assert.equal(verifyEvidence(evidence, sources[0], options()), true);
  assert.equal(verifyEvidence({ ...evidence, end: [...text].length }, sources[0], options()), false);
});

test("corrections remain separate original statements, never diagnoses or merged facts", () => {
  const old = "I thought work caused all my tension.";
  const correction = "Correction: I no longer think work explains all my tension.";
  const sessions = [session({ timeline: [entry({ text: old })] }),
    session({ id: "later", createdAt: "2026-05-30", timeline: [entry({ text: correction })] })];
  const adapted = adapt(sessions);
  const result = retrieveEvidence(adapted.sources, options());
  assert.deepEqual(new Set(result.evidence.map(e => e.quote)), new Set([old, correction]));
  const oldId = adapted.sources[0].id;
  const withdrawn = adapt(sessions, { excludedSourceIds: [oldId] });
  assert.deepEqual(withdrawn.sources.map(s => s.text), [correction]);
});

test("prototype-like session IDs remain ordinary data and only own watermarks apply", () => {
  const sessions = [session({ id: "__proto__" }), session({ id: "constructor" })];
  assert.equal(adapt(sessions, { sessionExcludedBefore: {} }).sources.length, 2);
  const exclusions = JSON.parse('{"__proto__":"2026-06-01","constructor":"2026-06-01"}');
  assert.equal(adapt(sessions, { sessionExcludedBefore: exclusions }).sources.length, 0);
});

test("malformed inputs are skipped and invalid controls never enable memory", () => {
  for (const sessions of [null, {}, "history"]) assert.equal(adapt(sessions).sources.length, 0);
  assert.equal(adapt([null, {}, session({ timeline: null })]).sources.length, 0);
  for (const extra of [{ now: "invalid" }, { now: "" }, { now: "2026-02-30" }, { ownerId: " " }, { memoryEnabled: "false" }]) {
    assert.equal(adapt(undefined, extra).sources.length, 0);
  }
});

test("verification rejects malformed quote fields without treating client data as authenticated", () => {
  const source = adapt().sources[0];
  const evidence = retrieveEvidence([source], options()).evidence[0];
  for (const quote of [null, {}, 123, ""]) assert.equal(verifyEvidence({ ...evidence, quote }, source, options()), false);
  assert.equal(verifyEvidence(null, source, options()), false);
  assert.equal(verifyEvidence({ ...evidence, ageDays: NaN }, source, options()), false);
  assert.equal(verifyEvidence({ ...evidence, reason: "diagnosis" }, source, options()), false);
  assert.equal(verifyEvidence(evidence, { ...source, text: 123 }, options()), false);
  assert.equal(verifyEvidence(evidence, { ...source, ownerId: "other-namespace" }, options()), false);
  // A self-consistent fabricated client source can pass: this is NOT database authentication.
  const fabricated = { ...source, text: "A client-supplied fictional statement." };
  const submitted = { ...evidence, quote: fabricated.text, start: 0, end: fabricated.text.length };
  assert.equal(verifyEvidence(submitted, fabricated, options()), true);
});
