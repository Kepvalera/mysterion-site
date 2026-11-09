import {createArgon2} from '../vendor/hash-wasm/argon2.mjs';
import {HttpError} from './auth.mjs';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=text=>Uint8Array.from(text.match(/../g),b=>parseInt(b,16));
export function validPassword(password){return typeof password==='string'&&Array.from(password).length>=8&&Array.from(password).length<=128&&encoder.encode(password).length<=512}
async function derive(password,salt){
 // All caches, instances and internal mutexes belong to this operation. No
 // Promise from another request can stall it. Parameters and hash encoding stay fixed.
 const bytes=encoder.encode(password),engine=createArgon2();
 try{return await engine.argon2id({password:bytes,salt,memorySize:19456,iterations:2,parallelism:1,hashLength:32,outputType:'binary'})}finally{bytes.fill(0);engine.destroy()}
}
export async function hashPassword(password){
 if(!validPassword(password))throw new HttpError(400,'invalid_password');
 const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await derive(password,salt);
 const encoded=`argon2id:v19:m19456:t2:p1:${hex(salt)}:${hex(hash)}`;hash.fill(0);return encoded;
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length===0||encoder.encode(password).length>512)return false;
 const match=/^argon2id:v19:m19456:t2:p1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(encoded||'');
 if(!match)throw new HttpError(503,'password_record_invalid');
 const actual=await derive(password,unhex(match[1])),expected=unhex(match[2]);let diff=0;
 for(let i=0;i<32;i++)diff|=actual[i]^expected[i];actual.fill(0);return diff===0;
}
// Same KDF work for unknown identities. No dummy account/password is accepted.
export const dummyPasswordHash='argon2id:v19:m19456:t2:p1:'+'00'.repeat(16)+':'+'00'.repeat(32);
