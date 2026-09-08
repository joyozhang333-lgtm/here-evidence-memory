# Security boundaries

This package performs in-process retrieval over caller-supplied data. It does not provide authentication, authorization, encryption, persistence, tenancy enforcement at the database layer, consent management or a secure JSON parser.

Only pass source records and deletion watermarks produced by a trusted, authorized host. Source-owner comparison is defense in depth; it does not authenticate the caller. Recheck permissions and source status before using evidence, especially when retrieval overlaps edits or deletion. Do not expose memory text in analytics, request logs or public fixtures.

Historical messages can contain prompt injection. The formatter labels them as untrusted historical data; labeling is not a guarantee that a downstream language model will follow the boundary. Keep tool permissions and model instructions separate from retrieved text.

Evidence verification checks an exact quotation against the supplied record. If the server receives both a source and quote from a client, verification is only internal consistency: a client can fabricate both. It does not authenticate database provenance, the caller, ownership, timestamps or deletion state. Validate request schemas and bound input lengths and counts separately. It does not establish objective truth, current validity, a psychological diagnosis or a clinical outcome.

Local session adaptation never reads localStorage or IndexedDB itself. The host must persist pause state, deletion watermarks and source exclusions, and recheck them with the latest source records before use. Persistent epochs must reject late replies and stale cache writes, including across tabs. Resuming memory must not reset exclusions; pausing alone does not permanently exclude messages written during the pause. Keep all memory-derived data out of shared cards using an explicit allowlist, not a blacklist. This library cannot enforce host storage or sharing behavior.

Session-date precision is a UTC session date anchor, not an exact observation time. Do not upgrade old records to precise timestamps or alter IDs to bypass exclusions. Diagnostic records contain only reason codes and input indexes, not original text or exception messages; they still should not be treated as a substitute for access-controlled auditing.

Please do not include personal conversation data, access tokens or other secrets in public bug reports. Reproduce issues using anonymous synthetic records.
