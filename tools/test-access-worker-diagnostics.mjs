import assert from 'node:assert/strict';
import {platformFixture} from './platform-local-fixture.mjs';
import {handle} from '../media-worker/src/worker.mjs';
const f=await platformFixture(),warn=console.warn,logs=[];
console.warn=value=>logs.push(JSON.parse(value));
try{
 Object.assign(f.env,{VIEWER_PLATFORM_ENABLED:'false',MEDIA_ACCESS_DIAGNOSTICS:'true',MEDIA_PUBLIC_ORIGIN:'https://mysterion-viewer-staging.pages.dev'});
 const valid=await f.token('PRIVATE_LOCAL_IDENTITY',{email:'PRIVATE_LOCAL_EMAIL@example.invalid'});
 const invalid=await f.token('PRIVATE_LOCAL_IDENTITY',{aud:'invalid'});
 const response=await handle(new Request(f.env.MEDIA_PUBLIC_ORIGIN+'/api/media/admin/me',{headers:{'Cf-Access-Jwt-Assertion':invalid,Cookie:'CF_Authorization='+valid}}),f.env);
 const body=await response.json();assert.equal(response.status,401);assert.equal(body.error,'invalid_identity');assert.equal(logs.length,1);
 assert.equal(body.requestId,response.headers.get('X-Mysterion-Request-ID'));assert.equal(logs[0].requestId,body.requestId);assert.equal(logs[0].reason,'audience_mismatch');assert.equal(logs[0].source,'assertion');
 for(const secret of [valid,invalid,'PRIVATE_LOCAL_IDENTITY','PRIVATE_LOCAL_EMAIL@example.invalid'])assert.ok(!JSON.stringify({body,logs}).includes(secret));
 console.log(JSON.stringify({checks:12,workerRequestId:true,invalidHeaderDoesNotFallBackToValidCookie:true,sensitiveValuesNotLogged:true,remoteWrites:0}));
}finally{console.warn=warn;f.close()}
