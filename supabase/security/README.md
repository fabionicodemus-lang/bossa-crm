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
They retain the existing SECURITY DEFINER setting to avoid combining a permission
release with unverified execution-context changes, while removing PUBLIC, anon
and authenticated entry points and fixing the search path. Only the existing
trusted service integration retains execution. No additional table or schema
privileges are granted. A review of remaining legacy definers is still required.

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
