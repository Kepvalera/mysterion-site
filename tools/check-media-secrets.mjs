// Best-effort credential check. Prints locations/rules only, never suspected values.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const git='C:/Program Files/Git/ucrt64/bin/git.exe';
const tracked=execFileSync(git,['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const additions=execFileSync(git,['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const files=[...new Set([...tracked,...additions])];
const patterns=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['literal-provider-secret',/\b(?:BUNNY_(?:API|TOKEN|CDN_TOKEN)_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|AccessKey)\b["']?\s*[:=]\s*["'](?!TEST_|LOCAL_|REPLACE_|YOUR_|<)[^"'\r\n]{16,}["']/],
 ['literal-jwt',/["']eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}["']/]
];
const findings=[];let checked=0;
for(const file of files){
 if(/(^|\/)(\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/.test(file)&&!file.endsWith('.example'))findings.push({file,rule:'credential-file'});
 if(!/\.(?:[cm]?js|jsonc?|html|md|toml|txt|ya?ml|sql)$/.test(file))continue;
 const text=await fs.readFile(file,'utf8');checked++;
 for(const [i,line] of text.split(/\r?\n/).entries())for(const [rule,pattern] of patterns)if(pattern.test(line))findings.push({file,line:i+1,rule});
}
console.log(JSON.stringify({checked,findings,scope:'tracked and nonignored untracked text; no secret values printed',limitation:'Pattern checks do not replace provider secret scanning.'}));
if(findings.length)process.exitCode=1;
