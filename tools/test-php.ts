import { execFileSync } from 'node:child_process';
import { phpBackend } from './php-fixture.js';
process.env.FILLICO_TEST_BACKEND='php';
const mode=process.argv[2]||'all';
if(mode==='all'||mode==='api')execFileSync(process.execPath,['--import','tsx','--test','--test-concurrency=1','server/app.test.ts','php-tests/integration.test.ts'],{stdio:'inherit',env:process.env});
if(mode==='all'||mode==='layout')execFileSync(process.execPath,['tools/test-layout.mjs'],{stdio:'inherit',env:process.env});
if(mode==='all'||mode==='browser'){
 const b=await phpBackend();
 try{execFileSync('npm',['run','test:e2e'],{stdio:'inherit',env:{...process.env,FILLICO_E2E_DATA_DIR:b.dataDir}});}finally{await b.close();}
}
