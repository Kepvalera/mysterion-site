// Pages rejects overlapping include/exclude rules even if Functions compile.
// Limits/overlap semantics follow Cloudflare Wrangler's Pages routes validator.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function validateMediaRoutes(routes) {
  assert.equal(routes.version,1);
  assert.ok(Array.isArray(routes.include)&&Array.isArray(routes.exclude)&&routes.include.length);
  assert.ok(routes.include.length+routes.exclude.length<=100);
  for(const group of [routes.include,routes.exclude]) {
    assert.ok(group.every(rule=>typeof rule==='string'&&rule.startsWith('/')&&rule.length<=100));
    for(const rule of group.filter(rule=>rule.endsWith('/*'))) {
      const prefix=rule.slice(0,-1);
      assert.ok(!group.some(other=>other!==rule&&other.startsWith(prefix)), 'Overlapping Pages route: '+rule);
    }
  }
  const match=(rule,url)=>rule.endsWith('*')?url.startsWith(rule.slice(0,-1)):url===rule;
  const active=url=>routes.include.some(rule=>match(rule,url))&&!routes.exclude.some(rule=>match(rule,url));
  for(const url of ['/api/media','/api/media/admin/me','/admin-media','/admin-media.html','/admin-media/','/media-login','/media-login.html','/media-login/'])assert.ok(active(url),'Unprotected route: '+url);
  for(const url of ['/','/index.html','/homepage.min.js','/heavenly.css','/conference-2024.html'])assert.ok(!active(url),'Static route unnecessarily invokes Functions: '+url);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const routes=JSON.parse(await fs.readFile(new URL('../_routes.json',import.meta.url),'utf8'));
 validateMediaRoutes(routes);console.log('Pages routes valid: '+routes.include.length+' include rules; protected aliases covered; homepage remains static');
}
