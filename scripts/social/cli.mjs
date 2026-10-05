import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkPostQuality, formatScheduledAt, formatTargetDate, isDuplicateCandidate, jstToday, selectCandidate } from "../../src/social/generator.js";
import { historyRecord, readHistory, writeHistory } from "./history.mjs";
import { buildJobSummary } from "./report.mjs";
import { classifyXApiError } from "../../src/social/xClient.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const args=process.argv.slice(2),mode=args[0]||"dry-run";
const argValue=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const now=argValue("--now")?new Date(`${argValue("--now")}T08:00:00Z`):new Date();
const historyPath=resolve(root,argValue("--history")||"social/history.json");
const outboxPath=resolve(root,argValue("--outbox")||"social/outbox/latest.json");

async function loadFacilities(){const context={window:{}};vm.runInNewContext(await readFile(resolve(root,"data.js"),"utf8"),context,{timeout:1500});return context.window.FACILITIES;}
async function saveOutbox(candidate,{status,reason=null,quality=null,scheduledAt=null}={}){await mkdir(dirname(outboxPath),{recursive:true});await writeFile(outboxPath,`${JSON.stringify({generated_at:new Date().toISOString(),scheduled_at:scheduledAt,status,reason,candidate,quality},null,2)}\n`,{mode:0o600});}
function logCandidate(c){console.log(`対象日: ${c.targetDate}（${formatTargetDate(c.targetDate)}）`);console.log(`選択施設: ${c.facilityId}`);console.log(`投稿タイプ: ${c.postType}`);console.log(`投稿理由: ${c.reason||"確認状態・成人対象条件・重複履歴・優先順位による選定"}`);console.log(`投稿本文:\n${c.text}`);console.log(`投稿URL: ${c.url}`);}
async function publishSummary(details){
  const markdown=buildJobSummary(details);
  const summaryPath=process.env.GITHUB_STEP_SUMMARY;
  if(summaryPath)await appendFile(summaryPath,`${markdown}\n`);
  else console.log(`\n${markdown}\n`);
}

async function dryRun(){
  const [facilities,history]=await Promise.all([loadFacilities(),readHistory(historyPath)]);
  const candidate=selectCandidate(facilities,history,now);
  const scheduledAt=formatScheduledAt(now);
  if(!candidate){console.log(`対象日: ${jstToday(now)} JST`);console.log("No eligible post candidate");await saveOutbox(null,{status:"no_candidate",reason:"今週の確認済み候補がないか、重複条件で除外されました。",scheduledAt});await publishSummary({candidate:null,quality:null,history,scheduledAt,postingEnabled:process.env.SOCIAL_POSTING_ENABLED==="true",generatedAt:now.toISOString()});return;}
  const facility=facilities.find(f=>f.facility_id===candidate.facilityId);
  const quality=checkPostQuality({candidate,facility,history,now});
  candidate.qualityPassed=quality.passed;
  logCandidate(candidate);
  for(const check of quality.checks)console.log(`品質チェック: ${check.passed?"PASS":"FAIL"} / ${check.label} — ${check.detail}`);
  console.log(`投稿結果: ${quality.passed?"DRY RUN（品質チェック通過・X APIは呼び出していません）":"BLOCKED（品質チェックNG・X APIは呼び出していません）"}`);
  const status=quality.passed?"candidate":"quality_failed";
  await saveOutbox(candidate,{status,reason:quality.passed?null:"品質チェックに失敗しました。Job Summaryとquality.checksを確認してください。",quality,scheduledAt});
  history.posts.push(historyRecord(candidate,{status:quality.passed?"dry_run":"quality_failed",scheduledAt}));await writeHistory(historyPath,history);
  await publishSummary({candidate,quality,history,scheduledAt,postingEnabled:process.env.SOCIAL_POSTING_ENABLED==="true",generatedAt:now.toISOString()});
  console.log(`候補JSON: ${outboxPath}`);
}

async function post(){
  if(process.env.SOCIAL_POSTING_ENABLED!=="true"){console.log("投稿結果: SKIPPED（SOCIAL_POSTING_ENABLED=true ではありません。X APIは呼び出していません）");return;}
  const latest=JSON.parse(await readFile(outboxPath,"utf8"));
  if(latest.status!=="candidate"||latest.quality?.passed!==true||!latest.candidate){console.log("投稿結果: BLOCKED（品質チェック通過済み候補がありません）");return;}
  const candidate=latest.candidate;
  if(candidate.targetDate<jstToday(now)){console.log("投稿結果: SKIPPED（候補の日付が過去です）");return;}
  const history=await readHistory(historyPath),prior=history.posts.find(p=>p.post_id===candidate.post_id);
  if(prior&&prior.status!=="dry_run"){console.log(`投稿結果: SKIPPED（重複防止: ${prior.status}）`);return;}
  const duplicate=isDuplicateCandidate(candidate,{posts:history.posts.filter(p=>p.post_id!==candidate.post_id)},{now});
  if(duplicate){console.log(`投稿結果: SKIPPED（重複防止: ${duplicate}）`);return;}
  const record=prior||historyRecord(candidate,{status:"posting",scheduledAt:formatScheduledAt(now)});
  Object.assign(record,historyRecord(candidate,{status:"posting",scheduledAt:formatScheduledAt(now)}));
  if(!prior)history.posts.push(record);
  await writeHistory(historyPath,history);
  try{
    const {createXClient}=await import("../../src/social/xClient.js");const client=await createXClient();const result=await client.createPost(candidate.text);
    Object.assign(record,{status:"posted",posted_at:new Date().toISOString(),x_post_id:result.id});await writeHistory(historyPath,history);console.log(`投稿結果: POSTED（X post id ${result.id}）`);
  }catch(error){
    const kind=classifyXApiError(error),uncertain=["network","server"].includes(kind);
    Object.assign(record,{status:uncertain?"unknown":"failed",error_kind:kind});await writeHistory(historyPath,history);
    console.log(`投稿結果: ERROR（${kind}${error?.status?` / HTTP ${error.status}`:""}）`);
    if(uncertain)console.log("送信結果を確定できないため、自動再試行はしません。X側の投稿履歴を確認してください。");
  }
}

try{if(mode==="dry-run")await dryRun();else if(mode==="post")await post();else throw new Error("Usage: node scripts/social/cli.mjs <dry-run|post> [--now YYYY-MM-DD]");}
catch(error){console.error(`投稿処理エラー: ${error.message}`);process.exitCode=1;}
