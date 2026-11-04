import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';

const exec = promisify(execFile);
export const localDocker = ['--host=unix:///var/run/docker.sock'];
const env = {...process.env};
for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete env[key];
export const docker = async args => (await exec('docker', [...localDocker, ...args], {env, timeout: 30000, maxBuffer: 12e6})).stdout.trim();
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function startDatabase() {
  const container = `bossa-commercial-integrated-${process.pid}`;
  const database = 'commercial_repository_homologation_test';
  await docker(['run','--rm','-d','--network','none','--name',container,
    '-e','POSTGRES_PASSWORD=isolated-test-only','-e',`POSTGRES_DB=${database}`,
    'postgres:17','-c','log_min_error_statement=panic','-c','wal_level=logical']);
  const sql = script => new Promise((resolve,reject) => {
    const child = spawn('docker',[...localDocker,'exec','-i',container,'psql','-X','-q','-A','-t',
      '-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',database],{env});
    let out='',err='';
    child.stdout.on('data',b=>out+=b); child.stderr.on('data',b=>err+=b);
    child.on('error',reject);
    child.on('close',code=>code?reject(Error(err.trim())):resolve(out.trim()));
    child.stdin.on('error',()=>{}); child.stdin.end(script);
  });
  const close = () => docker(['rm','-f',container]).catch(()=>{});
  try {
    // TCP readiness avoids the temporary initdb server's Unix socket.
    for (let attempt=0;attempt<100;attempt++) {
      try { await docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d',database]); break; }
      catch { if(attempt===99) throw Error('Isolated PostgreSQL startup failed'); await pause(150); }
    }
    await sql('select 1;');
    return {container,database,sql,close};
  } catch(error) { await close(); throw error; }
}

export function session(user, script, role='authenticated') {
  const claims = JSON.stringify(user?{sub:user,role}:{role}).replaceAll("'","''");
  return `begin; set local lock_timeout='8s'; set local statement_timeout='20s';
    set local role ${role};
    do $$ begin perform set_config('request.jwt.claims','${claims}',true); end $$;
    ${script} commit;`;
}
export const literal = value => `'${String(value).replaceAll("'","''")}'`;
export const json = value => `${literal(JSON.stringify(value))}::jsonb`;
