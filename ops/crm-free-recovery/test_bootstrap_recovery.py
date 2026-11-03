"""Credential-free regression with synthetic roles and an empty offline DB."""
import os
from pathlib import Path
import traceback

from bootstrap_recovery import Recovery, setting_sql
from runner import GateFailure, Psql, ROLES_SQL, SCHEMAS_SQL


def run():
    forbidden = ('BOSSA_BACKUP_SUPABASE_PAT', 'PGPASSWORD', 'DATABASE_URL',
                 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    assert not any(os.environ.get(key) for key in forbidden), 'source credentials prohibited'
    r, reference = Recovery(), None
    def role(name, superuser=False, config=None):
        return dict(rolname=name, rolsuper=superuser, rolinherit=True,
                    rolcreaterole=superuser, rolcreatedb=superuser, rolcanlogin=True,
                    rolreplication=False, rolbypassrls=superuser, rolconnlimit=-1,
                    rolvaliduntil=None, rolconfig=config)
    r.roles = sorted([
        role('supabase_admin', True, ['search_path="$user", public, auth, extensions']),
        role('postgres', config=[r'search_path="\$user", public, extensions',
                                'statement_timeout=300000', 'lock_timeout=7500ms']),
        role('authenticator', config=['session_preload_libraries=auto_explain, pg_stat_statements',
                                     'statement_timeout=300000', 'work_mem=4096',
                                     'application_name=CRM smoke, synthetic']),
        role('anon'), role('authenticated', config=['search_path=public, extensions',
                                                    'row_security=on',
                                                    'default_transaction_isolation=read committed']),
        role('service_role', config=['search_path="Synthetic, Schema", "Mixed Case", "Quote""Name", public',
                                    'bossa.synthetic_option=one=two,three']),
        role('supabase_functions_admin'),
    ], key=lambda row: row['rolname'])
    r.members = []
    r.db_owner = 'postgres'
    r.database = dict(provider='c', encoding='UTF8', collate='C', ctype='C',
                      locale=None, connection_limit=-1)
    r.schemas = [
        {'name':'extensions','owner':'postgres','extension':None},
        {'name':'vault','owner':'supabase_admin','extension':None},
        {'name':'cron','owner':'supabase_admin','extension':'pg_cron',
         'acl':['postgres=U*/supabase_admin','supabase_admin=UC/supabase_admin']},
        {'name':'net','owner':'supabase_admin','extension':'pg_net',
         'acl':['=U/supabase_admin','anon=U/supabase_admin','authenticated=U/supabase_admin',
                'postgres=U/supabase_admin','service_role=U/supabase_admin',
                'supabase_admin=UC/supabase_admin','supabase_functions_admin=U/supabase_admin']},
    ]
    r.extensions = [dict(zip(('name','version','schema','owner'), row)) for row in (
        ('btree_gist','1.7','public','supabase_admin'),
        ('pg_cron','1.6.4','pg_catalog','supabase_admin'),
        ('pg_net','0.20.4','public','supabase_admin'),
        ('pg_stat_statements','1.11','extensions','postgres'),
        ('pgcrypto','1.3','extensions','postgres'),
        ('plpgsql','1.0','pg_catalog','supabase_admin'),
        ('supabase_vault','0.3.1','vault','supabase_admin'),
        ('uuid-ossp','1.1','extensions','postgres'),
    )]
    (r.payload/'vault-root.key').write_text('0'*64+'\n')
    (r.work/'getkey.sh').write_text('#!/bin/sh\nexec cat /recovery_root.key\n')
    (r.payload/'vault-root.key').chmod(0o444)
    (r.work/'getkey.sh').chmod(0o555)
    try:
        for key in ('', 'x;SELECT 1', 'x--', "x'"):
            try:
                setting_sql('ALTER ROLE "synthetic"', key, 'value')
            except GateFailure:
                pass
            else:
                raise AssertionError('unsafe setting name accepted')
        print('STAGE=EMPTY_OFFLINE_BOOTSTRAP', flush=True)
        r.run(['docker','pull',r.image],timeout=300)
        r.start_target()
        r.prepare_roles_extensions()
        assert r.target.json(ROLES_SQL) == r.roles
        print('STAGE=EXACT_ROLE_SETTINGS_PASSED', flush=True)
        # Independent native SQL reference, never populated from production.
        r.target.query('CREATE DATABASE synthetic_extension_reference TEMPLATE template0;')
        cmd=['docker','exec','--interactive',r.container,'psql','-h','/tmp',
             '-U','supabase_admin','-d','synthetic_extension_reference','-X','-qAt','-v','ON_ERROR_STOP=1']
        reference=Psql(cmd,dict(os.environ),r.logs/'synthetic-reference.log')
        reference.query('SET search_path=pg_catalog; BEGIN; ALTER ROLE postgres WITH SUPERUSER; '
                        'SET SESSION AUTHORIZATION postgres; CREATE SCHEMA extensions AUTHORIZATION postgres; '
                        "CREATE EXTENSION pgcrypto WITH SCHEMA extensions VERSION '1.3'; "
                        "CREATE EXTENSION \"uuid-ossp\" WITH SCHEMA extensions VERSION '1.1'; "
                        'RESET SESSION AUTHORIZATION; ALTER ROLE postgres WITH NOSUPERUSER; COMMIT;')
        query="""SELECT coalesce(json_agg(t ORDER BY extension,identity),'[]'::json) FROM (
            SELECT e.extname AS extension,
              n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,
              pg_get_userbyid(p.proowner) AS owner,
              (SELECT json_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a) AS acl
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid
              AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
            JOIN pg_extension e ON e.oid=d.refobjid
            WHERE e.extname IN ('pgcrypto','uuid-ossp') AND p.prokind<>'a') t;"""
        native=reference.json(query)
        assert len(native) == 46 and all(x['owner']=='postgres' for x in native)
        assert r.target.json(query) == native
        reference.close(); reference=None
        assert r.target.json(ROLES_SQL) == r.roles
        print('STAGE=46_NATIVE_FUNCTION_OWNERS_AND_ACLS_PASSED',flush=True)
        r.reconcile_extension_schema_acls()
        schemas={x['name']:x for x in r.target.json(SCHEMAS_SQL)}
        assert all(schemas[x['name']]['acl']==x['acl'] for x in r.schemas if x['extension'])
        cfg=r.target.json("SELECT json_build_object('net_loaded',position('pg_net' IN current_setting('shared_preload_libraries'))>0,'cron',current_setting('cron.launch_active_jobs'),'queued',(SELECT count(*) FROM net.http_request_queue));")
        assert cfg == dict(net_loaded=False,cron='off',queued=0)
        print('RESULT=SYNTHETIC_EXACT_BOOTSTRAP_PASSED',flush=True)
    except Exception:
        # This job has only invented settings and rows, no real data or secrets.
        traceback.print_exc(limit=5)
        raise
    finally:
        try:
            if reference is not None: reference.close()
        finally:
            r.cleanup()

if __name__ == '__main__':
    run()
