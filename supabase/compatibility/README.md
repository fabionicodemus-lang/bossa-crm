# Independent HTTP conflict compatibility candidate

`20261022_rpc_http_conflicts.sql` is derived from the public repository definitions
of proposal save and quick status. Apply it only after the existing 13 commercial
migrations in an isolated preview. It does not rewrite those migrations or
authorize production execution, ledger repair or automatic historical replay.

An expected optimistic version mismatch is `PT409` (HTTP 409). `40001` is reserved
for genuine database serialization failures and can trigger transaction retries
in the REST layer. The business message remains `COMMERCIAL_SOURCE_CHANGED`, so
the existing client conflict/recovery handling remains in use.

The candidate rejects unknown bodies, signatures, defaults, execution modes,
search paths or effective browser/service permissions before replacement. It
preserves the owner and ACL, grants no privileges and changes no successful-write
behavior, amounts, installments, evidence, actor, receipt or version checks.
Validate both real HTTP calls and rendered conflict handling; a SQL-only pass
cannot establish how the REST service handles retries. Test uncertain responses
separately from definite version conflicts. No private evidence is stored here.
