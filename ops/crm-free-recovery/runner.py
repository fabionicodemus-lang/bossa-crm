#!/usr/bin/env python3
"""One-shot recovery rehearsal. NOT EXECUTED against the CRM during preparation.

All detailed output, source rows, keys, catalogs and object names stay under a
private temporary directory. Only fixed stage/error codes reach public stdout.
The source SQL connection is read-only. API creation of a short-lived login role
is the one intentional source-side credential mutation and requires approval.
"""

from __future__ import annotations

import hashlib
import gzip
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request


PROJECT = "oridhneerxutcjsvwuju"
REPOSITORY = "fabionicodemus-lang/bossa-crm"
BRANCH = "refs/heads/ops/crm-free-recovery-20261029"
EXPECTED_VERSION = "17.6"
SUPABASE_CA_URL = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt"
SUPABASE_CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
EXPECTED_EXTENSIONS = {
    "btree_gist": "1.7", "pg_cron": "1.6.4", "pg_net": "0.20.4",
    "pg_stat_statements": "1.11", "pgcrypto": "1.3", "plpgsql": "1.0",
    "supabase_vault": "0.3.1", "uuid-ossp": "1.1",
}
MAX_SECONDS = 2400
NO_REDIRECT = type("NoRedirect", (urllib.request.HTTPRedirectHandler,), {
    "redirect_request": lambda self, req, fp, code, msg, headers, newurl: None
})
HTTP = urllib.request.build_opener(NO_REDIRECT())


class GateFailure(Exception):
    pass


def gate(condition, code):
    if not condition:
        raise GateFailure(code)


def ident(value):
    return '"' + str(value).replace('"', '""') + '"'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def qualified(schema, name):
    return ident(schema) + "." + ident(name)


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def dump_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def stage(value):
    # Values passed here are fixed program constants, never source-derived data.
    print("STAGE=" + value, flush=True)


class Psql:
    """Persistent psql, including a snapshot keeper; output is never echoed."""

    def __init__(self, command, env, log, timeout=300):
        self.log_path = Path(log)
        self.log_handle = open(log, "ab")
        # PostgreSQL's sqlstate verbosity suppresses error text and context.
        # Even the private stderr file is not copied to the public run log.
        self.proc = subprocess.Popen(command + ["-v", "VERBOSITY=sqlstate"], env=env, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=self.log_handle)
        self.timeout = timeout
        self.buffer = b""
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.proc.stdout, selectors.EVENT_READ)

    def failed(self):
        self.log_handle.flush()
        states = re.findall(rb"(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b", self.log_path.read_bytes())
        suffix = "_" + states[-1].decode("ascii") if states else ""
        raise GateFailure("sql_process_failed" + suffix)

    def query(self, sql):
        marker = ("CRM_END_" + secrets.token_hex(24)).encode()
        # Only JSON scalar results or command statuses are read here. Table
        # bytes use psql \copy to a private file, never this marker channel.
        self.proc.stdin.write((sql.rstrip() + "\n\\echo ").encode() + marker + b"\n")
        self.proc.stdin.flush()
        result = []
        deadline = time.monotonic() + self.timeout
        while True:
            while b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                if line.rstrip(b"\r") == marker:
                    return b"\n".join(result).decode("utf-8")
                if line:
                    result.append(line)
            left = deadline - time.monotonic()
            gate(left > 0, "sql_timeout")
            if not self.selector.select(min(left, 10)):
                if self.proc.poll() is not None:
                    self.failed()
                continue
            part = os.read(self.proc.stdout.fileno(), 65536)
            if not part:
                self.failed()
            self.buffer += part

    def json(self, sql):
        return json.loads(self.query(sql))

    def close(self):
        try:
            if self.proc.poll() is None:
                self.proc.stdin.write(b"\\q\n")
                self.proc.stdin.flush()
                self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
            self.proc.wait(timeout=10)
        self.selector.close()
        self.log_handle.close()


SCHEMAS_SQL = """
SELECT coalesce(json_agg(t ORDER BY name), '[]'::json) FROM (
 SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner,
        (SELECT json_agg(a::text ORDER BY a::text) FROM unnest(n.nspacl) a) acl,
        e.extname AS extension
 FROM pg_namespace n
 LEFT JOIN pg_depend d ON d.classid='pg_namespace'::regclass AND d.objid=n.oid
   AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
 LEFT JOIN pg_extension e ON e.oid=d.refobjid
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
) t;
"""

TABLES_SQL = """
SELECT coalesce(json_agg(t ORDER BY schema, name), '[]'::json) FROM (
 SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind,
 c.relpersistence::text AS persistence, pg_get_userbyid(c.relowner) AS owner,
 c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
 (SELECT json_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a) AS acl,
 c.reloptions, e.extname AS extension,
 EXISTS (SELECT FROM pg_extension x WHERE c.oid=ANY(x.extconfig)) AS extconfig,
 EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0
         AND NOT a.attisdropped AND a.attgenerated<>'') AS has_generated,
 (SELECT json_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a
  WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND a.attgenerated='') AS copy_columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
   AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
 LEFT JOIN pg_extension e ON e.oid=d.refobjid
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND c.relkind IN ('r','p','m','v','S','f')
) t;
"""

POLICIES_SQL = """
SELECT coalesce(json_agg(t ORDER BY schema, tablename, name), '[]'::json) FROM (
 SELECT n.nspname AS schema, c.relname AS tablename, p.polname AS name,
 p.polpermissive AS permissive, p.polcmd::text AS command,
 (SELECT json_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
                 ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END)
  FROM unnest(p.polroles) r) AS roles,
 pg_get_expr(p.polqual,p.polrelid) AS qual,
 pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
) t;
"""

# This is a necessary comparison, not a claim that PostgreSQL has no other
# catalog object kinds. The archive preserves the remaining dumpable objects.
CATALOG_SQL = """
SELECT coalesce(json_agg(t ORDER BY kind, key), '[]'::json) FROM (
 SELECT 'routine'::text AS kind,
 n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS key,
 json_build_object('definition',pg_get_functiondef(p.oid),
   'owner',pg_get_userbyid(p.proowner),
   'acl',(SELECT json_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a)) AS value
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind <> 'a'
 UNION ALL
 SELECT 'column', n.nspname||'.'||c.relname||'.'||a.attname,
 json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
  'ordinal',(SELECT count(*) FROM pg_attribute live WHERE live.attrelid=c.oid
             AND live.attnum>0 AND live.attnum<=a.attnum AND NOT live.attisdropped),
  'notnull',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,
  'default',pg_get_expr(ad.adbin,ad.adrelid),
  'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END,
  'acl',(SELECT json_agg(x::text ORDER BY x::text) FROM unnest(a.attacl) x))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','m','v')
 UNION ALL
 SELECT 'constraint', n.nspname||'.'||c.relname||'.'||x.conname,
 json_build_object('definition',pg_get_constraintdef(x.oid,true),'validated',x.convalidated)
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
 UNION ALL
 SELECT 'trigger', n.nspname||'.'||c.relname||'.'||x.tgname,
 json_build_object('definition',pg_get_triggerdef(x.oid,true),'enabled',x.tgenabled)
 FROM pg_trigger x JOIN pg_class c ON c.oid=x.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT x.tgisinternal
 UNION ALL
 SELECT 'index', n.nspname||'.'||c.relname,
 json_build_object('definition',pg_get_indexdef(c.oid),'valid',i.indisvalid)
 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
 UNION ALL
 SELECT 'view', n.nspname||'.'||c.relname,
 json_build_object('definition',pg_get_viewdef(c.oid,true))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('v','m')
) t;
"""

EXT_SQL = """SELECT json_agg(t ORDER BY name) FROM (
 SELECT e.extname name, e.extversion version, n.nspname schema,
 pg_get_userbyid(e.extowner) owner
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace) t;"""

ROLES_SQL = """SELECT json_agg(t ORDER BY rolname) FROM (
 SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
 rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> 'cli_login_postgres') t;"""

MEMBERS_SQL = """SELECT coalesce(json_agg(t ORDER BY role, member, grantor), '[]'::json) FROM (
 SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,
 pg_get_userbyid(grantor) grantor,admin_option,inherit_option,set_option
 FROM pg_auth_members WHERE pg_get_userbyid(member) <> 'cli_login_postgres'
 AND pg_get_userbyid(roleid) <> 'cli_login_postgres') t;"""

STORAGE_SQL = """SELECT coalesce(json_agg(t ORDER BY bucket_id,name), '[]'::json) FROM (
 SELECT id,bucket_id,name,version,updated_at,metadata FROM storage.objects) t;"""

DEFAULT_ACLS_SQL = """SELECT coalesce(json_agg(t ORDER BY role,schema,kind), '[]'::json) FROM (
 SELECT pg_get_userbyid(d.defaclrole) role,coalesce(n.nspname,'') schema,d.defaclobjtype::text kind,
 (SELECT json_agg(x::text ORDER BY x::text) FROM unnest(d.defaclacl) x) acl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace) t;"""

PUBLICATIONS_SQL = """SELECT json_build_object(
 'definitions',(SELECT coalesce(json_agg(t ORDER BY name),'[]'::json) FROM (
  SELECT pubname name,pg_get_userbyid(pubowner) owner,puballtables,pubinsert,pubupdate,
  pubdelete,pubtruncate,pubviaroot FROM pg_publication) t),
 'tables',(SELECT coalesce(json_agg(t ORDER BY pubname,schemaname,tablename),'[]'::json)
  FROM pg_publication_tables t),
 'schemas',(SELECT coalesce(json_agg(t ORDER BY publication,schema),'[]'::json) FROM (
  SELECT p.pubname publication,n.nspname schema FROM pg_publication_namespace x
  JOIN pg_publication p ON p.oid=x.pnpubid JOIN pg_namespace n ON n.oid=x.pnnspid) t));"""

DATABASE_SQL = """SELECT json_build_object('owner',pg_get_userbyid(datdba),
 'encoding',pg_encoding_to_char(encoding),'provider',datlocprovider,'collate',datcollate,
 'ctype',datctype,'locale',datlocale,'icu_rules',daticurules,'collation_version',datcollversion,
 'connection_limit',datconnlimit,
 'acl',(SELECT json_agg(x::text ORDER BY x::text) FROM unnest(datacl) x))
 FROM pg_database WHERE datname=current_database();"""

DB_SETTINGS_SQL = """SELECT coalesce(json_agg(t ORDER BY role),'[]'::json) FROM (
 SELECT CASE WHEN s.setrole=0 THEN '' ELSE pg_get_userbyid(s.setrole) END role,
 (SELECT json_agg(x ORDER BY x) FROM unnest(s.setconfig) x) settings
 FROM pg_db_role_setting s WHERE s.setdatabase=(SELECT oid FROM pg_database
 WHERE datname=current_database())) t;"""


class Recovery:
    def __init__(self):
        os.umask(0o077)
        self.work = Path(tempfile.mkdtemp(prefix="crm-recovery-", dir=os.environ.get("RUNNER_TEMP")))
        self.payload = self.work / "payload"
        self.payload.mkdir()
        self.logs = self.payload / "private-logs"
        self.logs.mkdir()
        self.container = "crm-recovery-" + secrets.token_hex(8)
        self.source_container = "crm-source-reader-" + secrets.token_hex(8)
        self.dump_container = "crm-source-dump-" + secrets.token_hex(8)
        self.source = self.target = None
        self.dump_process = None
        self.image = os.environ.get("BOSSA_BACKUP_IMAGE", "")
        self.recipient = os.environ.get("BOSSA_BACKUP_AGE_RECIPIENT", "")
        self.delivery = os.environ.get("BOSSA_BACKUP_DELIVERY_MODE", "")
        self.manifest = {"state":"NOT_EXECUTED", "project_ref":PROJECT,
                         "repository":REPOSITORY, "created_utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
                         "coverage":"PostgreSQL logical recovery and Storage bytes; same existing project",
                         "excluded":"Vercel env values, Edge secret plaintext, platform configuration recreation, PostgreSQL role passwords"}
        self.started = time.monotonic()

    def run(self, args, *, env=None, input_bytes=None, stdout=None, timeout=300):
        with open(self.logs / "commands.log", "ab") as err:
            result = subprocess.run(args, env=env, input=input_bytes,
                                    stdout=stdout or subprocess.PIPE, stderr=err, timeout=timeout)
        gate(result.returncode == 0, "command_failed")
        return result.stdout

    def request(self, url, *, method="GET", headers=None, data=None, output=None):
        req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
        with HTTP.open(req, timeout=120) as response:
            gate(200 <= response.status < 300, "http_status_failed")
            if output:
                with open(output, "wb") as f:
                    shutil.copyfileobj(response, f)
                return dict(response.headers)
            return response.read()

    def api(self, path, *, body=None):
        headers = {"Authorization":"Bearer " + os.environ["BOSSA_BACKUP_SUPABASE_PAT"],
                   "Content-Type":"application/json"}
        data = None if body is None else json.dumps(body).encode()
        return json.loads(self.request("https://api.supabase.com/v1/projects/" + PROJECT + path,
                                      method="GET" if body is None else "POST", headers=headers, data=data))

    def preflight(self):
        stage("PREFLIGHT")
        gate(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "repository_not_approved")
        gate(os.environ.get("GITHUB_REF") == BRANCH, "branch_not_approved")
        gate(os.environ.get("GITHUB_EVENT_NAME") == "push", "event_not_approved")
        gate(re.fullmatch(r"supabase/postgres:17\.6\.1\.147@sha256:[a-f0-9]{64}", self.image), "pinned_image_required")
        gate(re.fullmatch(r"age1[0-9a-z]{58}", self.recipient), "age_recipient_required")
        gate(os.environ.get("BOSSA_BACKUP_CONSISTENCY_MODE") == "observed-stable-catalog-and-storage",
             "observed_consistency_mode_required")
        self.manifest["consistency_mode"] = "observed-stable-catalog-and-storage"
        self.manifest["database_storage_atomic"] = False
        gate(os.environ.get("BOSSA_BACKUP_SUPABASE_PAT"), "temporary_pat_required")
        if self.delivery == "private_put":
            for key in ("BOSSA_BACKUP_PUT_URL", "BOSSA_BACKUP_GET_URL"):
                u = urllib.parse.urlsplit(os.environ.get(key, ""))
                gate(u.scheme == "https" and u.hostname == os.environ.get("BOSSA_BACKUP_UPLOAD_HOST")
                     and not u.username and not u.password and not u.fragment,
                     "private_delivery_url_required")
        elif self.delivery == "github_encrypted_artifact":
            gate(os.environ.get("BOSSA_BACKUP_ALLOW_GITHUB_ARTIFACT") == "explicitly-approved",
                 "encrypted_artifact_exception_not_approved")
        else:
            raise GateFailure("delivery_not_configured")
        for binary in ("docker", "age"):
            gate(shutil.which(binary), "required_binary_missing")
        # Public CA observed in the project's Download certificate control.
        # Fetch via normal HTTPS trust and pin the bytes independently; never
        # trust a certificate merely because the database handshake sent it.
        self.ca_file = self.work / "supabase-prod-ca-2021.crt"
        self.request(SUPABASE_CA_URL,output=self.ca_file)
        gate(sha_file(self.ca_file)==SUPABASE_CA_SHA256,"pinned_supabase_ca_mismatch")
        self.manifest["source_tls"] = {"mode":"verify-full","root_ca_url":SUPABASE_CA_URL,
                                       "root_ca_sha256":SUPABASE_CA_SHA256}
        gate(shutil.disk_usage(self.work).free >= 5 * 1024**3, "insufficient_private_workspace")
        self.run(["docker", "version"], timeout=30)
        self.run(["docker", "pull", self.image], timeout=600)
        version = self.run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "pg_dump", self.image, "--version"]).decode()
        gate("17.6" in version, "client_version_mismatch")
        self.manifest["image"] = self.image
        self.manifest["git_sha"] = os.environ.get("GITHUB_SHA")

    def source_connect(self):
        stage("TEMPORARY_SOURCE_CONNECTION")
        stage("READ_SESSION_POOLER_CONFIGURATION")
        pools = self.api("/config/database/pooler")
        gate(isinstance(pools, list), "pooler_response_shape")
        selected = [p for p in pools if p.get("database_type") == "PRIMARY"]
        # The API can report transaction mode/6543 as its default. Shared
        # Supavisor exposes session mode on the same host at 5432 regardless.
        distinct = {(p.get("db_host"),p.get("db_user"),p.get("db_name")):p for p in selected}
        gate(len(distinct) == 1, "unambiguous_session_pooler_required")
        pool = next(iter(distinct.values()))
        gate(pool.get("db_name") == "postgres", "unexpected_source_database")
        gate(str(pool.get("db_host", "")).endswith(".pooler.supabase.com"), "unexpected_pooler_host")
        stage("CREATE_AUTHORIZED_TEMPORARY_DATABASE_LOGIN")
        login = self.api("/cli/login-role", body={"read_only":False})
        gate(login.get("role") == "cli_login_postgres" and login.get("password"), "temporary_login_shape")
        gate(int(login.get("ttl_seconds", 0)) >= 60, "temporary_login_ttl_too_short")
        user = str(pool.get("db_user", ""))
        gate(user in ("postgres", "postgres." + PROJECT), "pooler_username_shape")
        self.source_env = dict(os.environ, PGHOST=pool["db_host"], PGPORT="5432",
                               PGUSER=login["role"] + "." + PROJECT, PGDATABASE="postgres",
                               PGPASSWORD=login["password"], PGSSLMODE="verify-full", PGSSLROOTCERT="/supabase-root.crt",
                               PGCONNECT_TIMEOUT="20", PSQL_HISTORY="/dev/null",
                               PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=30000")
        self.client_prefix = ["docker", "run", "--rm", "--interactive", "--network", "bridge"]
        for key in ("PGHOST","PGPORT","PGUSER","PGDATABASE","PGPASSWORD","PGSSLMODE","PGSSLROOTCERT","PGCONNECT_TIMEOUT","PGOPTIONS","PSQL_HISTORY"):
            self.client_prefix += ["--env", key]
        self.client_prefix += ["--mount", f"type=bind,src={self.payload},dst=/payload"]
        self.client_prefix += ["--mount", f"type=bind,src={self.ca_file},dst=/supabase-root.crt,readonly"]
        command = self.client_prefix + ["--name",self.source_container,"--entrypoint", "psql", self.image, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]
        stage("OPEN_READ_ONLY_DATABASE_SNAPSHOT")
        self.source = Psql(command, self.source_env, self.logs / "source.log")
        self.source.query("SET ROLE postgres; SET search_path=pg_catalog; SET timezone='UTC'; SET datestyle='ISO, YMD'; SET extra_float_digits=3; SET bytea_output='hex'; SET row_security=off; BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;")
        info = self.source.json("SELECT json_build_object('version',current_setting('server_version'),'snapshot',pg_export_snapshot(),'read_only',current_setting('transaction_read_only'),'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()));")
        gate(info["version"] == EXPECTED_VERSION and info["read_only"] == "on", "source_version_or_readonly_mismatch")
        self.db_owner = info["owner"]
        self.manifest["snapshot"] = info["snapshot"]
        # Authenticate dump immediately, before doing slower per-table exports.
        dump_file = open(self.payload / "database.dump", "wb")
        dump_error = open(self.logs / "dump.log", "wb")
        self.dump_handles = (dump_file, dump_error)
        command = self.client_prefix + ["--name",self.dump_container,"--entrypoint", "pg_dump", self.image,
                    "--format=custom", "--compress=6", "--create", "--role=postgres",
                    "--snapshot="+info["snapshot"], "--lock-wait-timeout=30000"]
        self.dump_process = subprocess.Popen(command, env=self.source_env, stdout=dump_file, stderr=dump_error)

    def capture(self):
        stage("CONSISTENT_DATABASE_EXPORT")
        for name, query in (("schemas",SCHEMAS_SQL),("tables",TABLES_SQL),
                            ("extensions",EXT_SQL),("roles",ROLES_SQL),
                            ("members",MEMBERS_SQL),("policies",POLICIES_SQL),
                            ("catalog",CATALOG_SQL),("default_acls",DEFAULT_ACLS_SQL),
                            ("publications",PUBLICATIONS_SQL),("database",DATABASE_SQL),
                            ("db_settings",DB_SETTINGS_SQL),("objects",STORAGE_SQL)):
            stage("SOURCE_CATALOG_"+name.upper())
            setattr(self,name,self.source.json(query))
        stage("SOURCE_RECOVERY_FEATURE_GATES")
        gate({e["name"]:e["version"] for e in self.extensions} == EXPECTED_EXTENSIONS, "extensions_changed")
        gate(not any(t["kind"] == "f" for t in self.tables), "foreign_table_requires_separate_backup")
        gate(self.source.json("SELECT to_json(count(*)) FROM pg_subscription;") == 0, "replication_subscription_requires_adapter")
        gate(self.source.json("SELECT to_json(count(*)) FROM pg_largeobject_metadata;") == 0, "large_objects_require_validation_adapter")
        gate(self.source.json("SELECT to_json(count(*)) FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global');") == 0, "custom_tablespaces_require_adapter")
        gate(not self.database["icu_rules"], "custom_icu_rules_require_adapter")
        stage("SOURCE_VAULT_DECRYPTION_PROOF")
        self.vault_proof = self.source.json("SELECT json_build_object('count',count(*),'hash',md5(coalesce(string_agg(id::text||':'||md5(decrypted_secret),',' ORDER BY id),''))) FROM vault.decrypted_secrets;")
        self.copies = []
        (self.payload / "tables").mkdir()
        stage("SOURCE_NATIVE_TABLE_COPIES")
        for index, table in enumerate(self.tables):
            gate(time.monotonic()-self.started < MAX_SECONDS, "overall_deadline")
            if table["kind"] not in ("r", "m"):
                continue
            name = f"tables/{index:05d}.copy"
            cols = table["copy_columns"]
            gate(cols, "zero_column_table_requires_adapter")
            # The order is stable; row_to_json contains all columns, including
            # generated values, while COPY uses only insertable columns.
            q = qualified(table["schema"], table["name"])
            source = ("ONLY " if table["kind"] == "r" else "") + q
            sql = "SELECT " + ",".join("t."+ident(c) for c in cols) + " FROM " + source + " t ORDER BY row_to_json(t)::text COLLATE \"C\""
            self.source.query("\\copy ("+sql+") TO '/payload/"+name+"' WITH (FORMAT text)")
            count = self.source.json("SELECT to_json(count(*)) FROM "+source+";")
            fingerprint_file = name
            fingerprint_sql = sql
            if table["has_generated"]:
                # Generated columns cannot be COPY inputs. Compare their
                # actual stored values too, rather than only their expressions.
                fingerprint_file = f"tables/{index:05d}.full-row.copy"
                fingerprint_sql = "SELECT row_to_json(t)::text FROM "+source+" t ORDER BY row_to_json(t)::text COLLATE \"C\""
                self.source.query("\\copy ("+fingerprint_sql+") TO '/payload/"+fingerprint_file+"' WITH (FORMAT text)")
            self.copies.append({"table":table,"file":name,"rows":count,
                                "fingerprint_file":fingerprint_file,
                                "sha256":sha_file(self.payload/fingerprint_file),"select":fingerprint_sql})
        stage("SOURCE_SEQUENCE_STATES")
        self.sequences = []
        for t in self.tables:
            if t["kind"] == "S":
                # Sequences have no composite row type. Read their state
                # columns explicitly, as PostgreSQL's own pg_dump does.
                state = self.source.json("SELECT json_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called) FROM "+qualified(t["schema"],t["name"])+";")
                self.sequences.append({"schema":t["schema"],"name":t["name"],"state":state})
        gate(self.dump_process.wait(timeout=600) == 0, "raw_dump_failed")
        for h in self.dump_handles:
            h.close()
        gate((self.payload / "database.dump").stat().st_size > 0, "empty_dump")
        for name, data in (("schemas",self.schemas),("tables",self.tables),("extensions",self.extensions),
                           ("roles",self.roles),("memberships",self.members),("policies",self.policies),
                           ("catalog",self.catalog),("table-copies",self.copies),("sequences",self.sequences),
                           ("default-acls",self.default_acls),("publications",self.publications),
                           ("database",self.database),("database-settings",self.db_settings)):
            dump_json(self.payload/(name+".json"),data)
        self.manifest["vault_proof"] = self.vault_proof

    def storage(self):
        stage("STORAGE_BYTES_AND_ORIGINAL_VAULT_KEY")
        vault = self.api("/pgsodium")
        gate(re.fullmatch(r"[a-fA-F0-9]{64}", vault.get("root_key", "")), "vault_root_key_unavailable")
        keyfile = self.payload / "vault-root.key"
        keyfile.write_text(vault["root_key"]+"\n")
        # Parent directory remains 0700 on the runner. The isolated container
        # receives this individual read-only file, readable by its postgres UID.
        keyfile.chmod(0o444)
        helper = self.work / "getkey.sh"
        helper.write_text("#!/bin/sh\nexec cat /recovery_root.key\n")
        helper.chmod(0o555)
        keys = self.api("/api-keys?reveal=true")
        candidates = [k for k in keys if k.get("name") == "service_role" and k.get("api_key")]
        gate(len(candidates) == 1, "storage_service_role_unavailable")
        key = candidates[0]["api_key"]
        self.storage_manifest = []
        (self.payload / "storage-bytes").mkdir()
        for index, obj in enumerate(self.objects):
            gate(time.monotonic()-self.started < MAX_SECONDS, "overall_deadline")
            path = f"storage-bytes/{index:05d}.bin"
            url = "https://"+PROJECT+".supabase.co/storage/v1/object/authenticated/"+urllib.parse.quote(obj["bucket_id"],safe="")+"/"+urllib.parse.quote(obj["name"],safe="/")
            headers = self.request(url, headers={"Authorization":"Bearer "+key,"apikey":key}, output=self.payload/path)
            size = (self.payload/path).stat().st_size
            metadata = obj.get("metadata") or {}
            expected = metadata.get("size")
            gate(expected is not None and int(expected) == size, "storage_size_mismatch")
            http_etag = next((value for name,value in headers.items() if name.lower()=="etag"),None)
            expected_etag = metadata.get("eTag")
            if expected_etag is not None:
                gate(isinstance(expected_etag,str) and isinstance(http_etag,str),"storage_etag_missing_or_invalid")
                # ETags are opaque, case-sensitive validators, not necessarily
                # MD5 hashes. Normalize surrounding HTTP quotes only; a weak
                # validator is not silently promoted to a strong one.
                def etag_value(value):
                    value = value.strip()
                    return value[1:-1] if len(value)>=2 and value[0]==value[-1]=='"' else value
                gate(etag_value(http_etag)==etag_value(expected_etag),"storage_etag_mismatch")
            self.storage_manifest.append({"object":obj,"file":path,"bytes":size,"sha256":sha_file(self.payload/path),"http_etag":http_etag})
        # The dump and COPY exports used one source snapshot. After the blob
        # downloads, a NEW read-only transaction compares every captured
        # catalog/security/configuration set and the full Storage inventory.
        # This detects observed changes; it does not freeze writers or create
        # a distributed atomic transaction between PostgreSQL and Storage.
        stage("VERIFY_OBSERVED_CATALOG_AND_STORAGE_STABILITY")
        self.source.query("COMMIT; BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;")
        stability_checks = (("schemas",SCHEMAS_SQL,self.schemas),("relations",TABLES_SQL,self.tables),
                            ("extensions",EXT_SQL,self.extensions),("roles",ROLES_SQL,self.roles),
                            ("memberships",MEMBERS_SQL,self.members),("policies",POLICIES_SQL,self.policies),
                            ("catalog",CATALOG_SQL,self.catalog),("default_acls",DEFAULT_ACLS_SQL,self.default_acls),
                            ("publications",PUBLICATIONS_SQL,self.publications),("database",DATABASE_SQL,self.database),
                            ("database_settings",DB_SETTINGS_SQL,self.db_settings),("storage",STORAGE_SQL,self.objects))
        for name, query, expected in stability_checks:
            gate(self.source.json(query)==expected,"source_"+name+"_changed_during_backup")
        self.manifest["observed_stability_checks"] = [name for name,_,_ in stability_checks]
        self.manifest["observed_stability_verified"] = True
        self.source.query("COMMIT;")
        self.source.close()
        self.source = None
        self.source_env.pop("PGPASSWORD", None)
        dump_json(self.payload / "storage-manifest.json", self.storage_manifest)

    def start_target(self):
        stage("ISOLATED_SUPABASE_POSTGRES_RESTORE")
        self.run(["docker","run","--detach","--name",self.container,"--network","none",
                  "--mount",f"type=bind,src={self.payload},dst=/payload,readonly",
                  "--mount",f"type=bind,src={self.payload/'vault-root.key'},dst=/recovery_root.key,readonly",
                  "--mount",f"type=bind,src={self.work/'getkey.sh'},dst=/recovery_getkey,readonly",
                  "--entrypoint","sleep",self.image,"infinity"])
        info = json.loads(self.run(["docker","inspect",self.container]))[0]
        gate(info["HostConfig"]["NetworkMode"] == "none" and not info["HostConfig"].get("PortBindings"), "restore_network_not_isolated")
        self.manifest["network_none"] = True
        self.run(["docker","exec",self.container,"sh","-c","mkdir -p /recovery && chown postgres:postgres /recovery"])
        providers = {"b":"builtin","c":"libc","i":"icu"}
        gate(self.database["provider"] in providers,"unsupported_locale_provider")
        init = ["docker","exec","--user","postgres",self.container,"initdb","-D","/recovery/data","-U","supabase_admin","-A","trust",
                "--encoding="+self.database["encoding"],"--locale-provider="+providers[self.database["provider"]],
                "--lc-collate="+self.database["collate"],"--lc-ctype="+self.database["ctype"],"--no-instructions"]
        if self.database["provider"] in ("b","i"):
            gate(self.database["locale"],"provider_locale_missing")
            init += [("--builtin-locale=" if self.database["provider"]=="b" else "--icu-locale=")+self.database["locale"]]
        self.run(init)
        # pg_net needs shared_preload_libraries while its extension is created.
        # Preload ONLY on the empty, network-isolated clone, before any source
        # rows are restored. After CREATE EXTENSION restart without pg_net.
        start = "exec postgres -D /recovery/data -c listen_addresses='' -c unix_socket_directories=/tmp -c shared_preload_libraries=pg_cron,pg_stat_statements,supabase_vault,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off -c vault.getkey_script=/recovery_getkey -c log_statement=none -c log_min_error_statement=panic >/recovery/server.log 2>&1"
        self.run(["docker","exec","--detach","--user","postgres",self.container,"sh","-c",start])
        ready = False
        for _ in range(45):
            r = subprocess.run(["docker","exec",self.container,"pg_isready","-h","/tmp","-U","supabase_admin","-d","postgres"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if r.returncode == 0:
                ready = True
                break
            time.sleep(1)
        gate(ready, "isolated_database_not_ready")
        cmd = ["docker","exec","--interactive",self.container,"psql","-h","/tmp","-U","supabase_admin","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1"]
        self.target = Psql(cmd, dict(os.environ), self.logs/"restore-session.log")
        self.target.query("SET search_path=pg_catalog; SET timezone='UTC'; SET datestyle='ISO, YMD'; SET extra_float_digits=3; SET bytea_output='hex'; SET session_replication_role=replica;")
        config = self.target.json("SELECT json_build_object('cron',current_setting('cron.launch_active_jobs'),'preload',current_setting('shared_preload_libraries'),'version',current_setting('server_version'));")
        gate(config["cron"] == "off" and "pg_net" in config["preload"] and config["version"] == EXPECTED_VERSION, "unsafe_extension_bootstrap_configuration")

    def prepare_roles_extensions(self):
        stage("RESTORE_ORIGINAL_ROLES_AND_EXTENSION_OWNERS")
        sql = []
        for r in self.roles:
            role = ident(r["rolname"])
            if r["rolname"] != "supabase_admin":
                sql.append("CREATE ROLE "+role+";")
            options = []
            for key, label in (("rolsuper","SUPERUSER"),("rolinherit","INHERIT"),("rolcreaterole","CREATEROLE"),
                               ("rolcreatedb","CREATEDB"),("rolcanlogin","LOGIN"),("rolreplication","REPLICATION"),("rolbypassrls","BYPASSRLS")):
                options.append(("" if r[key] else "NO")+label)
            options.append("CONNECTION LIMIT "+str(r["rolconnlimit"]))
            if r["rolvaliduntil"] is not None:
                options.append("VALID UNTIL "+literal(r["rolvaliduntil"]))
            sql.append("ALTER ROLE "+role+" WITH "+" ".join(options)+";")
            for setting in r["rolconfig"] or []:
                key, value = setting.split("=",1)
                gate(re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9.]*",key),"unsupported_role_setting")
                sql.append("ALTER ROLE "+role+" SET "+key+" TO "+literal(value)+";")
        # PostgreSQL 17 permits explicit per-membership ADMIN/INHERIT/SET.
        pending = list(self.members)
        admin_edges = set()
        while pending:
            ready = [m for m in pending if m["grantor"]=="supabase_admin" or (m["role"],m["grantor"]) in admin_edges]
            gate(ready,"membership_grantor_dependency_requires_adapter")
            for m in ready:
                for option, field in (("ADMIN","admin_option"),("INHERIT","inherit_option"),("SET","set_option")):
                    sql.append("GRANT "+ident(m["role"])+" TO "+ident(m["member"])+" WITH "+option+" "+str(m[field]).lower()+" GRANTED BY "+ident(m["grantor"])+";")
                if m["admin_option"]:
                    admin_edges.add((m["role"],m["member"]))
                pending.remove(m)
        sql.append("ALTER DATABASE postgres OWNER TO "+ident(self.db_owner)+";")
        sql.append("ALTER DATABASE postgres CONNECTION LIMIT "+str(self.database["connection_limit"])+";")
        (self.payload/"roles-restore.sql").write_text("\n".join(sql)+"\n")
        self.target.query("\n".join(sql))
        for s in self.schemas:
            if not s["extension"]:
                self.target.query("CREATE SCHEMA IF NOT EXISTS "+ident(s["name"])+" AUTHORIZATION "+ident(s["owner"])+"; ALTER SCHEMA "+ident(s["name"])+" OWNER TO "+ident(s["owner"])+";")
        available = self.target.json("SELECT json_agg(json_build_object('name',name,'version',version,'requires_superuser',superuser,'trusted',trusted)) FROM pg_available_extension_versions;")
        allowed = {(x["name"],x["version"]):x for x in available}
        original_roles = {r["rolname"]:r for r in self.roles}
        for e in self.extensions:
            gate((e["name"],e["version"]) in allowed, "extension_version_unavailable")
            gate(e["owner"] in original_roles,"extension_owner_not_in_original_roles")
            install = allowed[(e["name"],e["version"])]
            # Supabase's managed postgres role owns pg_stat_statements even
            # though PostgreSQL normally requires SUPERUSER to install it.
            # Reproduce this exact case only on the sealed network-none clone:
            # elevate for CREATE and immediately revert within one transaction.
            special = (e["name"] == "pg_stat_statements" and e["owner"] == "postgres"
                       and not original_roles[e["owner"]]["rolsuper"]
                       and install["requires_superuser"] and not install["trusted"])
            gate(special or original_roles[e["owner"]]["rolsuper"] or
                 not install["requires_superuser"] or install["trusted"],
                 "extension_owner_requires_superuser_or_trusted_adapter")
        gate(self.manifest.get("network_none") is True, "isolation_required_for_restore")
        # The source role's original attributes must be restored before any
        # schema or row verification. A failure destroys this local clone.
        self.target.query("DROP EXTENSION plpgsql;")
        for e in sorted(self.extensions,key=lambda e:(e["name"]!="plpgsql",e["name"])):
            special = (e["name"] == "pg_stat_statements" and e["owner"] == "postgres"
                       and not original_roles[e["owner"]]["rolsuper"]
                       and allowed[(e["name"],e["version"])]["requires_superuser"]
                       and not allowed[(e["name"],e["version"])]["trusted"])
            create = ("SET SESSION AUTHORIZATION "+ident(e["owner"])+"; CREATE EXTENSION "
                      +ident(e["name"])+" WITH SCHEMA "+ident(e["schema"])+" VERSION "
                      +literal(e["version"])+"; RESET SESSION AUTHORIZATION;")
            if special:
                self.target.query("BEGIN; ALTER ROLE postgres WITH SUPERUSER; "
                                  +create+" ALTER ROLE postgres WITH NOSUPERUSER; COMMIT;")
                gate(self.target.json("SELECT to_json(rolsuper) FROM pg_roles WHERE rolname='postgres';") is False,
                     "temporary_extension_privilege_not_revoked")
            else:
                self.target.query(create)
        gate({r["rolname"]:r["rolsuper"] for r in self.target.json(
             "SELECT json_agg(json_build_object('rolname',rolname,'rolsuper',rolsuper)) "
             "FROM pg_roles WHERE rolname IN ('postgres','supabase_admin');")}
             == {r["rolname"]:r["rolsuper"] for r in self.roles
                 if r["rolname"] in ("postgres","supabase_admin")},
             "restored_extension_role_privileges_mismatch")
        self.disable_pg_net_before_source_restore()

    def disable_pg_net_before_source_restore(self):
        # Bootstrap creates no source rows. Confirm queue empty while the
        # worker is enabled, then stop the server BEFORE importing source data.
        stage("DISABLE_PG_NET_BEFORE_SOURCE_RESTORE")
        gate(self.manifest.get("network_none") is True, "offline_container_required")
        gate(self.target.json("SELECT to_json(count(*)) FROM net.http_request_queue;") == 0,
             "pg_net_bootstrap_queue_not_empty")
        self.target.close()
        self.target = None
        self.run(["docker", "exec", "--user", "postgres", self.container,
                  "pg_ctl", "-D", "/recovery/data", "-m", "fast", "stop"], timeout=90)

        # Keep pg_cron loaded but fully disabled; do not reload pg_net worker.
        # The restored queue may have historic data, so even internal requests
        # must not be retried. Docker --network none is a second barrier.
        restart = ("exec postgres -D /recovery/data -c listen_addresses='' "
                   "-c unix_socket_directories=/tmp "
                   "-c shared_preload_libraries=pg_cron,pg_stat_statements,supabase_vault "
                   "-c cron.database_name=postgres -c cron.launch_active_jobs=off "
                   "-c vault.getkey_script=/recovery_getkey "
                   "-c log_statement=none -c log_min_error_statement=panic "
                   ">/recovery/server.log 2>&1")
        self.run(["docker", "exec", "--detach", "--user", "postgres", self.container,
                  "sh", "-c", restart], timeout=30)
        ready = False
        for _ in range(45):
            check = subprocess.run(
                ["docker", "exec", self.container, "pg_isready", "-h", "/tmp",
                 "-U", "supabase_admin", "-d", "postgres"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if check.returncode == 0:
                ready = True
                break
            time.sleep(1)
        gate(ready, "offline_database_restart_failed")
        info = json.loads(self.run(["docker", "inspect", self.container]))[0]
        gate(info["HostConfig"]["NetworkMode"] == "none"
             and not info["HostConfig"].get("PortBindings"),
             "restore_network_isolation_lost")
        command = ["docker", "exec", "--interactive", self.container, "psql",
                   "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres", "-X",
                   "-qAt", "-v", "ON_ERROR_STOP=1"]
        self.target = Psql(command, dict(os.environ), self.logs / "restore-after-restart.log")
        self.target.query("SET search_path=pg_catalog; SET timezone='UTC'; "
                          "SET datestyle='ISO, YMD'; SET extra_float_digits=3; "
                          "SET bytea_output='hex'; SET session_replication_role=replica;")
        config = self.target.json(
            "SELECT json_build_object('cron',current_setting('cron.launch_active_jobs'),"
            "'preload',current_setting('shared_preload_libraries'),"
            "'version',current_setting('server_version'));")
        gate(config["cron"] == "off" and "pg_net" not in config["preload"]
             and config["version"] == EXPECTED_VERSION,
             "network_workers_not_disabled_before_restore")
        gate(self.target.json("SELECT to_json(count(*)) FROM net.http_request_queue;") == 0,
             "pg_net_queue_changed_after_restart")
        self.manifest["pg_net_empty_bootstrap_then_disabled"] = True
        stage("SOURCE_RESTORE_PROCESSORS_DISABLED")

    def restore(self):
        self.prepare_roles_extensions()
        stage("RESTORE_NATIVE_POSTGRES_ARCHIVE")
        toc = self.run(["docker","exec",self.container,"pg_restore","--list","/payload/database.dump"]).decode()
        # Schemas/extensions were recreated with source owners and exact
        # versions. Every other archive entry remains in its original order.
        retained = [line for line in toc.splitlines()
                    if not re.match(r"^\d+; \d+ \d+ (SCHEMA|EXTENSION) ",line)]
        (self.payload/"restore.list").write_text("\n".join(retained)+"\n")
        env = dict(os.environ,PGOPTIONS="-c session_replication_role=replica -c row_security=off")
        self.run(["docker","exec","--env","PGOPTIONS",self.container,"pg_restore","-h","/tmp","-U","supabase_admin","-d","postgres",
                  "--exit-on-error","--single-transaction","--use-list=/payload/restore.list","/payload/database.dump"],env=env,timeout=900)
        # pg_dump omits non-config extension relations. Restore those explicitly
        # from native COPY files exported from the SAME snapshot.
        stage("RESTORE_EXTENSION_RELATIONS_AND_POLICIES")
        for c in self.copies:
            t = c["table"]
            if t["kind"] == "r" and t["extension"] and not t["extconfig"]:
                q = qualified(t["schema"],t["name"])
                gate(self.target.json("SELECT to_json(count(*)) FROM ONLY "+q+";") == 0,"extension_table_not_empty")
                self.target.query("\\copy "+q+" ("+",".join(ident(x) for x in t["copy_columns"])+") FROM '/payload/"+c["file"]+"' WITH (FORMAT text)")
        # Extension policies are not dumped by PostgreSQL; replay their exact
        # definitions. Source policy text remains inside the private bundle.
        extension_tables = {(t["schema"],t["name"]) for t in self.tables if t["extension"] and t["kind"] in ("r","p")}
        for p in self.target.json(POLICIES_SQL):
            if (p["schema"],p["tablename"]) in extension_tables:
                self.target.query("DROP POLICY "+ident(p["name"])+" ON "+qualified(p["schema"],p["tablename"])+";")
        commands = {"*":"ALL","r":"SELECT","a":"INSERT","w":"UPDATE","d":"DELETE"}
        for p in self.policies:
            if (p["schema"],p["tablename"]) not in extension_tables:
                continue
            roles = ",".join("PUBLIC" if r=="PUBLIC" else ident(r) for r in p["roles"])
            sql = "CREATE POLICY "+ident(p["name"])+" ON "+qualified(p["schema"],p["tablename"])+" AS "+("PERMISSIVE" if p["permissive"] else "RESTRICTIVE")+" FOR "+commands[p["command"]]+" TO "+roles
            if p["qual"] is not None:
                sql += " USING ("+p["qual"]+")"
            if p["check_expr"] is not None:
                sql += " WITH CHECK ("+p["check_expr"]+")"
            self.target.query(sql+";")
        for s in self.sequences:
            q = qualified(s["schema"],s["name"])
            v = s["state"]
            self.target.query("SELECT setval("+literal(q)+","+str(v["last_value"])+","+str(v["is_called"]).lower()+");")
        # pg_restore without --create may omit database-specific settings;
        # reapply them explicitly to this isolated database only.
        for setting in self.db_settings:
            for value in setting["settings"]:
                key, val = value.split("=",1)
                gate(re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9.]*",key),"unsupported_database_setting")
                prefix = "ALTER DATABASE postgres" if not setting["role"] else "ALTER ROLE "+ident(setting["role"])+" IN DATABASE postgres"
                self.target.query(prefix+" SET "+key+" TO "+literal(val)+";")
        self.reconcile_extension_schema_acls()

    def reconcile_extension_schema_acls(self):
        """Reapply the source's extension-owned schema grants exactly, in the
        network-isolated clone only. pg_dump excludes managed extension objects,
        so their grants need an explicit, separately verified recovery step.
        """
        stage("RESTORE_EXTENSION_SCHEMA_ACLS")
        gate(self.manifest.get("network_none") is True
             and self.manifest.get("pg_net_empty_bootstrap_then_disabled") is True,
             "extension_schema_grants_require_offline_restore")
        expected = {x["name"]: x for x in self.schemas if x["extension"]}
        gate({k: v["extension"] for k, v in expected.items()}
             == {"cron": "pg_cron", "net": "pg_net"},
             "unexpected_extension_schema_grant_scope")
        current = {x["name"]: x for x in self.target.json(SCHEMAS_SQL)}
        for name, source_schema in expected.items():
            clone_schema = current.get(name)
            gate(clone_schema is not None
                 and clone_schema["owner"] == source_schema["owner"]
                 and clone_schema["extension"] == source_schema["extension"]
                 and source_schema["owner"] == "supabase_admin",
                 "extension_schema_owner_or_membership_mismatch")

            def parse_acl(item):
                match = re.fullmatch(r"([^=]*)=([UC*]*)/([^/]+)", item)
                gate(match is not None, "invalid_extension_schema_acl")
                grantee, permissions, grantor = match.groups()
                gate(grantor == source_schema["owner"]
                     and grantee != "pg_database_owner",
                     "unsupported_extension_schema_grantor")
                rights = []
                i = 0
                while i < len(permissions):
                    privilege = permissions[i]
                    gate(privilege in ("U", "C"), "unsupported_extension_schema_privilege")
                    option = i+1 < len(permissions) and permissions[i+1] == "*"
                    rights.append(("USAGE" if privilege == "U" else "CREATE", option))
                    i += 2 if option else 1
                return grantee, rights

            def grantee_sql(name):
                return "PUBLIC" if not name else ident(name)

            original = {g: rights for g, rights in map(parse_acl, source_schema["acl"] or [])}
            existing = {g: rights for g, rights in map(parse_acl, clone_schema["acl"] or [])}
            if sorted(source_schema["acl"] or []) == sorted(clone_schema["acl"] or []):
                continue
            sql = ["SET SESSION AUTHORIZATION "+ident(source_schema["owner"])+";"]
            # Revoke only schema-level grants on this isolated clone. Keep the
            # owner role's rights intact and re-grant them explicitly below.
            for grantee in sorted((set(existing) | set(original)) - {source_schema["owner"]}):
                sql.append("REVOKE ALL PRIVILEGES ON SCHEMA "+ident(name)+
                           " FROM "+grantee_sql(grantee)+" CASCADE;")
            for grantee, rights in original.items():
                for privilege, grant_option in rights:
                    sql.append("GRANT "+privilege+" ON SCHEMA "+ident(name)+
                               " TO "+grantee_sql(grantee)+
                               (" WITH GRANT OPTION;" if grant_option else ";"))
            sql.append("RESET SESSION AUTHORIZATION;")
            self.target.query(" ".join(sql))
            refreshed = {x["name"]: x for x in self.target.json(SCHEMAS_SQL)}
            gate(refreshed[name]["acl"] == source_schema["acl"],
                 "restored_extension_schema_acl_mismatch")
        self.manifest["extension_schema_acl_reconciled"] = True

    def verify(self):
        stage("VERIFY_RESTORED_ROWS_SECURITY_AND_VAULT")
        mismatches = []
        for name, query, expected in (("schemas",SCHEMAS_SQL,self.schemas),("relations",TABLES_SQL,self.tables),
                                       ("extensions",EXT_SQL,self.extensions),("policies",POLICIES_SQL,self.policies),
                                       ("catalog",CATALOG_SQL,self.catalog),("roles",ROLES_SQL,self.roles),
                                       ("memberships",MEMBERS_SQL,self.members),
                                       ("default_acls",DEFAULT_ACLS_SQL,self.default_acls),
                                       ("publications",PUBLICATIONS_SQL,self.publications),
                                       ("database",DATABASE_SQL,self.database),
                                       ("database_settings",DB_SETTINGS_SQL,self.db_settings)):
            actual = self.target.json(query)
            dump_json(self.payload/("restored-"+name+".json"), actual)
            if actual != expected:
                mismatches.append(name)
                if name == "schemas":
                    by_source = {s["name"]: s for s in expected}
                    by_clone = {s["name"]: s for s in actual}
                    for schema in sorted(set(by_source) | set(by_clone)):
                        a, b = by_source.get(schema), by_clone.get(schema)
                        differences = (["missing"] if b is None else
                                       ["extra"] if a is None else
                                       [k for k in ("owner", "acl", "extension") if a[k] != b[k]])
                        if differences:
                            # Hash schema names to avoid disclosing private
                            # database topology in this public Actions log.
                            digest = hashlib.sha256(schema.encode()).hexdigest()[:16]
                            print("RESTORE_SCHEMA_DIAG="+digest+":"+
                                  ",".join(differences), flush=True)
                else:
                    print("RESTORE_METADATA_DIAG="+name, flush=True)
        gate(not mismatches, "restore_metadata_mismatch")
        self.run(["docker","exec",self.container,"mkdir","-p","/recovery/verify"])
        for index, c in enumerate(self.copies):
            output = "/recovery/verify/"+str(index)+".copy"
            self.target.query("\\copy ("+c["select"]+") TO '"+output+"' WITH (FORMAT text)")
            actual = self.run(["docker","exec",self.container,"sha256sum",output]).decode().split()[0]
            gate(actual == c["sha256"], "restore_table_bytes_mismatch")
            self.run(["docker","exec",self.container,"rm","-f",output])
        vault = self.target.json("SELECT json_build_object('count',count(*),'hash',md5(coalesce(string_agg(id::text||':'||md5(decrypted_secret),',' ORDER BY id),''))) FROM vault.decrypted_secrets;")
        gate(vault == self.vault_proof, "vault_decryption_mismatch")
        for s in self.sequences:
            actual = self.target.json("SELECT json_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called) FROM "+qualified(s["schema"],s["name"])+";")
            gate(all(actual[k]==s["state"][k] for k in ("last_value","is_called")),"sequence_state_mismatch")
        self.manifest["state"] = "RESTORE_VERIFIED"
        self.manifest["table_copy_count"] = len(self.copies)
        self.manifest["storage_objects"] = len(self.storage_manifest)
        self.manifest["storage_bytes"] = sum(x["bytes"] for x in self.storage_manifest)
        self.manifest["network_none"] = True
        self.manifest["cron_launch_active_jobs"] = "off"
        self.manifest["pg_net_preloaded"] = False
        self.manifest["recovery_warning"] = "Original cron jobs and queued HTTP requests are preserved but must remain disabled until reviewed. Never replay historical outbound requests automatically."

    def rehearse_release(self):
        # Rehearsal is deliberately after baseline verification and before
        # encryption/cleanup. Its clone mutations never become the recovery dump.
        # A release-gate failure must not destroy a valid baseline backup.
        try:
            from migration_rehearsal import BaselineProtectionFailure, run_rehearsal
        except ImportError:
            self.manifest["migration_rehearsal"] = {
                "status":"FAILED_RELEASE_GATES", "failure_code":"rehearsal_module_unavailable",
                "baseline_unchanged":True, "sql_committed":0, "ledger_recorded":0,
                "http_409_verified":False, "human_acceptance_changed":False}
            (self.logs/"migration-rehearsal-import.private.txt").write_text(traceback.format_exc())
            print("MIGRATION_REHEARSAL=FAILED_RELEASE_GATES",flush=True)
            return
        try:
            run_rehearsal(self, release_root=Path(__file__).resolve().parents[2])
        except BaselineProtectionFailure:
            # Unlike an unsuccessful migration rehearsal, a modified baseline
            # invalidates the prior restoration proof and cannot be delivered.
            raise GateFailure("rehearsal_baseline_integrity_failed")

    def encrypt(self):
        stage("ENCRYPT_PRIVATE_RECOVERY_PACKAGE")
        self.target.close()
        self.target = None
        # No log under payload is written after this point.
        self.manifest["file_sha256"] = {str(p.relative_to(self.payload)):sha_file(p)
                                        for p in self.payload.rglob("*") if p.is_file() and p.name != "manifest.json"}
        dump_json(self.payload/"manifest.json",self.manifest)
        output_dir = Path(os.environ["RUNNER_TEMP"])/"crm-recovery-output"
        output_dir.mkdir(mode=0o700,exist_ok=True)
        self.encrypted = output_dir/"recovery.tar.gz.age"
        with open(self.work/"encryption.log","ab") as err:
            age = subprocess.Popen(["age","--recipient",self.recipient,"--output",str(self.encrypted)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=err)
            try:
                with gzip.GzipFile(fileobj=age.stdin,mode="wb",mtime=0,compresslevel=6) as compressed:
                    with tarfile.open(fileobj=compressed,mode="w|") as archive:
                        archive.add(self.payload,arcname="recovery",recursive=True)
            finally:
                age.stdin.close()
            gate(age.wait(timeout=300) == 0,"encryption_failed")
        gate(self.encrypted.stat().st_size > 0,"empty_encrypted_package")
        limit = int(os.environ.get("BOSSA_BACKUP_MAX_CIPHERTEXT_BYTES", "471859200"))
        gate(0 < self.encrypted.stat().st_size <= limit,"ciphertext_exceeds_approved_size_limit")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"],"a") as f:
                f.write("encrypted_output_ready=true\n")
        self.cipher_hash = sha_file(self.encrypted)

    def deliver(self):
        if self.delivery == "private_put":
            stage("VERIFY_PRIVATE_CIPHERTEXT_DELIVERY")
            # Standard-library urllib accepts a file body with Content-Length.
            with open(self.encrypted,"rb") as f:
                self.request(os.environ["BOSSA_BACKUP_PUT_URL"],method="PUT",data=f,
                             headers={"Content-Type":"application/octet-stream","Content-Length":str(self.encrypted.stat().st_size)})
            check = self.work/"downloaded-ciphertext.age"
            self.request(os.environ["BOSSA_BACKUP_GET_URL"],output=check)
            gate(sha_file(check)==self.cipher_hash,"private_delivery_checksum_mismatch")
            result = "RESTORE_VERIFIED_CIPHERTEXT_DELIVERED_AWAITING_PRIVATE_DECRYPTION"
        else:
            # Upload is a separate, explicitly authorized workflow step. This
            # program does not assert that GitHub upload or private collection happened.
            result = "RESTORE_VERIFIED_ENCRYPTED_AWAITING_DELIVERY_AND_DECRYPTION"
        receipt = {"state":result,"ciphertext_sha256":self.cipher_hash,
                   "ciphertext_bytes":self.encrypted.stat().st_size,"project_ref":PROJECT}
        dump_json(self.encrypted.parent/"receipt.json",receipt)
        # These two values describe only the already encrypted bytes. They
        # support independent verification after collection without publishing
        # the private manifest, catalogs, SQL, object names, or any credential.
        print("CIPHERTEXT_SHA256="+self.cipher_hash,flush=True)
        print("CIPHERTEXT_BYTES="+str(self.encrypted.stat().st_size),flush=True)
        print("RESULT="+result,flush=True)

    def cleanup(self):
        for session in (self.source,self.target):
            if session:
                try:
                    session.close()
                except Exception:
                    pass
        if self.dump_process and self.dump_process.poll() is None:
            self.dump_process.kill()
            self.dump_process.wait(timeout=10)
        # Only this run's randomly named local container. No source mutation,
        # no broad docker prune, no API revocation of other CLI sessions.
        if shutil.which("docker"):
            for name in (self.container,self.source_container,self.dump_container):
                subprocess.run(["docker","rm","--force",name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
        shutil.rmtree(self.work,ignore_errors=True)


def main():
    recovery = Recovery()
    try:
        recovery.preflight()
        recovery.source_connect()
        recovery.capture()
        recovery.storage()
        recovery.start_target()
        recovery.restore()
        recovery.verify()
        recovery.rehearse_release()
        recovery.encrypt()
        recovery.deliver()
        return 0
    except Exception as exc:
        # A traceback can contain source SQL/URLs; never print it to the CI log.
        (recovery.logs/"failure.txt").write_text(traceback.format_exc())
        code = str(exc) if isinstance(exc,GateFailure) else "unexpected_failure"
        recovery.manifest["state"] = "FAILED"
        recovery.manifest["failure_code"] = code
        # No failed package is published automatically. It is discarded below.
        print("RESULT=FAILED; CODE="+code,flush=True)
        return 1
    finally:
        recovery.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
