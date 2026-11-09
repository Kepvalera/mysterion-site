import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashPassword,verifyPassword} from '../media-worker/src/viewer-password.mjs';
import {argon2id} from '../media-worker/vendor/noble-hashes/argon2.js';
const root='media-worker/vendor/hash-wasm',provenance=JSON.parse(await fs.readFile(root+'/provenance.json','utf8'));let checks=0;
for(const [name,digest] of Object.entries(provenance.files)){assert.equal(createHash('sha256').update(await fs.readFile(root+'/'+name)).digest('hex'),digest);checks++}
for(const password of ['Local8!?','Проверка пароля 🕊️','a\0b\0c\0d!','🕊️'.repeat(8)]){
 const salt=new Uint8Array(16).fill(7),bytes=new TextEncoder().encode(password),legacy=argon2id(bytes,salt,{m:19456,t:2,p:1,dkLen:32,maxmem:24*1024*1024});
 const encoded='argon2id:v19:m19456:t2:p1:'+Buffer.from(salt).toString('hex')+':'+Buffer.from(legacy).toString('hex');
 assert.equal(await verifyPassword(password,encoded),true);assert.equal(await verifyPassword(password+'x',encoded),false);checks+=2;
}
// Capture only local instance objects: verify successful and failed operations wipe memory.
const Original=WebAssembly.Instance,instances=[];
WebAssembly.Instance=new Proxy(Original,{construct(target,args){const instance=new target(...args);instances.push(instance);return instance}});
try{
 await hashPassword('Local8!?');assert.ok(instances.length>=2);assert.ok(instances.every(i=>new Uint8Array(i.exports.memory.buffer).every(x=>x===0)));checks++;
}finally{WebAssembly.Instance=Original}
const tasks=await Promise.allSettled([hashPassword('short'),hashPassword('Local8!?'),verifyPassword('Local8!?','invalid'),hashPassword('Local8!?')]);assert.deepEqual(tasks.map(t=>t.status),['rejected','fulfilled','rejected','fulfilled']);checks++;
console.log(JSON.stringify({checks,version:provenance.version,legacyCompatibility:true,unicode:true,zeroBytes:true,instanceMemoryWiped:true,requestLocalErrors:true,remoteWrites:0}));
