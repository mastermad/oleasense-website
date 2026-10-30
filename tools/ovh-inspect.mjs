// Lecture seule : vérifie les droits du jeton et liste les enregistrements DNS actuels.
import { loadEnv, createClient } from './ovh.mjs';

const envFile = process.argv[2] ?? 'C:/workspaces/perso/oleasense/.secrets/ovh.env';
loadEnv(envFile);
const call = createClient();

const exposed = '0a3d224f7998c2e9';
console.log(`Clé d'application identique à celle exposée dans le chat : ${process.env.OVH_APPLICATION_KEY === exposed ? 'OUI (à régénérer)' : 'non'}`);

for (const zone of ['oleasense.com', 'oleasense.fr']) {
  console.log(`\n== ${zone} ==`);
  try {
    const info = await call('GET', `/domain/zone/${zone}`);
    console.log(`zone : ${info.name}, serveurs DNS : ${(info.nameServers ?? []).join(', ')}`);
    const ids = await call('GET', `/domain/zone/${zone}/record`);
    for (const id of ids) {
      const record = await call('GET', `/domain/zone/${zone}/record/${id}`);
      console.log(`${String(id).padEnd(12)} ${record.fieldType.padEnd(6)} ${(record.subDomain || '@').padEnd(10)} ${record.target}  (ttl ${record.ttl})`);
    }
  } catch (error) {
    console.log(`ERREUR : ${error.message}`);
  }
}

for (const zone of ['oleasense.com', 'oleasense.fr']) {
  try {
    const redirections = await call('GET', `/email/domain/${zone}/redirection`);
    console.log(`\nredirections courriel ${zone} : ${redirections.length}`);
  } catch (error) {
    console.log(`\nredirections courriel ${zone} : ${error.message.slice(0, 120)}`);
  }
}
