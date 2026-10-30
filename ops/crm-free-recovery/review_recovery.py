#!/usr/bin/env python3
"""Read-only export, offline recovery, and private encrypted diagnostic delivery.

An encrypted review package is NOT an approved recovery point. Every original
verification gate remains mandatory. No production migration is run here.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import shutil
import traceback
from runner import (Recovery, GateFailure, gate, ident, stage, dump_json,
                    SCHEMAS_SQL, ROLES_SQL, CATALOG_SQL, DATABASE_SQL)


def keyed_diff(expected, actual, key):
    a = {key(row): row for row in expected}
    b = {key(row): row for row in actual}
    result = []
    for name in sorted(set(a) | set(b)):
        if a.get(name) != b.get(name):
            left, right = a.get(name), b.get(name)
            fields = sorted(set(left or {}) | set(right or {}))
            result.append({'key': name, 'differences': {
                field: {'expected': (left or {}).get(field),
                        'actual': (right or {}).get(field)}
                for field in fields if (left or {}).get(field) != (right or {}).get(field)}})
    return result


def parse_acl(items, owner, allowed):
    result = {}
    for item in items or []:
        m = re.fullmatch(r'([A-Za-z_][A-Za-z_0-9]*|)=([A-Za-z*]*)/([A-Za-z_][A-Za-z_0-9]*)', item)
        gate(m is not None, 'review_acl_requires_quoted_role_adapter')
        role, letters, grantor = m.groups()
        gate(grantor == owner, 'review_acl_nonowner_grantor')
        rights = []
        i = 0
        while i < len(letters):
            gate(letters[i] in allowed, 'review_acl_unsupported_privilege')
            grantable = i + 1 < len(letters) and letters[i+1] == '*'
            rights.append((allowed[letters[i]], grantable))
            i += 2 if grantable else 1
        result[role] = rights
    return result


class ReviewRecovery(Recovery):
    def apply_exact_acl(self, kind, name, expected, actual, owner, allowed):
        gate(self.manifest.get('network_none') is True and
             self.manifest.get('pg_net_empty_bootstrap_then_disabled') is True,
             'acl_recovery_requires_offline_clone')
        if expected == actual:
            return
        gate(expected is not None, 'null_acl_requires_effective_comparison')
        source = parse_acl(expected, owner, allowed)
        clone = parse_acl(actual, owner, allowed)
        target = kind + ' ' + ident(name)
        statements = ['BEGIN;', 'SET SESSION AUTHORIZATION ' + ident(owner) + ';']
        for role in sorted((set(source) | set(clone)) - {owner}):
            principal = 'PUBLIC' if role == '' else ident(role)
            statements.append('REVOKE ALL PRIVILEGES ON ' + target + ' FROM ' + principal + ' CASCADE;')
        for role, rights in source.items():
            principal = 'PUBLIC' if role == '' else ident(role)
            for privilege, grantable in rights:
                statements.append('GRANT ' + privilege + ' ON ' + target + ' TO ' + principal +
                                  (' WITH GRANT OPTION;' if grantable else ';'))
        statements.extend(['RESET SESSION AUTHORIZATION;', 'COMMIT;'])
        self.target.query(' '.join(statements))

    def restore(self):
        super().restore()
        stage('RECONCILE_ORIGINAL_SCHEMA_AND_DATABASE_GRANTS_OFFLINE')
        actual = {row['name']: row for row in self.target.json(SCHEMAS_SQL)}
        for expected in self.schemas:
            row = actual.get(expected['name'])
            gate(row is not None and row['owner'] == expected['owner'] and
                 row['extension'] == expected['extension'], 'schema_identity_changed')
            self.apply_exact_acl('SCHEMA', expected['name'], expected['acl'], row['acl'],
                                 expected['owner'], {'U': 'USAGE', 'C': 'CREATE'})
        database = self.target.json(DATABASE_SQL)
        gate(database['owner'] == self.database['owner'], 'database_owner_changed')
        self.apply_exact_acl('DATABASE', 'postgres', self.database['acl'], database['acl'],
                             self.database['owner'], {'C':'CREATE','c':'CONNECT','T':'TEMPORARY'})
        self.manifest['explicit_schema_database_grants_restored'] = True

    def write_private_diagnostics(self):
        diagnostics = {
            'schemas': keyed_diff(self.schemas, self.target.json(SCHEMAS_SQL), lambda r: r['name']),
            'roles': keyed_diff(self.roles, self.target.json(ROLES_SQL), lambda r: r['rolname']),
            'catalog': keyed_diff(self.catalog, self.target.json(CATALOG_SQL), lambda r: r['kind'] + ':' + r['key']),
            'database': {'expected': self.database, 'actual': self.target.json(DATABASE_SQL)},
            'warning': 'PRIVATE DIAGNOSTIC. No restore approval or production release is implied.'}
        dump_json(self.payload / 'private-diagnostics.json', diagnostics)

    def deliver_review(self):
        # Only already encrypted bytes are exposed. The decryption key remains
        # outside GitHub. The package is explicitly unapproved when any gate fails.
        status = ('RESTORE_VERIFIED_AWAITING_PRIVATE_DECRYPTION' if
                  self.manifest['state'] == 'RESTORE_VERIFIED' else
                  'ENCRYPTED_REVIEW_ONLY_RESTORE_NOT_APPROVED')
        dump_json(self.encrypted.parent / 'receipt.json', {
            'state': status, 'ciphertext_sha256': self.cipher_hash,
            'ciphertext_bytes': self.encrypted.stat().st_size,
            'release_allowed': False})
        print('CIPHERTEXT_SHA256=' + self.cipher_hash, flush=True)
        print('CIPHERTEXT_BYTES=' + str(self.encrypted.stat().st_size), flush=True)
        print('RESULT=' + status, flush=True)
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                output.write('restore_verified=' + str(self.manifest['state'] == 'RESTORE_VERIFIED').lower() + '\n')


def main():
    r = ReviewRecovery()
    try:
        r.preflight()
        r.source_connect()
        r.capture()
        r.storage()
        r.start_target()
        r.restore()
        try:
            r.verify()
        except GateFailure as exc:
            # Exporting for private analysis does not remove or waive a gate.
            r.manifest['state'] = 'RESTORE_VALIDATION_FAILED'
            r.manifest['failure_code'] = str(exc)
            r.write_private_diagnostics()
            stage('PRIVATE_DIAGNOSTIC_CAPTURED_RELEASE_BLOCKED')
        else:
            r.rehearse_release()
        for filename in ('runner.py', 'review_recovery.py', 'migration_rehearsal.py'):
            shutil.copyfile(Path(__file__).with_name(filename), r.payload / ('recovery-tool-' + filename))
        r.encrypt()
        r.deliver_review()
        return 0
    except Exception as exc:
        (r.logs / 'review-failure.txt').write_text(traceback.format_exc())
        code = str(exc) if isinstance(exc, GateFailure) else 'unexpected_review_failure'
        print('RESULT=FAILED; CODE=' + code, flush=True)
        return 1
    finally:
        r.cleanup()


if __name__ == '__main__':
    raise SystemExit(main())
