# Security boundaries

This package performs in-process retrieval over caller-supplied data. It does not provide authentication, authorization, encryption, persistence, tenancy enforcement at the database layer, consent management or a secure JSON parser.

Only pass source records and deletion watermarks produced by a trusted, authorized host. Source-owner comparison is defense in depth; it does not authenticate the caller. Recheck permissions and source status before using evidence, especially when retrieval overlaps edits or deletion. Do not expose memory text in analytics, request logs or public fixtures.

Historical messages can contain prompt injection. The formatter labels them as untrusted historical data; labeling is not a guarantee that a downstream language model will follow the boundary. Keep tool permissions and model instructions separate from retrieved text.

Evidence verification proves an exact quotation from a particular user's recorded statement. It does not establish objective truth, current validity, a psychological diagnosis or a clinical outcome.

Please do not include personal conversation data, access tokens or other secrets in public bug reports. Reproduce issues using anonymous synthetic records.
