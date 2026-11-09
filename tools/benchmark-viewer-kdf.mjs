import {hashPassword,verifyPassword} from '../media-worker/src/viewer-password.mjs';
const samples=[];
for(let i=0;i<3;i++){
 const cpu=process.cpuUsage(),start=performance.now();
 const encoded=await hashPassword('LOCAL benchmark only');
 const used=process.cpuUsage(cpu);
 samples.push({wallMs:Math.round(performance.now()-start),nodeCPUms:Math.round((used.user+used.system)/1000)});
 if(!await verifyPassword('LOCAL benchmark only',encoded))throw Error('Verification failed');
}
console.log(JSON.stringify({algorithm:'Argon2id',memoryKiB:19456,passes:2,parallelism:1,samples,note:'Local Node process CPU, not Cloudflare invocation CPU; workerd tests do not enforce cloud plan limits',remoteRequests:0}));
