import {publicPrograms} from './public-programs.mjs';
import {deny} from './platform-data.mjs';
export async function publicConferences(env,viewer,id){const data=await publicPrograms(env,viewer,id);if(id){if(data.program_type!=='conference')deny(404,'conference_not_found');return data}return {items:data.items.filter(p=>p.program_type==='conference')}}
