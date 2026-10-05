import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

export const EMPTY_HISTORY = { schema_version:1, posts:[] };
export async function readHistory(path) {
  try { const parsed=JSON.parse(await readFile(path,"utf8")); if(!Array.isArray(parsed.posts)) throw new Error("history posts must be an array"); return {schema_version:1,...parsed}; }
  catch(error) { if(error.code==="ENOENT") return structuredClone(EMPTY_HISTORY); throw error; }
}
export async function writeHistory(path,history) {
  await mkdir(dirname(path),{recursive:true}); const temp=`${path}.tmp`;
  await writeFile(temp,`${JSON.stringify(history,null,2)}\n`,{mode:0o600}); await rename(temp,path);
}
export function historyRecord(candidate,{status,scheduledAt,postedAt=null,xPostId=null,errorKind=null}) {
  return {post_id:candidate.post_id,facility_id:candidate.facilityId,facility_name:candidate.facilityName||null,prefecture:candidate.prefecture||null,municipality:candidate.municipality||null,category:candidate.category||null,scheduled_at:scheduledAt,posted_at:postedAt,post_type:candidate.postType,target_date:candidate.targetDate,free_condition:candidate.ruleLabel||null,adult_eligibility:candidate.targetConditions||null,post_text:candidate.text,status,url:candidate.url,reason:candidate.reason||null,quality_passed:candidate.qualityPassed??null,x_post_id:xPostId,error_kind:errorKind};
}
