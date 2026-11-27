import {deny,time,decode,idPattern} from './platform-data.mjs';
import {input,translations,revision} from './platform-http.mjs';
import {bunnyRequest,boundVideo} from './bunny.mjs';
const kinds=['conference','school','stream','course','bundle','seminar'];
function translated(value,old,max,required=false){const next=JSON.parse(translations(value,max,required));if(old){const prior=JSON.parse(old);if(typeof prior.de==='string')next.de=prior.de}return JSON.stringify(next)}
export async function saveProgram(request,env,staff,id){
 const db=env.MEDIA_DB,d=await input(request,['id','title','description','kind','program_type','parent_id','sort_order','syllabus','stream','access','price_minor','currency','state','revision','duration_days','sale_enabled']),old=id?await db.prepare('SELECT c.*,p.program_type,p.parent_id,p.sort_order,p.syllabus FROM platform_courses c LEFT JOIN program_settings p ON p.course_id=c.id WHERE c.id=?').bind(id).first():null;
 if(id&&d.id!==undefined&&d.id!==id)deny(400,'invalid_program');if(id&&!old)deny(404,'course_not_found');id=id||d.id||crypto.randomUUID();if(!idPattern.test(id))deny(400,'invalid_program');
 if(old&&await db.prepare('SELECT 1 FROM program_events WHERE course_id=?').bind(id).first()&&(d.program_type||d.kind)!=='seminar')deny(409,'event_type_immutable');
 const type=d.program_type||(d.kind==='school'?'stream':d.kind);if(!kinds.includes(type))deny(400,'invalid_course_kind');
 const kind=d.program_type?(type==='stream'?'school':['school','bundle'].includes(type)?'course':type):d.kind;
 if(!['draft','published','archived'].includes(d.state))deny(400,'invalid_course_status');
 if(!['paid','free'].includes(d.access)||!Number.isSafeInteger(d.price_minor)||d.price_minor<0||d.price_minor>100000000||d.access==='paid'&&d.price_minor===0||d.access==='free'&&d.price_minor!==0||!['RUB','EUR','USD'].includes(d.currency))deny(400,'invalid_price');
 if(d.program_type&&d.currency!=='RUB'||kind==='conference'&&d.access==='paid'&&d.currency!=='RUB')deny(400,'conference_paid_requires_rub');
 const stream=type==='stream'?d.stream:null;if(type==='stream'&&![3,4,5,6].includes(stream))deny(400,'invalid_school_stream');if(type!=='stream'&&d.stream!==undefined&&d.stream!==null&&d.stream!=='')deny(400,'stream_only_for_school');
 const previousTerms=await db.prepare("SELECT * FROM sales_products WHERE kind='course' AND product_id=?").bind(id).first();
 const raw=d.duration_days,days=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+$/.test(raw.trim())?Number(raw):undefined;
 if(raw!==undefined&&(!Number.isInteger(days)||days<1||days>3660))deny(400,'invalid_access_duration');
 const terms=raw===undefined&&previousTerms?previousTerms.policy:JSON.stringify({mode:'days',days:days??90});
 if(d.sale_enabled!==undefined&&![0,1].includes(d.sale_enabled))deny(400,'invalid_sale_status');
 const parent=d.parent_id===undefined?(old?.parent_id||null):d.parent_id||null,sort=d.sort_order===undefined?(old?.sort_order||0):d.sort_order;
 if(!Number.isInteger(sort)||sort<0||sort>1000000)deny(400,'invalid_program_order');
 if(parent){if(type!=='stream'||!idPattern.test(parent)||parent===id)deny(400,'invalid_program_parent');const school=await db.prepare("SELECT 1 FROM platform_courses c JOIN program_settings p ON p.course_id=c.id WHERE c.id=? AND p.program_type='school' AND c.state!='archived'").bind(parent).first();if(!school)deny(400,'invalid_program_parent')}
 if(type!=='school'&&await db.prepare('SELECT 1 FROM program_settings WHERE parent_id=?').bind(id).first())deny(409,'program_has_streams');
 const title=translated(d.title,old?.title,300,true),description=translated(d.description,old?.description,6000),syllabus=d.syllabus===undefined?(old?.syllabus||'{}'):translated(d.syllabus,old?.syllabus,10000),receipt=crypto.randomUUID(),now=time(),rev=old?revision(d.revision):1,guard='EXISTS(SELECT 1 FROM platform_audit WHERE id=?)';
 if(!old){const same=await db.prepare('SELECT c.*,p.program_type,p.parent_id,p.sort_order,p.syllabus FROM platform_courses c LEFT JOIN program_settings p ON p.course_id=c.id WHERE c.id=?').bind(id).first();if(same){if(same.title!==title||same.description!==description||same.price_minor!==d.price_minor||same.currency!==d.currency||same.program_type!==type||same.parent_id!==parent||same.sort_order!==sort)deny(409,'revision_conflict');return decode(same)}}
 const statements=[old?db.prepare("INSERT INTO platform_audit SELECT ?,?,'program.saved',id,? FROM platform_courses WHERE id=? AND revision=?").bind(receipt,staff.sub,now,id,rev):db.prepare("INSERT INTO platform_audit SELECT ?,?,'program.created',?,? WHERE NOT EXISTS(SELECT 1 FROM platform_courses WHERE id=?)").bind(receipt,staff.sub,id,now,id)];
 statements.push(old?db.prepare(`UPDATE platform_courses SET title=?,description=?,kind=?,stream=?,access=?,price_minor=?,currency=?,state=?,revision=revision+1,updated_at=? WHERE id=? AND ${guard}`).bind(title,description,kind,stream,d.access,d.price_minor,d.currency,d.state,now,id,receipt):db.prepare(`INSERT INTO platform_courses(id,title,description,kind,stream,access,price_minor,currency,state,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,title,description,kind,stream,d.access,d.price_minor,d.currency,d.state,now,now,receipt));
 statements.push(db.prepare(`INSERT INTO program_settings(course_id,program_type,parent_id,sort_order,syllabus) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(course_id) DO UPDATE SET program_type=excluded.program_type,parent_id=excluded.parent_id,sort_order=excluded.sort_order,syllabus=excluded.syllabus`).bind(id,type,parent,sort,syllabus,receipt));
 if(d.sale_enabled===1&&JSON.parse(terms).mode!=='days'&&previousTerms?.sale_enabled!==1)deny(400,'unsupported_checkout_policy');
 const enabled=d.access==='paid'&&d.state==='published'&&env.MEDIA_PAID_ENABLED==='true'&&((d.sale_enabled??previousTerms?.sale_enabled??(!d.program_type&&kind==='conference'?1:0))===1)?1:0;
 statements.push(db.prepare(`INSERT INTO sales_products(kind,product_id,sale_enabled,policy,revision) SELECT 'course',?,?,?,1 WHERE ${guard} ON CONFLICT(kind,product_id) DO UPDATE SET sale_enabled=excluded.sale_enabled,policy=excluded.policy,revision=sales_products.revision+1`).bind(id,enabled,terms,receipt));
 const result=await db.batch(statements);if(!result[0].meta.changes)deny(409,'revision_conflict');return decode(await db.prepare('SELECT c.*,p.program_type,p.parent_id,p.sort_order,p.syllabus FROM platform_courses c LEFT JOIN program_settings p ON p.course_id=c.id WHERE c.id=?').bind(id).first());
}
export async function syncProgramMetadata(env,id,after){
 if(after!==undefined&&after!==null&&after!==''&&!idPattern.test(after))deny(400,'invalid_metadata_cursor');
 const db=env.MEDIA_DB;if(!await db.prepare('SELECT 1 FROM platform_courses WHERE id=?').bind(id).first())deny(404,'course_not_found');const {results}=await db.prepare("SELECT DISTINCT v.* FROM videos v JOIN platform_lessons l ON l.video_id=v.id WHERE l.course_id=? AND v.source_type='bunny' AND v.state!='deleted' AND v.id>? ORDER BY v.id LIMIT 2").bind(id,after||'').all();let synced=0,failed=0;
 for(const video of results.slice(0,1)){try{boundVideo(env,video);const remote=await bunnyRequest(env,video.source_ref);if(remote.guid!==video.source_ref||String(remote.videoLibraryId)!==env.BUNNY_LIBRARY_ID||!Number.isSafeInteger(remote.length)||remote.length<0)throw Error('invalid_metadata');await db.prepare('INSERT INTO video_metadata VALUES (?,?) ON CONFLICT(video_id) DO UPDATE SET duration_seconds=excluded.duration_seconds').bind(video.id,remote.length).run();synced++}catch{failed++}}
 return {synced,failed,next:results.length>1?results[0].id:null,providerWrites:0};
}
