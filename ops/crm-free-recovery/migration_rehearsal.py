#!/usr/bin/env python3
"""Apply reviewed commercial SQL only to the verified, network-isolated clone.

No API, source connection, business RPC invocation, fixture, or browser is used.
The recovery archive and COPY inputs remain the pre-migration baseline. A failed
rehearsal blocks the release, but must not discard an otherwise verified backup.
Only this module's fixed status codes may be printed in public CI logs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import traceback


RELEASE_SHA = "a6607f0a6d40483c5767e8155ff55c95c62fc8fb"
LOCK_SHA256 = "f7acd7643fd2022201ce0c011c22979e70d24e5a38337e285dbbb92f06faf471"
DIAGNOSTIC_PATH = "scripts/commercial/homologation/preflight-source-scope.sql"
DIAGNOSTIC_SHA256 = "66e86b1516f954698d0d1087041d15e25cb90f477380bf18e3c79f9d0e906bfe"
BASELINE_LAST_VERSION = "20261019204456"
MAX_REHEARSAL_SECONDS = 420
LOCAL_DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN")

NEW_TABLES = (
    "commercial_settings", "commercial_opportunities", "commercial_participants",
    "commercial_interests", "commercial_events", "commercial_contracts",
    "commercial_receipts", "commercial_proposal_versions", "commercial_goals",
    "commercial_ranking_settings", "commercial_expenses", "commercial_conversation_reviews",
    "commercial_link_reviews", "commercial_intent_confirmations", "commercial_stage_decisions",
    "commercial_source_requests", "commercial_pending_source_requests",
    "commercial_contact_reconciliations", "commercial_ai_proposal_origins",
    "commercial_ai_proposal_detections",
)

# Effective privileges, including inherited/default grants, are checked. None of
# these checks adds privileges. The link-review service role was not revoked by
# the original migration; its inherited excess privileges are reported separately.
TABLE_ACLS = {name: {"authenticated": {"SELECT", "INSERT", "UPDATE"},
                    "service_role": set(PRIVILEGES)} for name in NEW_TABLES[:12]}
TABLE_ACLS.update({
    "commercial_link_reviews": {"authenticated": {"SELECT", "INSERT", "UPDATE"},
                                "service_role": {"SELECT", "INSERT", "UPDATE"}},
    "commercial_intent_confirmations": {"authenticated": {"SELECT", "INSERT"}, "service_role": {"SELECT"}},
    "commercial_stage_decisions": {"authenticated": {"SELECT", "INSERT"}, "service_role": {"SELECT", "INSERT"}},
    "commercial_source_requests": {"authenticated": {"SELECT", "INSERT"}, "service_role": set()},
    "commercial_pending_source_requests": {"authenticated": {"SELECT", "INSERT", "UPDATE"}, "service_role": set()},
    "commercial_contact_reconciliations": {"authenticated": {"SELECT"}, "service_role": {"SELECT"}},
    "commercial_ai_proposal_origins": {"authenticated": set(), "service_role": {"SELECT", "INSERT", "UPDATE"}},
    "commercial_ai_proposal_detections": {"authenticated": set(), "service_role": {"SELECT", "INSERT"}},
})

# Signature, audience, SECURITY DEFINER, expected search_path. The two reviewed
# reconciliation functions deliberately use DEFINER with explicit human checks.
RPCS = (
    ("public.commercial_create_verified_intent(uuid,text,uuid,uuid,text,text,text,timestamptz,boolean)", "human", False, "public"),
    ("public.commercial_replay_source_request(uuid,uuid,text,jsonb)", "human", False, "public"),
    ("public.commercial_save_proposal_once(uuid,uuid,jsonb,jsonb,uuid,timestamptz)", "human", False, "public"),
    ("public.commercial_create_agenda_once(uuid,uuid,jsonb)", "human", False, "public"),
    ("public.commercial_prepare_source_request(uuid,uuid,text,jsonb)", "human", False, "public"),
    ("public.commercial_get_source_recovery(uuid,uuid)", "human", False, "public"),
    ("public.commercial_finish_source_recovery(uuid,uuid,text)", "human", False, "public"),
    ("public.commercial_propose_contact_reconciliation(uuid,uuid,uuid,uuid,text,text)", "human", True, "pg_catalog, public, pg_temp"),
    ("public.commercial_review_contact_reconciliation(uuid,uuid,boolean,text)", "human", True, "pg_catalog, public, pg_temp"),
    ("public.commercial_proposal_status_once(uuid,uuid,uuid,timestamptz,integer,text)", "human", False, "public"),
    ("public.commercial_record_detected_proposal(uuid,uuid,text,jsonb,jsonb)", "service", False, "public"),
    ("public.commercial_merge_preflight(uuid,uuid)", "service", False, "public"),
    ("public.merge_duplicate_lead(uuid,uuid)", "service", False, "public"),
)
COMPAT_SIGNATURES = (RPCS[2][0], RPCS[9][0])
LEGACY_MERGE = "public.merge_duplicate_lead(uuid,uuid)"
PRIVATE_MERGE = "private.commercial_legacy_merge_duplicate_lead(uuid,uuid)"
HANDOFF = "public.next_client_handoff_owner(uuid,uuid)"
BATCH = "public.merge_duplicate_leads_batch(integer)"

REQUIRED_TRIGGERS = (
    ("proposals", "commercial_00_source_scope", "commercial_source_scope_guard"),
    ("proposal_payment_items", "commercial_00_source_scope", "commercial_source_scope_guard"),
    ("agenda_events", "commercial_00_source_scope", "commercial_source_scope_guard"),
    ("leads", "commercial_identity_guard", "commercial_protect_contact_identity"),
    ("proposals", "commercial_00_source_identity", "commercial_protect_source_identity"),
    ("agenda_events", "commercial_00_source_identity", "commercial_protect_source_identity"),
    ("messages", "commercial_communication_identity", "commercial_protect_communication_identity"),
    ("whatsapp_messages", "commercial_communication_identity", "commercial_protect_communication_identity"),
    ("whatsapp_conversations", "commercial_communication_identity", "commercial_protect_communication_identity"),
    ("commercial_events", "commercial_events_immutable", "commercial_immutable"),
    ("commercial_proposal_versions", "commercial_versions_immutable", "commercial_immutable"),
    ("commercial_receipts", "commercial_receipts_immutable", "commercial_immutable"),
    ("commercial_source_requests", "commercial_requests_immutable", "commercial_immutable"),
    ("commercial_stage_decisions", "commercial_stage_decisions_immutable", "commercial_immutable"),
    ("commercial_ai_proposal_detections", "commercial_ai_proposal_detections_immutable", "commercial_immutable"),
)


class RehearsalFailure(Exception):
    """Only fixed, source-independent codes are passed to this exception."""


class BaselineProtectionFailure(Exception):
    """Fatal: never publish an archive if its verified baseline has changed."""


def require(condition, code):
    if not condition:
        raise RehearsalFailure(code)


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sql_literal(value):
    # Every connection explicitly sets standard_conforming_strings=on.
    return "'" + str(value).replace("'", "''") + "'"


def sql_array(values):
    return "ARRAY[" + ",".join(sql_literal(v) for v in values) + "]::text[]"


def private_json(path, value):
    with Path(path).open("w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, ensure_ascii=True)
        stream.write("\n")
    Path(path).chmod(0o600)


def validate_inputs(release_root, lock_path):
    """Validate the public code-only lock, then the exact approved file bytes."""
    release_root = Path(release_root).resolve(strict=True)
    lock_bytes = Path(lock_path).read_bytes()
    require(sha_bytes(lock_bytes) == LOCK_SHA256, "code_lock_checksum_mismatch")
    lock = json.loads(lock_bytes)
    require(lock["approved_release_commit"] == RELEASE_SHA, "release_commit_mismatch")
    entries = lock["migrations"]
    require(len(entries) == 13, "migration_count_mismatch")
    require([m["order"] for m in entries] == list(range(1, 14)), "migration_order_mismatch")
    versions = [m["version"] for m in entries]
    require(versions == sorted(set(versions)), "migration_versions_invalid")
    verified = []
    for item in entries + [lock["compatibility"]]:
        relative = Path(item["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "sql_path_invalid")
        path = release_root / relative
        require(path.resolve(strict=True).is_relative_to(release_root) and not path.is_symlink(), "sql_path_escape")
        data = path.read_bytes()
        require(len(data) == item["bytes"] and sha_bytes(data) == item["sha256"], "approved_sql_checksum_mismatch")
        text = data.decode("utf-8")
        require("\x00" not in text and not re.search(r"(?m)^\s*\\", text), "unexpected_psql_metacommand")
        # Reviewed files have their own BEGIN/COMMIT. They are executed intact,
        # not wrapped with --single-transaction or edited to insert a ledger row.
        require(re.search(r"(?im)^begin;\s*$", text) and re.search(r"(?im)^commit;\s*$", text), "sql_transaction_envelope_missing")
        if "version" in item:
            expected = f"supabase/migrations/{item['version']}_{item['name']}.sql"
            require(item["path"] == expected, "migration_filename_mismatch")
        verified.append((item, data))
    diagnostic = (release_root / DIAGNOSTIC_PATH).read_bytes()
    require(sha_bytes(diagnostic) == DIAGNOSTIC_SHA256, "diagnostic_checksum_mismatch")
    return lock, verified[:13], verified[13], diagnostic


LEDGER_SQL = """
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'version',version::text,'name',name,'row_md5',md5(to_jsonb(t)::text),
 'statement_count',cardinality(statements),
 'statement_md5',CASE WHEN cardinality(statements)=1 THEN md5(statements[1]) END
) ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations t;
"""

CONFIG_SQL = """
SELECT jsonb_build_object(
 'database',current_database(),'user',current_user,
 'version',current_setting('server_version_num'),
 'listen',current_setting('listen_addresses'),
 'cron',current_setting('cron.launch_active_jobs',true),
 'preload',current_setting('shared_preload_libraries'),
 'replication_role',current_setting('session_replication_role'),
 'row_security',current_setting('row_security'),
 'read_only',current_setting('transaction_read_only'),
 'browser_roles',(SELECT jsonb_agg(jsonb_build_object('role',rolname,
   'superuser',rolsuper,'bypass_rls',rolbypassrls) ORDER BY rolname)
   FROM pg_roles WHERE rolname IN ('anon','authenticated')),
 'private_usage',jsonb_build_object(
   'authenticated',has_schema_privilege('authenticated','private','USAGE'),
   'service_role',has_schema_privilege('service_role','private','USAGE')));
"""

TABLE_NAMES_SQL = """SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p');"""

LEDGER_SHAPE_SQL = """SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull AND ad.oid IS NULL AND a.attidentity='') ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
   WHERE a.attrelid='supabase_migrations.schema_migrations'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'version_unique',EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a
   ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
   WHERE i.indrelid='supabase_migrations.schema_migrations'::regclass
   AND i.indisunique AND i.indisvalid AND i.indnatts=1 AND a.attname='version'));
"""


def routines_sql(signatures):
    return """SELECT jsonb_object_agg(s.signature,jsonb_build_object(
 'present',p.oid IS NOT NULL,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'definer',p.prosecdef,'config',p.proconfig,'args',pg_get_function_arguments(p.oid),
 'result',pg_get_function_result(p.oid),'body',p.prosrc,'body_md5',md5(p.prosrc),
 'acl',(SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(p.proacl) x),
 'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
 'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')))
 FROM unnest(""" + sql_array(signatures) + """ ) s(signature)
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature);"""


def table_security_sql():
    return """SELECT jsonb_object_agg(c.relname,jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'privileges',(SELECT jsonb_object_agg(r.role,(SELECT coalesce(jsonb_agg(v.priv ORDER BY v.priv),'[]'::jsonb)
    FROM unnest(""" + sql_array(PRIVILEGES) + """ ) v(priv)
    WHERE has_table_privilege(r.role,c.oid,v.priv)))
    FROM unnest(ARRAY['anon','authenticated','service_role']) r(role)),
 'public_privileges',(SELECT coalesce(jsonb_agg(a.privilege_type ORDER BY a.privilege_type),'[]'::jsonb)
    FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
    'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END)
      FROM unnest(p.polroles) r),
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid)))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(""" + sql_array(NEW_TABLES) + ");"


TRIGGERS_SQL = """SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
 'enabled',t.tgenabled,'function_schema',fn.nspname,'function',p.proname) ORDER BY c.relname,t.tgname),'[]'::jsonb)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname LIKE 'commercial_%';"""

DEFAULTS_SQL = """SELECT coalesce(jsonb_object_agg(a.attname,jsonb_build_object(
 'notnull',a.attnotnull,'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid))),'{}'::jsonb)
 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.commercial_settings'::regclass
 AND a.attname IN ('auto_link_enabled','auto_stage_enabled') AND NOT a.attisdropped;"""


def clean_routines(rows):
    return {signature: {**{k: v for k, v in row.items() if k != "body"},
                        "body_sha256": sha_bytes((row.get("body") or "").encode())}
            for signature, row in rows.items()}


def assert_fresh_ledger(rows, versions):
    require(len(rows) == 47, "baseline_ledger_count_changed")
    require(len({x["version"] for x in rows}) == len(rows), "baseline_ledger_duplicate")
    require(max(x["version"] for x in rows) == BASELINE_LAST_VERSION, "baseline_ledger_tip_changed")
    require(not {x["version"] for x in rows}.intersection(versions), "pending_version_already_recorded")


def ledger_insert_sql(item, original_bytes):
    # Each unchanged original file commits itself. This separate clone-only
    # transaction follows that success. There is deliberately no UPSERT, repair,
    # skip, invented historical SQL, or compatibility row in the migration ledger.
    return ("BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE;\n"
            "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (" +
            sql_literal(item["version"]) + "," + sql_literal(item["name"]) + ",ARRAY[" +
            sql_literal(original_bytes.decode("utf-8")) + "]::text[]);\nCOMMIT;\n")


class Rehearsal:
    def __init__(self, recovery, release_root, lock_path):
        self.recovery = recovery
        self.release_root = Path(release_root)
        self.lock_path = Path(lock_path)
        self.output = Path(recovery.payload) / "migration-rehearsal"
        self.output.mkdir(mode=0o700, exist_ok=False)
        self.protected = {}
        self.protection_ready = False
        self.started = time.monotonic()
        self.stage = "input_validation"
        self.report = {
            "status": "NOT_COMPLETED", "approved_release_commit": RELEASE_SHA,
            "source_connection_used": False, "business_rpc_invocations": 0,
            "fixtures_created": False, "production_modified": False,
            "human_acceptance": {"approved": 2, "total": 8, "changed": False},
            "functional_macroitems": {"verified": 12, "total": 24, "changed": False},
            "baseline_is_recovery_artifact": True, "baseline_unchanged": None,
            "migrations": [], "gates": [], "warnings": [],
            "unverified": ["Real PostgREST HTTP 409", "Rendered conflict/recovery flow", "Remote JWT/RLS sessions"],
            "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    def command(self, args, *, data=None, tag, timeout=180):
        # Local Docker socket only; no inherited PAT, DB password or API token.
        environment = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
        remaining = MAX_REHEARSAL_SECONDS - (time.monotonic() - self.started)
        require(remaining > 5, "rehearsal_deadline")
        with (self.output / (tag + ".stderr.log")).open("wb") as err:
            result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=err,
                                    env=environment, timeout=min(timeout, remaining))
        (self.output / (tag + ".stdout.log")).write_bytes(result.stdout)
        if result.returncode:
            if tag == "compatibility" and b"UNREVIEWED_CONFLICT_RPC" in (self.output / (tag + ".stderr.log")).read_bytes():
                raise RehearsalFailure("compatibility_guard_rejected_definition")
            raise RehearsalFailure("isolated_sql_or_command_failed")
        return result.stdout

    def sql(self, sql, *, tag, read_only=False):
        if isinstance(sql, str):
            sql = sql.encode("utf-8")
        # Bootstrap sets the superuser-only replication GUC, then drops to the
        # restored postgres role before the reviewed file. CREATE ownership and
        # default privileges therefore follow postgres, not supabase_admin.
        # No application RPC receives any admin/service fallback.
        header = ("SET statement_timeout='120s'; SET lock_timeout='10s'; "
                  "SET idle_in_transaction_session_timeout='180s'; "
                  "SET session_replication_role=origin; SET row_security=on; "
                  "SET standard_conforming_strings=on; SET timezone='UTC'; "
                  "SET ROLE postgres; "
                  "SET search_path=" + ("pg_catalog" if read_only else "public") + ";\n").encode()
        if read_only:
            sql = b"BEGIN READ ONLY;\n" + sql + b"\nCOMMIT;\n"
        command = LOCAL_DOCKER + ["exec", "--interactive", "--user", "postgres",
            "--env", "PGAPPNAME=bossa-offline-migration-rehearsal",
            "--env", "PGOPTIONS=-c session_replication_role=origin -c row_security=on",
            self.recovery.container, "psql", "-X", "-qAt", "--no-password", "--field-separator=\t",
            "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"]
        return self.command(command, data=header + sql, tag=tag)

    def query(self, sql, *, tag):
        return json.loads(self.sql(sql, tag=tag, read_only=True))

    def check(self, code, condition):
        self.report["gates"].append({"code": code, "passed": bool(condition)})

    def guard_baseline_and_isolation(self):
        r = self.recovery
        require(r.manifest.get("state") == "RESTORE_VERIFIED", "verified_baseline_required")
        require(r.source is None, "source_session_must_be_closed")
        require(re.fullmatch(r"crm-recovery-[0-9a-f]{16}", r.container), "unexpected_restore_container")
        require(r.manifest.get("network_none") is True and r.manifest.get("cron_launch_active_jobs") == "off"
                and r.manifest.get("pg_net_preloaded") is False, "restore_isolation_evidence_required")
        info = json.loads(self.command(LOCAL_DOCKER + ["inspect", r.container], tag="container-inspect", timeout=30))[0]
        require(info["State"]["Running"] and info["HostConfig"]["NetworkMode"] == "none"
                and not info["HostConfig"].get("PortBindings"), "container_not_network_isolated")
        require(info["Config"]["Image"] == r.image, "restore_image_mismatch")
        payload_mount = [m for m in info["Mounts"] if m["Destination"] == "/payload"]
        require(len(payload_mount) == 1 and not payload_mount[0]["RW"]
                and Path(payload_mount[0]["Source"]).resolve() == Path(r.payload).resolve(), "baseline_mount_not_read_only")
        require(not any("docker.sock" in str(m.get("Source", "")) for m in info["Mounts"]), "unsafe_container_mount")
        required_files = {"database.dump"}
        for copy in r.copies:
            required_files.add(copy["file"])
            required_files.add(copy.get("fingerprint_file", copy["file"]))
        base = Path(r.payload).resolve()
        # Cover the complete existing baseline: DB, native COPY, Storage bytes,
        # catalog/role/security metadata, Vault recovery key and support files.
        # Existing session logs may grow; the new rehearsal directory is separate.
        files = {str(p.relative_to(base)) for p in base.rglob("*") if p.is_file()
                 and p.relative_to(base).parts[0] not in ("private-logs", "migration-rehearsal")}
        require(required_files <= files, "baseline_recovery_file_missing")
        for relative in sorted(files):
            path = base / relative
            require(path.resolve(strict=True).is_relative_to(base) and not path.is_symlink(), "baseline_file_path_invalid")
            self.protected[relative] = sha_file(path)
        for copy in r.copies:
            require(self.protected[copy.get("fingerprint_file", copy["file"])] == copy["sha256"], "baseline_copy_hash_mismatch")
        self.protection_ready = True
        self.report["baseline_protection_scope"] = "All pre-existing payload files except active private logs and this rehearsal directory"
        config = self.query(CONFIG_SQL, tag="baseline-configuration")
        require(config["database"] == "postgres" and config["user"] == "postgres"
                and config["version"] == "170006" and config["listen"] == ""
                and config["cron"] == "off" and "pg_net" not in config["preload"]
                and config["replication_role"] == "origin" and config["row_security"] == "on"
                and config["read_only"] == "on", "isolated_database_configuration_mismatch")
        require(len(config["browser_roles"] or []) == 2 and all(not x["superuser"] and not x["bypass_rls"]
                for x in config["browser_roles"]), "browser_role_bypass_detected")
        self.report["configuration_before"] = config

    def baseline_metadata(self, entries):
        before = self.query(TABLE_NAMES_SQL, tag="baseline-public-tables")
        require(len(before) == 57 and not set(before).intersection(NEW_TABLES), "baseline_table_set_changed")
        shape = self.query(LEDGER_SHAPE_SQL, tag="baseline-ledger-shape")
        types = {c["name"]: c["type"] for c in shape["columns"]}
        require(types.get("version") == "text" and types.get("name") == "text"
                and types.get("statements") == "text[]" and shape["version_unique"], "unsupported_clone_ledger_shape")
        require(not any(c["required"] and c["name"] not in ("version", "name", "statements")
                        for c in shape["columns"]), "additional_required_ledger_column")
        ledger = self.query(LEDGER_SQL, tag="baseline-ledger-fingerprints")
        assert_fresh_ledger(ledger, [x["version"] for x, _ in entries])
        legacy = self.query(routines_sql([LEGACY_MERGE, HANDOFF, BATCH]), tag="baseline-legacy-routines")
        require(all(x["present"] for x in legacy.values()), "baseline_legacy_dependency_missing")
        self.report["baseline"] = {"public_tables": before, "ledger": ledger, "legacy_routines": clean_routines(legacy)}
        return before, ledger, legacy

    def apply_migrations(self, entries):
        for item, original in entries:
            self.stage = "migration_" + str(item["order"])
            receipt = {k: item[k] for k in ("order", "version", "name", "path", "sha256", "bytes")}
            receipt["status"] = "STARTED"
            self.report["migrations"].append(receipt)
            # Preserve every byte of the original transaction, including its
            # BEGIN/COMMIT. Do not disable validation triggers for this rehearsal.
            try:
                self.sql(original, tag=f"migration-{item['order']:02d}")
            except Exception:
                receipt["status"] = "COMMIT_UNCONFIRMED"
                raise
            receipt["status"] = "SQL_COMMITTED_LEDGER_PENDING"
            try:
                self.sql(ledger_insert_sql(item, original), tag=f"ledger-{item['order']:02d}")
            except Exception:
                receipt["status"] = "SQL_COMMITTED_LEDGER_UNCONFIRMED"
                raise
            receipt["status"] = "APPLIED_AND_RECORDED_IN_CLONE"
        self.report["ledger_semantics"] = {
            "historical_baseline_migrations_replayed": False,
            "original_13_migrations_applied_once": True,
            "clone_records_added": 13,
            "source_ledger_changed": False,
            "recorded_statements": "One exact original UTF-8 file in each statements text[] entry",
            "atomicity": "Original SQL transaction commits before its separate clone ledger transaction",
            "retry_policy": "Never resume or UPSERT a partially migrated clone; restore a fresh verified baseline",
            "compatibility_ledger_row": False,
        }

    def apply_compatibility(self, compatibility):
        self.stage = "compatibility"
        item, data = compatibility
        before = self.query(routines_sql(COMPAT_SIGNATURES), tag="compatibility-before")
        for row in before.values():
            require(row["present"] and row["body"].count("errcode='40001'") == 1, "unexpected_pre_compatibility_body")
        self.sql(data, tag="compatibility")
        after = self.query(routines_sql(COMPAT_SIGNATURES), tag="compatibility-after")
        for signature in COMPAT_SIGNATURES:
            old, new = before[signature], after[signature]
            self.check("compatibility_only_sqlstate_" + str(COMPAT_SIGNATURES.index(signature) + 1),
                       new["body"] == old["body"].replace("errcode='40001'", "errcode='PT409'"))
            metadata_keys = set(old) - {"body", "body_md5"}
            self.check("compatibility_metadata_preserved_" + str(COMPAT_SIGNATURES.index(signature) + 1),
                       all(old[k] == new[k] for k in metadata_keys))
        self.report["compatibility"] = {**item, "applied_once_in_clone": True, "guard_preserved": True,
            "before": clean_routines(before), "after": clean_routines(after),
            "http_409_verified": False,
            "replay_note": "The original guard allows only the reviewed original or replacement body; no guard is removed or bypassed."}

    def metadata_gates(self, before_tables, before_ledger, legacy, entries, diagnostic):
        self.stage = "read_only_schema_acl_rpc_gates"
        after_tables = self.query(TABLE_NAMES_SQL, tag="after-public-tables")
        self.check("exact_public_table_delta_20", set(after_tables) == set(before_tables) | set(NEW_TABLES)
                   and len(after_tables) == 77)
        after_ledger = self.query(LEDGER_SQL, tag="after-ledger-fingerprints")
        indexed = {row["version"]: row for row in after_ledger}
        self.check("original_ledger_rows_unchanged", all(indexed.get(row["version"]) == row for row in before_ledger))
        self.check("exact_ledger_delta_13", len(after_ledger) == len(before_ledger) + 13
                   and set(indexed) == {r["version"] for r in before_ledger} | {i["version"] for i, _ in entries})
        self.check("new_ledger_original_sql", all(indexed.get(item["version"], {}).get("name") == item["name"]
            and indexed[item["version"]]["statement_count"] == 1
            and indexed[item["version"]]["statement_md5"] == hashlib.md5(data).hexdigest()
            for item, data in entries))
        self.report["ledger_after"] = after_ledger
        tables = self.query(table_security_sql(), tag="after-table-security")
        self.report["table_security"] = tables
        self.check("all_new_tables_present", set(tables) == set(NEW_TABLES))
        for name, expectations in TABLE_ACLS.items():
            row = tables.get(name, {})
            self.check("rls_and_owner_" + name, row.get("rls") is True and row.get("owner") == "postgres")
            actual = row.get("privileges", {})
            self.check("no_anonymous_or_public_table_grant_" + name,
                       actual.get("anon") == [] and row.get("public_privileges") == [])
            for role, expected in expectations.items():
                granted = set(actual.get(role, []))
                if name == "commercial_link_reviews" and role == "service_role":
                    self.check("required_service_table_grants_" + name, expected <= granted)
                    if granted - expected:
                        self.report["warnings"].append({"code": "link_review_inherited_service_grants", "extra": sorted(granted - expected)})
                else:
                    self.check("table_grants_" + role + "_" + name, granted == expected)
            policies = row.get("policies", [])
            human_table = name not in ("commercial_ai_proposal_origins", "commercial_ai_proposal_detections")
            self.check("organization_policy_boundary_" + name,
                (not policies if not human_table else bool(policies) and all(
                    p["roles"] == ["authenticated"] and "organization_id" in ((p["using"] or "") + (p["check"] or ""))
                    for p in policies)))
        signatures = [x[0] for x in RPCS] + [PRIVATE_MERGE, HANDOFF, BATCH]
        routines = self.query(routines_sql(signatures), tag="after-rpc-security")
        self.report["rpc_security"] = clean_routines(routines)
        for signature, audience, definer, search_path in RPCS:
            row = routines[signature]
            self.check("rpc_contract_" + signature,
                row["present"] and row["owner"] == "postgres" and row["definer"] is definer
                and row["config"] == ["search_path=" + search_path] and not row["public_execute"] and not row["anon"]
                and row["authenticated"] is (audience == "human") and row["service_role"] is (audience == "service"))
        old, moved = legacy[LEGACY_MERGE], routines[PRIVATE_MERGE]
        self.check("legacy_merge_exact_body_preserved", moved["present"] and old["body"] == moved["body"]
                   and all(old[k] == moved[k] for k in ("owner", "args", "result", "definer", "config")))
        self.check("private_legacy_service_only", not moved["public_execute"] and not moved["anon"]
                   and not moved["authenticated"] and moved["service_role"])
        handoff = routines[HANDOFF]
        self.check("handoff_body_preserved_and_service_only", handoff["body"] == legacy[HANDOFF]["body"]
            and not handoff["public_execute"] and not handoff["anon"] and not handoff["authenticated"] and handoff["service_role"]
            and handoff["config"] == ["search_path=pg_catalog, public, pg_temp"]
            and handoff["definer"] == legacy[HANDOFF]["definer"])
        self.check("legacy_batch_untouched", routines[BATCH] == legacy[BATCH])
        if routines[BATCH]["anon"] or routines[BATCH]["authenticated"]:
            self.report["warnings"].append({"code": "pre_existing_legacy_batch_browser_execute", "invoked": False,
                                           "separate_security_release_required": True})
        config = self.query(CONFIG_SQL, tag="after-configuration")
        self.check("private_schema_usage_for_required_callers", config["private_usage"] == {"authenticated": True, "service_role": True})
        self.check("no_automation_reenabled", config["cron"] == "off" and "pg_net" not in config["preload"] and config["listen"] == "")
        self.report["configuration_after"] = config
        defaults = self.query(DEFAULTS_SQL, tag="after-feature-defaults")
        self.check("automatic_features_default_off", set(defaults) == {"auto_link_enabled", "auto_stage_enabled"}
                   and all(x == {"notnull": True, "type": "boolean", "default": "false"} for x in defaults.values()))
        triggers = self.query(TRIGGERS_SQL, tag="after-guard-triggers")
        active = {(t["table"], t["name"], t["function"]) for t in triggers
                  if t["enabled"] == "O" and t["function_schema"] == "public"}
        self.check("required_integrity_triggers_active", set(REQUIRED_TRIGGERS) <= active)
        self.report["guard_triggers"] = triggers
        counts = self.sql(diagnostic, tag="source-scope-counts", read_only=True).decode().splitlines()
        violations = []
        for line in counts:
            relation, reason, count = line.split("\t")
            require(relation in ("proposals", "proposal_payment_items", "agenda_events")
                    and re.fullmatch(r"[a-z_]+", reason) and count.isdigit(), "unexpected_diagnostic_output")
            violations.append({"relation": relation, "reason": reason, "count": int(count)})
        self.report["source_scope_violation_counts"] = violations
        self.check("existing_source_references_valid", not any(v["count"] for v in violations))

    def execute(self):
        lock, entries, compatibility, diagnostic = validate_inputs(self.release_root, self.lock_path)
        # This private runtime copy has code metadata only. The full review
        # manifest and baseline catalog are never added to the public checkout.
        (self.output / "input-lock.json").write_bytes(self.lock_path.read_bytes())
        self.report["code_lock_sha256"] = LOCK_SHA256
        self.stage = "baseline_and_isolation"
        self.guard_baseline_and_isolation()
        self.stage = "baseline_metadata"
        tables, ledger, legacy = self.baseline_metadata(entries)
        self.apply_migrations(entries)
        self.apply_compatibility(compatibility)
        self.metadata_gates(tables, ledger, legacy, entries, diagnostic)
        self.report["status"] = ("PASSED_SCHEMA_ACL_AND_COMPATIBILITY_GATES"
                                  if all(x["passed"] for x in self.report["gates"]) else "FAILED_RELEASE_GATES")

    def finish(self):
        if self.protection_ready:
            try:
                unchanged = all(sha_file(Path(self.recovery.payload) / relative) == digest
                                for relative, digest in self.protected.items())
            except OSError:
                unchanged = False
            self.report["baseline_unchanged"] = unchanged
            self.report["baseline_files_sha256"] = self.protected
            if not unchanged:
                self.report["status"] = "BASELINE_PROTECTION_FAILED"
        self.report["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        private_json(self.output / "report.json", self.report)
        summary = {"status": self.report["status"], "baseline_unchanged": self.report["baseline_unchanged"],
                   "sql_committed": sum(x["status"] in ("SQL_COMMITTED_LEDGER_PENDING", "SQL_COMMITTED_LEDGER_UNCONFIRMED", "APPLIED_AND_RECORDED_IN_CLONE") for x in self.report["migrations"]),
                   "ledger_recorded": sum(x["status"] == "APPLIED_AND_RECORDED_IN_CLONE" for x in self.report["migrations"]),
                   "report": "migration-rehearsal/report.json", "http_409_verified": False,
                   "human_acceptance_changed": False}
        self.recovery.manifest["migration_rehearsal"] = summary
        if self.report["baseline_unchanged"] is False:
            raise BaselineProtectionFailure("verified_baseline_changed")
        return summary


def run_rehearsal(recovery, *, release_root, lock_path=None):
    """Call after verify() and before encrypt(); return a separate rehearsal status.

    Failures of SQL/gates are retained privately and do not downgrade or discard
    RESTORE_VERIFIED. A changed baseline archive is fatal because it invalidates
    the recovery evidence. No production-readiness or human acceptance is claimed.
    """
    if lock_path is None:
        lock_path = Path(__file__).with_name("migration-rehearsal-lock.json")
    rehearsal = Rehearsal(recovery, release_root, lock_path)
    print("STAGE=ISOLATED_COMMERCIAL_MIGRATION_REHEARSAL", flush=True)
    try:
        rehearsal.execute()
    except Exception as exc:
        rehearsal.report["status"] = "FAILED_RELEASE_GATES"
        rehearsal.report["failure_stage"] = rehearsal.stage
        rehearsal.report["failure_code"] = str(exc) if isinstance(exc, RehearsalFailure) else "unexpected_rehearsal_failure"
        (rehearsal.output / "failure.private.txt").write_text(traceback.format_exc())
    result = rehearsal.finish()
    print("MIGRATION_REHEARSAL=" + result["status"], flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description="Offline validation only; execution is integrated after Recovery.verify().")
    parser.add_argument("--validate-inputs", action="store_true", required=True)
    parser.add_argument("--release-root", type=Path, required=True)
    parser.add_argument("--lock-path", type=Path, default=Path(__file__).with_name("migration-rehearsal-lock.json"))
    args = parser.parse_args()
    validate_inputs(args.release_root, args.lock_path)
    print(json.dumps({"status": "INPUT_BYTES_VERIFIED", "release_sha": RELEASE_SHA,
                      "migration_count": 13, "compatibility_count": 1,
                      "database_accessed": False, "lock_sha256": LOCK_SHA256}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
