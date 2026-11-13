import { mkdir, cp, writeFile, readdir, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const target = resolve(process.argv[2] || 'work/hosting');
// Only build into an empty/new path. Never erase config, uploads or a previous deployment.
await mkdir(target, { recursive: false });
await mkdir(join(target,'public_html'));
await cp('dist',join(target,'public_html'),{recursive:true});
await cp('php/public',join(target,'public_html'),{recursive:true});
const privateDir=join(target,'fillico-private');
await mkdir(privateDir);
for(const name of ['src','migrations','config.example.php','.htaccess'])await cp(join('php',name),join(privateDir,name),{recursive:true});
await mkdir(join(privateDir,'uploads'));
await writeFile(join(privateDir,'uploads','.htaccess'),'Require all denied\n');
const { defaultSettings } = await import('../server/seed.ts');
await writeFile(join(privateDir,'defaults.json'),JSON.stringify(defaultSettings,null,2)+'\n');
await mkdir(join(target,'guides'));
for(const file of ['HUONG-DAN.md','CHECKLIST.md','KIEM-THU.md','KHAO-SAT.md','KIEN-TRUC.md'])await cp(join('docs',file),join(target,'guides',file));
await cp('tools/reset-password.php',join(target,'guides/reset-password.php'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await writeFile(join(target,'BUILD.json'),JSON.stringify({sourceCommit:sha,builtAt:new Date().toISOString(),runtime:'PHP 8.3+, MySQL 8.0.16+ / MariaDB 10.6+',frontend:'React/Vite',layout:'public_html + sibling fillico-private'},null,2)+'\n');
async function permissions(dir){await chmod(dir,0o755);for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await permissions(p);else await chmod(p,0o644);}}
await permissions(target);await chmod(privateDir,0o750);await chmod(join(privateDir,'uploads'),0o700);
console.log(`Hosting files: ${target}`);
