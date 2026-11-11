import {rows} from './platform-data.mjs';import {text} from './platform-http.mjs';
export async function searchParticipants(db,request){
 const q=text(new URL(request.url).searchParams.get('q')||'',100);if(!q)return {items:[]};
 const variants=[...new Set([q,q.toLowerCase(),q.toUpperCase(),q.split(/\s+/).map(w=>w[0]?.toUpperCase()+w.slice(1).toLowerCase()).join(' ')])];
 const conditions=variants.map(()=>"(instr(a.first_name,?)>0 OR instr(a.last_name,?)>0 OR instr(a.email,?)>0 OR instr(a.first_name||' '||a.last_name,?)>0 OR instr(a.last_name||' '||a.first_name,?)>0)").join(' OR ');
 return {items:await rows(db.prepare("SELECT a.id,a.email,a.first_name,a.last_name FROM viewer_accounts a WHERE a.status='active' AND a.email_verified_at IS NOT NULL AND ("+conditions+') ORDER BY a.email LIMIT 25').bind(...variants.flatMap(v=>[v,v,v,v,v])))};
}
