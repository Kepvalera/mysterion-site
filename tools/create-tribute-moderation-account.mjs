// Explicit operator task only. No API keys or plaintext passwords are persisted.
// Requires Node 24 with --import ./tools/register-viewer-wasm.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {hashPassword} from '../media-worker/src/viewer-password.mjs';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?null:args[index+1]};
const email=(option('--email')||'').trim().toLowerCase();
const videoIds=(option('--demo-videos')||'').split(',').filter(Boolean);
const execute=args.includes('--execute');
if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)||email.length>254||videoIds.length<1||videoIds.length>10||new Set(videoIds).size!==videoIds.length||videoIds.some(id=>!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))){
 console.error('Usage: node --import ./tools/register-viewer-wasm.mjs tools/create-tribute-moderation-account.mjs --email <owner-controlled-email> --demo-videos <approved-UUIDs-separated-by-commas> [--execute]');process.exit(1);
}
const raw=await fs.readFile(path.join(process.env.APPDATA,'xdg.config','.wrangler/config/default.toml'),'utf8');
const token=raw.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const cache=JSON.parse(await fs.readFile('.wrangler/cache/wrangler-account.json','utf8')),account=cache.account?.id||cache.account_id||cache.id;
if(!token||!account)throw Error('Cloudflare operator session unavailable');
async function api(route,body){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let result;try{result=await response.json()}catch{throw Error('Cloudflare response unavailable')}
 if(!response.ok||!result.success)throw Error('Cloudflare operation failed: HTTP '+response.status);
 return result.result;
}
const project=await api('/pages/projects/mysterion-international');
if(project.name!=='mysterion-international'||project.production_branch!=='main')throw Error('Unexpected Pages target');
const database=project.deployment_configs?.production?.d1_databases?.MEDIA_DB?.id;
if(!/^[a-f0-9-]{36}$/.test(database||''))throw Error('Production MEDIA_DB binding unavailable');
const query=async(sql,params=[])=>{const result=await api('/d1/database/'+database+'/query',{sql,params});if(result.length!==1||!result[0].success)throw Error('Database operation failed');return result[0]};
if((await query('SELECT id FROM viewer_accounts WHERE email=?',[email])).results.length)throw Error('Email already belongs to an account; no existing account will be changed');
const now=Math.floor(Date.now()/1000),expires=now+7*86400,iso=new Date().toISOString();
for(const id of videoIds){
 const rows=(await query("SELECT id FROM videos WHERE id=? AND access='free' AND state='published' AND publish_at<=?",[id,iso])).results;
 if(rows.length!==1)throw Error('An approved demo video is unavailable or not free; no account created');
}
if(!execute){console.log(JSON.stringify({dryRun:true,project:project.name,productionBindingConfirmed:true,emailAvailable:true,approvedDemoVideoCount:videoIds.length,grantDurationDays:7,adminRights:false,passwordHandling:'random initial password is discarded; owner uses existing email password reset',databaseWrites:0}));process.exit(0)}
const id=crypto.randomUUID(),random=crypto.getRandomValues(new Uint8Array(32));
let initial=Buffer.from(random).toString('base64url');random.fill(0);
const passwordHash=await hashPassword(initial);initial='';
const directory=await fs.mkdtemp(path.resolve('output/tribute-moderation-account-'));
const receipt={project:project.name,accountId:id,demoVideoIds:videoIds,expiresAt:new Date(expires*1000).toISOString(),adminRights:false,accountCreated:false,grantsCreated:0,passwordExported:false};
const save=()=>fs.writeFile(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2));
await save();
try{
 const created=await query("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at,first_name,last_name) VALUES (?,?,?,?,'active','ru',?,?,'Tribute','Moderation') ON CONFLICT(email) DO NOTHING",[id,email,passwordHash,now,now,now]);
 if(created.meta.changes!==1)throw Error('Account was not created; no existing account changed');
 receipt.accountCreated=true;await save();
 for(const video of videoIds){
  const grant=await query("INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,created_at) SELECT ?,?,id,?,?,?,? FROM videos WHERE id=? AND access='free' AND state='published' AND publish_at<=?",[crypto.randomUUID(),id,now,expires,'tribute_moderation_setup',now,video,iso]);
  if(grant.meta.changes!==1)throw Error('Demo grant creation incomplete');receipt.grantsCreated++;await save();
 }
 const grants=(await query('SELECT video_id,course_id,source_order_id FROM viewer_grants WHERE viewer_id=?',[id])).results;
 if(grants.length!==videoIds.length||grants.some(g=>!videoIds.includes(g.video_id)||g.course_id!==null||g.source_order_id!==null))throw Error('Unexpected moderation grants');
 receipt.complete=true;await save();console.log(JSON.stringify({...receipt,credentialsSetup:'Use the existing password-reset form with the owner-controlled email; no password was exported',receipt:path.relative(process.cwd(),path.join(directory,'receipt.json'))}));
}catch{
 // A partially provisioned account must not remain usable. Never touch others.
 if(receipt.accountCreated){
  try{await query("UPDATE viewer_accounts SET status='disabled',credential_version=credential_version+1,updated_at=? WHERE id=?",[Math.floor(Date.now()/1000),id]);receipt.disabledAfterFailure=true}catch{receipt.requiresOperatorReview=true}
 }
 receipt.complete=false;await save();console.error(JSON.stringify({error:'moderation_account_setup_incomplete',accountId:id,disabledAfterFailure:receipt.disabledAfterFailure===true,requiresOperatorReview:receipt.requiresOperatorReview===true,receipt:path.relative(process.cwd(),path.join(directory,'receipt.json'))}));process.exitCode=1;
}
