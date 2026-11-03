"""Exact role/extension bootstrap for an EMPTY, network-none recovery clone.

No source connection, credentials, export or delivery is performed here. All
original restore verification gates remain in runner.Recovery unchanged.
"""
from __future__ import annotations

import json
import re
from runner import Recovery as BaseRecovery, EXPECTED_EXTENSIONS, ROLES_SQL, gate, ident, literal, stage

LIST_SETTINGS = frozenset({
    'local_preload_libraries', 'search_path', 'session_preload_libraries',
    'shared_preload_libraries', 'temp_tablespaces', 'unix_socket_directories',
})
MANAGED_BOOTSTRAP = frozenset({'pg_stat_statements', 'pgcrypto', 'uuid-ossp'})


def setting_sql(prefix: str, key: str, value: str) -> str:
    gate(re.fullmatch(r'[a-zA-Z_][a-zA-Z_0-9.]*', key), 'invalid_bootstrap_setting')
    if key.lower() in LIST_SETTINGS:
        # A comma-separated GUC must not be quoted as one identifier. FROM
        # CURRENT preserves the native list; the local value rolls back.
        return ('BEGIN; SELECT pg_catalog.set_config(' + literal(key) + ',' + literal(value)
                + ',true); ' + prefix + ' SET ' + key + ' FROM CURRENT; COMMIT;')
    return prefix + ' SET ' + key + ' TO ' + literal(value) + ';'


class Recovery(BaseRecovery):
    def assert_empty_offline_target(self) -> None:
        gate(self.target is not None and self.source is None, 'bootstrap_source_must_be_closed')
        gate(self.manifest.get('network_none') is True, 'bootstrap_isolation_not_attested')
        # Prove that this SQL process executes inside this run's own container,
        # rather than relying solely on a caller-supplied manifest flag.
        command = self.target.proc.args
        gate(isinstance(command, list) and command[:4] ==
             ['docker', 'exec', '--interactive', self.container], 'bootstrap_target_process_invalid')
        info = json.loads(self.run(['docker', 'inspect', self.container]))[0]
        gate(info['HostConfig']['NetworkMode'] == 'none'
             and not info['HostConfig'].get('PortBindings'), 'bootstrap_target_has_network')
        config = self.target.json("SELECT json_build_object('listen',current_setting('listen_addresses'),'cron',current_setting('cron.launch_active_jobs'),'strings',current_setting('standard_conforming_strings'),'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','m','f')));")
        gate(config == {'listen':'', 'cron':'off', 'strings':'on', 'tables':0},
             'bootstrap_requires_empty_sealed_database')

    def prepare_roles_extensions(self) -> None:
        self.assert_empty_offline_target()
        stage('RESTORE_EXACT_ROLES_AND_EXTENSION_OWNERS')
        gate({e['name']:e['version'] for e in self.extensions} == EXPECTED_EXTENSIONS,
             'bootstrap_extension_versions_changed')
        sql = []
        for row in self.roles:
            role = ident(row['rolname'])
            if row['rolname'] != 'supabase_admin':
                sql.append('CREATE ROLE ' + role + ';')
            options = []
            for key, label in (('rolsuper','SUPERUSER'), ('rolinherit','INHERIT'),
                               ('rolcreaterole','CREATEROLE'), ('rolcreatedb','CREATEDB'),
                               ('rolcanlogin','LOGIN'), ('rolreplication','REPLICATION'),
                               ('rolbypassrls','BYPASSRLS')):
                options.append(('' if row[key] else 'NO') + label)
            options.append('CONNECTION LIMIT ' + str(row['rolconnlimit']))
            if row['rolvaliduntil'] is not None:
                options.append('VALID UNTIL ' + literal(row['rolvaliduntil']))
            sql.append('ALTER ROLE ' + role + ' WITH ' + ' '.join(options) + ';')
            for setting in row['rolconfig'] or []:
                key, value = setting.split('=', 1)
                sql.append(setting_sql('ALTER ROLE ' + role, key, value))
        pending, admin_edges = list(self.members), set()
        while pending:
            ready = [m for m in pending if m['grantor'] == 'supabase_admin'
                     or (m['role'], m['grantor']) in admin_edges]
            gate(ready, 'membership_grantor_dependency_requires_adapter')
            for member in ready:
                for option, field in (('ADMIN','admin_option'), ('INHERIT','inherit_option'), ('SET','set_option')):
                    sql.append('GRANT ' + ident(member['role']) + ' TO ' + ident(member['member'])
                               + ' WITH ' + option + ' ' + str(member[field]).lower()
                               + ' GRANTED BY ' + ident(member['grantor']) + ';')
                if member['admin_option']:
                    admin_edges.add((member['role'], member['member']))
                pending.remove(member)
        sql += ['ALTER DATABASE postgres OWNER TO ' + ident(self.db_owner) + ';',
                'ALTER DATABASE postgres CONNECTION LIMIT ' + str(self.database['connection_limit']) + ';']
        (self.payload / 'roles-restore.sql').write_text('\n'.join(sql) + '\n')
        self.target.query('\n'.join(sql))
        for schema in self.schemas:
            if not schema['extension']:
                self.target.query('CREATE SCHEMA IF NOT EXISTS ' + ident(schema['name'])
                                  + ' AUTHORIZATION ' + ident(schema['owner']) + '; ALTER SCHEMA '
                                  + ident(schema['name']) + ' OWNER TO ' + ident(schema['owner']) + ';')
        available = self.target.json("SELECT json_agg(json_build_object('name',name,'version',version,'requires_superuser',superuser,'trusted',trusted)) FROM pg_available_extension_versions;")
        installed = {(x['name'], x['version']):x for x in available}
        roles = {row['rolname']:row for row in self.roles}
        for ext in self.extensions:
            gate((ext['name'], ext['version']) in installed, 'extension_version_unavailable')
            gate(ext['owner'] in roles, 'extension_owner_missing')
            capabilities = installed[(ext['name'], ext['version'])]
            managed = ext['name'] in MANAGED_BOOTSTRAP and ext['owner'] == 'postgres' and not roles['postgres']['rolsuper']
            gate(managed or roles[ext['owner']]['rolsuper'] or not capabilities['requires_superuser']
                 or capabilities['trusted'], 'extension_owner_requires_review')
        self.target.query('DROP EXTENSION plpgsql;')
        for ext in sorted(self.extensions, key=lambda e:(e['name'] != 'plpgsql', e['name'])):
            create = ('SET SESSION AUTHORIZATION ' + ident(ext['owner']) + '; CREATE EXTENSION '
                      + ident(ext['name']) + ' WITH SCHEMA ' + ident(ext['schema'])
                      + ' VERSION ' + literal(ext['version']) + '; RESET SESSION AUTHORIZATION;')
            managed = ext['name'] in MANAGED_BOOTSTRAP and ext['owner'] == 'postgres' and not roles['postgres']['rolsuper']
            if managed:
                # Only the empty sealed clone is affected. Installation and
                # revocation share one transaction; a failure destroys the clone.
                self.target.query('BEGIN; ALTER ROLE postgres WITH SUPERUSER; ' + create
                                  + ' ALTER ROLE postgres WITH NOSUPERUSER; COMMIT;')
                gate(self.target.json("SELECT to_json(rolsuper) FROM pg_roles WHERE rolname='postgres';") is False,
                     'temporary_extension_privilege_not_revoked')
            else:
                self.target.query(create)
        gate(self.target.json(ROLES_SQL) == self.roles, 'exact_bootstrap_roles_mismatch')
        # Inherited implementation stops pg_net before any source rows can be
        # imported, rechecks network isolation and confirms the empty HTTP queue.
        self.disable_pg_net_before_source_restore()
        self.manifest['exact_empty_bootstrap'] = True
