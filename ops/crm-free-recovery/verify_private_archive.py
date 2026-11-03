#!/usr/bin/env python3
"""Verificação privada do backup Bossa CRM: nenhuma chave nem dado sai do PC.

Uso Windows/macOS/Linux:
  python verify_private_archive.py --archive backup.zip --identity private-age-key.txt

Requer age/age.exe no PATH ou junto deste script.
Não extrai texto claro para arquivos. Usa um arquivo TEMPORÁRIO somente para
o ciphertext .age quando a entrada é um ZIP do GitHub. Limpa no final.

Certifica: SHA-256 dos bytes criptografados, descriptografia autenticada,
integridade dos membros TAR segundo manifest.json, estado da restauração e
aprovação das 13 migrações ensaiadas. Não executa migrações nem altera o CRM.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

CIPHER_SHA256 = "6ef6e6aacc1c5f7c165ca9e23f03f7be09e30e52435d52d0dbf4132ce99739b5"
CIPHER_BYTES = 357688336
PROJECT_REF = "oridhneerxutcjsvwuju"
SUCCESS_STATUS = "PASSED_SCHEMA_ACL_AND_COMPATIBILITY_GATES"
ENTRY_NAME = "recovery.tar.gz.age"
MAX_MANIFEST_BYTES = 12 * 1024 * 1024


class VerificationError(Exception):
    pass


def require(value: bool, code: str) -> None:
    if not value:
        raise VerificationError(code)


def digest_and_copy(input_file, output_file) -> tuple[str, int]:
    digest = hashlib.sha256()
    total = 0
    while True:
        block = input_file.read(1024 * 1024)
        if not block:
            break
        total += len(block)
        digest.update(block)
        if output_file is not None:
            output_file.write(block)
    return digest.hexdigest(), total


def locate_age(executable: str | None) -> str:
    if executable:
        candidate = Path(executable).expanduser()
        require(candidate.is_file(), "AGE_EXECUTABLE_NOT_FOUND")
        return str(candidate.resolve())
    found = shutil.which("age") or shutil.which("age.exe")
    if found:
        return found
    for name in ("age.exe", "age"):
        candidate = Path(__file__).resolve().parent / name
        if candidate.is_file():
            return str(candidate)
    raise VerificationError("AGE_NOT_INSTALLED")


def extract_verified_ciphertext(source: Path, temp_dir: Path,
                                expected_hash: str, expected_bytes: int) -> Path:
    temp_cipher = temp_dir / "verified-encrypted-payload.age"
    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source, "r") as archive:
            entries = [m for m in archive.infolist() if not m.is_dir()]
            require(len(entries) == 1 and entries[0].filename == ENTRY_NAME,
                    "UNEXPECTED_ZIP_MEMBERS")
            require(entries[0].file_size == expected_bytes, "ZIP_CIPHERTEXT_SIZE_MISMATCH")
            with archive.open(entries[0], "r") as body, temp_cipher.open("wb") as output:
                actual, total = digest_and_copy(body, output)
    elif source.suffix.lower() == ".age":
        with source.open("rb") as body:
            actual, total = digest_and_copy(body, None)
        temp_cipher = source
    else:
        raise VerificationError("EXPECTED_ZIP_OR_AGE_INPUT")
    require(total == expected_bytes, "CIPHERTEXT_SIZE_MISMATCH")
    require(actual == expected_hash, "CIPHERTEXT_SHA256_MISMATCH")
    return temp_cipher


def stream_verify_tar(ciphertext: Path, identity: Path, age_bin: str,
                      project: str, expected_migrations: int) -> dict:
    command = [age_bin, "--decrypt", "--identity", str(identity), str(ciphertext)]
    digests: dict[str, str] = {}
    manifest = None
    tar_bytes = 0
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert proc.stdout is not None
        assert proc.stderr is not None
        with tarfile.open(fileobj=proc.stdout, mode="r|gz") as archive:
            for member in archive:
                path = PurePosixPath(member.name)
                require(not path.is_absolute() and ".." not in path.parts
                        and len(path.parts) >= 1 and path.parts[0] == "recovery",
                        "UNEXPECTED_ARCHIVE_PATH")
                if member.isdir():
                    continue
                require(member.isfile(), "NON_REGULAR_ARCHIVE_MEMBER")
                require(len(path.parts) >= 2, "INVALID_ARCHIVE_MEMBER")
                relative = path.relative_to("recovery").as_posix()
                require(relative not in digests and
                        (manifest is None or relative != "manifest.json"),
                        "DUPLICATED_ARCHIVE_MEMBER")
                item = archive.extractfile(member)
                require(item is not None, "UNREADABLE_ARCHIVE_MEMBER")
                if relative == "manifest.json":
                    require(member.size <= MAX_MANIFEST_BYTES, "MANIFEST_TOO_LARGE")
                    payload = item.read(MAX_MANIFEST_BYTES + 1)
                    require(len(payload) == member.size, "MANIFEST_TRUNCATED")
                    manifest = json.loads(payload.decode("utf-8"))
                else:
                    digest, length = digest_and_copy(item, None)
                    tar_bytes += length
                    require(length == member.size, "ARCHIVE_FILE_TRUNCATED")
                    digests[relative] = digest

        # Crucial: drain age stdout to EOF so the final authenticated chunk
        # is checked even if tarfile stopped at the TAR end-of-archive marker.
        while proc.stdout.read(1024 * 1024):
            pass
        code = proc.wait(timeout=60)
        require(code == 0, "AGE_AUTHENTICATION_FAILED")
    except Exception:
        proc.kill()
        try:
            proc.communicate(timeout=10)
        except Exception:
            pass
        raise
    finally:
        if proc.stdout:
            proc.stdout.close()
        if proc.stderr:
            proc.stderr.close()

    require(isinstance(manifest, dict), "MANIFEST_NOT_FOUND")
    expected = manifest.get("file_sha256")
    require(isinstance(expected, dict) and expected, "MANIFEST_HASHES_MISSING")
    require(set(digests) == set(expected), "ARCHIVE_FILE_INVENTORY_MISMATCH")
    require(all(digests[key] == expected[key] for key in digests),
            "ARCHIVE_FILE_HASH_MISMATCH")
    require("database.dump" in digests, "DATABASE_DUMP_MISSING")
    require("vault-root.key" in digests, "VAULT_RECOVERY_KEY_MISSING")
    require(manifest.get("project_ref") == project, "WRONG_SUPABASE_PROJECT")
    require(manifest.get("state") == "RESTORE_VERIFIED", "RESTORE_NOT_APPROVED")
    require(manifest.get("network_none") is True, "RESTORE_NETWORK_NOT_ISOLATED")
    require(manifest.get("cron_launch_active_jobs") == "off", "RESTORE_CRON_NOT_DISABLED")
    require(manifest.get("pg_net_preloaded") is False, "RESTORE_HTTP_WORKER_ACTIVE")
    migration = manifest.get("migration_rehearsal", {})
    require(isinstance(migration, dict), "MIGRATION_REHEARSAL_MISSING")
    require(migration.get("status") == SUCCESS_STATUS, "MIGRATION_GATES_NOT_PASSED")
    require(migration.get("baseline_unchanged") is True, "RECOVERY_BASELINE_CHANGED")
    require(migration.get("sql_committed") == expected_migrations and
            migration.get("ledger_recorded") == expected_migrations,
            "MIGRATIONS_NOT_ALL_TESTED")
    require(migration.get("human_acceptance_changed") is False,
            "HUMAN_ACCEPTANCE_UNEXPECTEDLY_CHANGED")
    return {
        "state": "PRIVATE_RECOVERY_PACKAGE_VERIFIED",
        "cipher_sha256_verified": True,
        "authenticated_decryption": True,
        "manifest_file_hashes_verified": True,
        "restoration_verified_offline": True,
        "migrations_rehearsed": expected_migrations,
        "files_checked": len(digests),
        "plaintext_bytes_streamed": tar_bytes,
        "project_ref_match": True,
        "production_changed_by_verifier": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica backup Bossa sem gravar dados abertos.")
    parser.add_argument("--archive", type=Path, required=True, help="ZIP de GitHub ou .age")
    parser.add_argument("--identity", type=Path, required=True, help="Arquivo de chave privada age")
    parser.add_argument("--age-bin", default=None, help="Caminho para age.exe se não estiver no PATH")
    parser.add_argument("--sha256", default=CIPHER_SHA256)
    parser.add_argument("--bytes", type=int, default=CIPHER_BYTES)
    parser.add_argument("--project", default=PROJECT_REF)
    parser.add_argument("--migrations", type=int, default=13)
    args = parser.parse_args()

    try:
        require(args.archive.is_file() and args.identity.is_file(), "INPUT_FILES_NOT_FOUND")
        require(len(args.sha256) == 64 and args.bytes > 0, "INVALID_VERIFICATION_EXPECTATIONS")
        age_bin = locate_age(args.age_bin)
        with tempfile.TemporaryDirectory(prefix="bossa-encrypted-verify-") as temp:
            cipher = extract_verified_ciphertext(
                args.archive, Path(temp), args.sha256.lower(), args.bytes)
            report = stream_verify_tar(
                cipher, args.identity, age_bin, args.project, args.migrations)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (VerificationError, OSError, ValueError, zipfile.BadZipFile,
            tarfile.TarError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        # Never print private paths, credentials, catalog objects or SQL.
        if isinstance(error, VerificationError):
            reason = str(error)
        else:
            reason = error.__class__.__name__
        print(json.dumps({"state": "FAILED", "reason": reason}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
