# Verificar cópia privada do Bossa CRM em um PC Windows

**Nunca envie a chave de descriptografia para ChatGPT, GitHub, Vercel ou Supabase.**
Esta verificação deve ocorrer somente no seu PC. O procedimento não modifica o
CRM de produção e não deixa SQL, clientes ou Storage em texto claro no disco.

## Arquivos a baixar da Biblioteca do ChatGPT

1. Em `/Bossa CRM/`, baixe `Bossa_CRM_Recuperacao_20261103_AGUARDA_CONFERENCIA.zip`
   (aproximadamente 358 MB, que contém apenas `recovery.tar.gz.age`).
2. Na raiz da Biblioteca, baixe `Bossa_CRM_Chave_Privada_Backup_20261030.txt`.
   Guarde esta chave em local privado e **não a inclua em capturas de tela**.
3. Neste repositório, baixe `ops/crm-free-recovery/verify_private_archive.py`
   clicando em **Raw → Salvar como**, usando exatamente o nome `.py`.
4. Coloque os três arquivos na pasta Downloads (ou ajuste os caminhos no comando).

## Dependências locais

Abra o PowerShell e confira `py -3 --version` e `age --version`.
Se não houver Python, instale Python 3 a partir de python.org.
Para instalar age pelo Windows Package Manager, use:

```powershell
winget install --id FiloSottile.age --exact
```

Feche e reabra o PowerShell se o comando age ainda não estiver disponível.

## Executar offline

```powershell
Set-Location (Join-Path $HOME 'Downloads')
py -3 .\verify_private_archive.py --archive '.\Bossa_CRM_Recuperacao_20261103_AGUARDA_CONFERENCIA.zip' --identity '.\Bossa_CRM_Chave_Privada_Backup_20261030.txt'
```

Resultado esperado: JSON com `state = PRIVATE_RECOVERY_PACKAGE_VERIFIED`,
`authenticated_decryption = true`, `manifest_file_hashes_verified = true`,
`migrations_rehearsed = 13` e `production_changed_by_verifier = false`.

A ferramenta exige a soma SHA-256 **exata** do ciphertext gerado no GitHub
(`6ef6e6aacc1c5f7c165ca9e23f03f7be09e30e52435d52d0dbf4132ce99739b5`),
tamanho `357688336` bytes, projeto Bossa correto, restauração verificada
e 13 migrações com testes aprovados. Em qualquer erro, ela retorna código 1.
Se o processo falhar, envie só o campo `reason` exibido. **Nunca envie a chave,
o ZIP nem SQL extraído.**

## Sem alteração de produção

Esta aprovação só confirma a portabilidade da cópia criada em 3/11/2026.
A próxima etapa de release é manutenção restrita de logs antigos, verificação
de cotas, implantação controlada das 13 migrações e publicação do código
comercial aprovado (commit `a6607f0a6d40483c5767e8155ff55c95c62fc8fb`).
A produção anterior continua operacional até a troca autorizada.
