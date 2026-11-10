// Copy an already reviewed staging config. Does not assert provider security,
// replace variables, change credentials, or deploy anything.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readStagingConfig,verifyStagingBunnyPlan} from './verify-staging-bunny-config.mjs';
export function prepareStagingBunnyConfig(source,directory=path.resolve('output/staging-bunny-config')){
  const result=verifyStagingBunnyPlan(readStagingConfig(source));
  if(!result.valid)throw Error('invalid_staging_config');
  fs.mkdirSync(directory,{recursive:true});
  // Exclusive copy: never overwrite a previous plan or the input.
  const target=path.join(directory,'wrangler'+path.extname(source));
  fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3)throw Error('input_required');
    prepareStagingBunnyConfig(path.resolve(process.argv[2]));
    console.log('Validated local staging config copied to output/staging-bunny-config. No settings changed; no deployment performed.');
  }catch{console.error('Preparation failed: supply a valid reviewed staging config and ensure the output file does not already exist. No config values are printed.');process.exitCode=1;}
}
