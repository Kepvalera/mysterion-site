// Read-only Cloudflare project check. Never logs raw responses or credentials.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export const previewOrigin='https://release-verified-fixes-20261111.mysterion-international.pages.dev';
export function checkPreviewProject(project){
 const issues=[],preview=project?.deployment_configs?.preview,production=project?.deployment_configs?.production;
 const value=key=>preview?.env_vars?.[key]?.value;
 const ids=config=>Object.values(config?.d1_databases||{}).map(binding=>binding.id);
 if(project?.name!=='mysterion-international'||project.production_branch!=='main')issues.push('unexpected_project_or_production_branch');
 const previewIds=ids(preview);
 if(previewIds.length!==1||preview?.d1_databases?.MEDIA_DB?.id!=='99255496-6173-4efe-8b14-5924f3c1ceeb')issues.push('staging_d1_binding_required');
 if(previewIds.some(id=>id==='d4966184-ae55-46cf-bf74-4dff1e7debdd'||ids(production).includes(id)))issues.push('production_d1_in_preview');
 if(value('MEDIA_PUBLIC_ORIGIN')!==previewOrigin)issues.push('preview_origin_required');
 if(value('MEDIA_ALLOWED_ORIGINS')&&value('MEDIA_ALLOWED_ORIGINS')!==previewOrigin)issues.push('unexpected_origin_aliases');
 for(const key of ['MEDIA_ENABLED','VIEWER_AUTH_ENABLED','VIEWER_PLATFORM_ENABLED'])if(value(key)!=='true')issues.push(key+'_required');
 if(value('MEDIA_PAID_ENABLED')!=='false')issues.push('paid_playback_must_remain_disabled');
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(value('MEDIA_ACCESS_ISSUER')||'')||!value('MEDIA_ACCESS_AUD'))issues.push('access_identity_configuration_required');
 if(!preview?.env_vars?.VIEWER_RATE_KEY)issues.push('preview_rate_secret_required');
 if(!(preview?.services?.VIEWER_MAILER||(value('VIEWER_EMAIL_PROVIDER')==='resend'&&value('VIEWER_EMAIL_FROM')&&preview?.env_vars?.RESEND_API_KEY)))issues.push('isolated_preview_mail_configuration_required');
 const productionBuckets=Object.values(production?.r2_buckets||{}).map(b=>b.name);
 if(Object.values(preview?.r2_buckets||{}).some(b=>productionBuckets.includes(b.name)))issues.push('production_r2_in_preview');
 if(value('BUNNY_ENABLED')==='true'){
  const library=value('BUNNY_LIBRARY_ID'),productionLibrary=production?.env_vars?.BUNNY_LIBRARY_ID?.value;
  if(!library||!productionLibrary||library===productionLibrary)issues.push('isolated_bunny_library_required');
 }
 return {valid:issues.length===0,issues,scope:'Project Preview metadata only. Access policies, D1 schema, Bunny and email isolation require owner verification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--live')throw Error();
  const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
  if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw Error();
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/mysterion-international`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error();const body=await response.json();if(!body.success)throw Error();
  const result=checkPreviewProject(body.result);console.log(JSON.stringify(result));if(!result.valid)process.exitCode=1;
 }catch{console.error('Preview configuration check unavailable. Supply Pages read credentials in environment; no values or raw API responses are printed.');process.exitCode=1;}
}
