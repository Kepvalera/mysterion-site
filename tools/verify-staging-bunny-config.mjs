// Read-only validation of an actual local Wrangler configuration. Never deploys.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export function verifyStagingBunnyPlan(config) {
  const errors=[];
  const expected={BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'803179',BUNNY_CDN_HOST:'vz-b41e67d9-d06.b-cdn.net',MEDIA_PAID_ENABLED:'false',MEDIA_MEMBERS_ENABLED:'false',MEDIA_PUBLIC_ORIGIN:'https://mysterion-viewer-staging.pages.dev',MEDIA_ENABLED:'true',VIEWER_PLATFORM_ENABLED:'true',VIEWER_AUTH_ENABLED:'true'};
  if(config?.name!=='mysterion-viewer-staging')errors.push('Invalid staging project name');
  const target=config?.env?.production;
  if(!target)errors.push('Missing env.production');
  if(target?.name!==undefined&&target.name!=='mysterion-viewer-staging')errors.push('Invalid environment project name');
  for(const [key,value] of Object.entries(expected))if(target?.vars?.[key]!==value)errors.push('Missing or unexpected '+key);
  // Validate every environment/binding, not a substring anywhere in the file.
  const inspect=(node)=>{
    if(!node||typeof node!=='object')return;
    for(const [key,value] of Object.entries(node)){
      if(key==='database_id'&&value!=='99255496-6173-4efe-8b14-5924f3c1ceeb')errors.push('Non-staging D1 binding');
      if(key==='MEDIA_PUBLIC_ORIGIN'&&value!==expected.MEDIA_PUBLIC_ORIGIN)errors.push('Non-staging origin');
      if(key==='MEDIA_ALLOWED_ORIGINS'&&value!=='')errors.push('Additional origins require separate review');
      if(key==='routes'&&(!Array.isArray(value)||value.length))errors.push('Routes require separate review');
      if(key==='route'&&value)errors.push('Route requires separate review');
      inspect(value);
    }
  };
  inspect(config);
  const bindings=target?.d1_databases;
  if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].binding!=='MEDIA_DB'||bindings[0].database_id!=='99255496-6173-4efe-8b14-5924f3c1ceeb')errors.push('Expected one staging MEDIA_DB binding in env.production');
  return {valid:errors.length===0,errors:[...new Set(errors)],scope:'local configuration only; provider security settings and secrets are not verified'};
}

export function readStagingConfig(file) {
  if(!file||!fs.statSync(file).isFile())throw Error('Expected a local Wrangler configuration file');
  const require=createRequire(import.meta.url);
  const {experimental_readRawConfig}=require(require.resolve('wrangler',{paths:[path.resolve('output/audit-tools/wrangler')]}));
  return experimental_readRawConfig({config:path.resolve(file)}).rawConfig;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3)throw Error('Usage: node tools/verify-staging-bunny-config.mjs <wrangler.toml|json|jsonc>');
    const result=verifyStagingBunnyPlan(readStagingConfig(process.argv[2]));
    console.log(JSON.stringify(result));if(!result.valid)process.exitCode=1;
  }catch{console.error('Local config validation failed. Supply a valid file; no config values are printed.');process.exitCode=1;}
}
