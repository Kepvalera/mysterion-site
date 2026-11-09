// No production target override. Dry-run by default. No registrations or emails.
const origin='https://mysterion-viewer-staging.pages.dev';
if(!process.argv.includes('--run-staging')){
 console.log(JSON.stringify({dryRun:true,origin,requests:5,route:'/api/viewer/login',identity:'random reserved .invalid address',expected:'401 invalid_credentials after full Argon2id dummy verification',writes:'staging rate-limit buckets only; no accounts/sessions/emails',measurement:'Use Cloudflare invocation cpuTime/outcome. HTTP wall time is NOT CPU.'}));
}else{
 const email='cpu-probe-'+crypto.randomUUID()+'@example.invalid';
 for(let n=0;n<5;n++){
  const timestamp=new Date().toISOString(),start=performance.now();
  const r=await fetch(origin+'/api/viewer/login',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Origin:origin,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:JSON.stringify({email,password:'LOCAL CPU probe only 2026!'})});
  let data;try{data=await r.json()}catch{}
  const allowed=['invalid_credentials','viewer_auth_disabled','viewer_auth_not_configured','viewer_service_unavailable','rate_limited'];
  console.log(JSON.stringify({sample:n+1,timestamp,http:r.status,wallMs:Math.round(performance.now()-start),error:allowed.includes(data?.error)?data.error:'nonstandard_response',requestId:/^[a-f0-9-]{36}$/.test(data?.requestId||'')?data.requestId:undefined}));
  if(r.status!==401||data?.error!=='invalid_credentials')break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
}
