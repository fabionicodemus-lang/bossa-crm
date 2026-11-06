import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const folder = resolve(project, 'extensions/bossa-whatsapp-web');
const output = resolve(project, 'public/downloads');
mkdirSync(output, { recursive: true });
const archive = resolve(output, 'bossa-whatsapp-web.zip');
rmSync(archive, { force: true });
execFileSync('zip', ['-q', '-X', '-r', archive,
  'manifest.json', 'crm-bridge.js', 'background.js', 'whatsapp-content.js', 'popup.html', 'README.md'],
{ cwd: folder, stdio: 'inherit' });
console.log('Extensão empacotada em public/downloads/bossa-whatsapp-web.zip');
