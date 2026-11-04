# Independent permission candidates

These files are reviewable security candidates, outside the numbered commercial
migration sequence. They do not authorize production execution or scheduling.

Apply each candidate separately to a disposable copy of the existing baseline.
An absent function signature is an error: do not create a substitute routine or
grant an administrative fallback. Both scripts are transactional and repeatable.

- `20261022_handoff_execute.sql`: the repository caller in
  `src/lib/hybrid-server.ts` uses the server administrative client. Browser users
  have no reason to invoke owner rotation or obtain routing phones directly.
- `20261022_batch_execute.sql`: no direct repository caller was found. External
  consumers and indirect schedules still require inventory before release.
  Restricting EXECUTE does not approve automated contact merging.

The candidates preserve the bodies, defaults, return types and existing owners.
They use SECURITY INVOKER: isolated tests of the existing service caller show
that owner escalation is unnecessary, both before and after the commercial
migrations. PUBLIC, anon and authenticated entry points are removed and the
search path is fixed. Only the existing trusted service integration retains
execution. No additional table or schema privileges are granted. This change
does not settle the inventory of external consumers or the review of remaining
legacy definers.

Validate effective privileges, not only explicit ACL strings: PUBLIC grants can
otherwise make a per-role REVOKE ineffective. Check both candidates before and
after the commercial migrations, repeat them, test service behavior, and verify
that transaction rollback restores the previous isolated state. Recovery must
not silently re-enable unsafe browser execution.

Baseline-derived routine bodies, detailed caller evidence, regression results and
any body correction belong in the private homologation delivery. Do not publish
private catalog exports, dumps or ledger contents here. A legacy batch that
ignores an `ok:false` merge result must not be represented as successful or enabled
merely because its permissions are restricted.

Apply any separately reviewed batch-body correction only after the permission
candidate. It must preserve SECURITY INVOKER, the restricted effective ACL and
the fixed search path, reject an unexpected existing body, and avoid counting an
idempotent replay as a new merge. Test those properties together; CREATE OR
REPLACE must not silently reintroduce SECURITY DEFINER. Unknown consumers remain
unknown until positively inventoried, even when all local tests pass.
