import {argon2idAsync} from '../vendor/noble-hashes/argon2.js';
import {HttpError} from './auth.mjs';
const encoder=new TextEncoder();let jobs=0,tail=Promise.resolve();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=text=>Uint8Array.from(text.match(/../g),b=>parseInt(b,16));
export function validPassword(password){return typeof password==='string'&&Array.from(password).length>=15&&Array.from(password).length<=128&&encoder.encode(password).length<=512}
async function derive(password,salt){
 if(jobs>=3)throw new HttpError(503,'auth_busy');jobs++;const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;
 const bytes=encoder.encode(password);
 try{return await argon2idAsync(bytes,salt,{m:19456,t:2,p:1,dkLen:32,asyncTick:10,maxmem:24*1024*1024})}finally{bytes.fill(0);jobs--;release()}
}
export async function hashPassword(password){
 if(!validPassword(password))throw new HttpError(400,'invalid_password');
 const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await derive(password,salt);
 const encoded=`argon2id:v19:m19456:t2:p1:${hex(salt)}:${hex(hash)}`;hash.fill(0);return encoded;
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||encoder.encode(password).length>512)return false;
 const match=/^argon2id:v19:m19456:t2:p1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(encoded||'');
 if(!match)throw new HttpError(503,'password_record_invalid');
 const actual=await derive(password,unhex(match[1])),expected=unhex(match[2]);let diff=0;
 for(let i=0;i<32;i++)diff|=actual[i]^expected[i];actual.fill(0);return diff===0;
}
// Same KDF work for unknown identities. No dummy account/password is accepted.
export const dummyPasswordHash='argon2id:v19:m19456:t2:p1:'+'00'.repeat(16)+':'+'00'.repeat(32);
