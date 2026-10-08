import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SITE_URL, adultRuleStatus, candidatePool, checkPostQuality, generatePostCandidate, isDuplicateCandidate, jstToday, selectCandidate } from "../../src/social/generator.js";
import { classifyXApiError, createXClient, XApiError } from "../../src/social/xClient.js";

const node=process.execPath;
const facility=(overrides={})=>({facility_id:"test-museum",name:"確認済み博物館",prefecture:"東京都",municipality:"台東区",category:"博物館",regular_fee:"一般500円",audit:{status:"confirmed",field_status:{free_rules:"confirmed"}},free_rules:[{type:"specific_date",date:"2026-10-06",label:"確認済みの無料公開日",eligibility:{adult_general:true,adult_eligible:true,details:""}}],...overrides});

test("confirmed facilities can be selected, while needs_review and unverified cannot",()=>{
  const valid=facility(),review=facility({facility_id:"review",audit:{status:"needs_review",field_status:{free_rules:"needs_review"}}}),unverified=facility({facility_id:"unverified",audit:{status:"unverified",field_status:{free_rules:"unverified"}}});
  assert.equal(selectCandidate([valid,review,unverified],{posts:[]},new Date("2026-10-05T08:00:00Z")).facilityId,"test-museum");
  assert.deepEqual(candidatePool([review,unverified],new Date("2026-10-05T08:00:00Z")).tomorrow,[]);
});

test("audience rules exclude children/students but include a clearly conditional adult",()=>{
  assert.equal(adultRuleStatus({type:"nth_weekday",audience:"中学生以下",eligibility:{adult_general:false,adult_eligible:false}}),"excluded");
  assert.equal(adultRuleStatus({type:"nth_weekday",audience:"学生限定",eligibility:{adult_general:false,adult_eligible:false}}),"excluded");
  assert.equal(adultRuleStatus({type:"annual_date",audience:"東京都民限定",eligibility:{adult_general:false,adult_eligible:true,details:"東京都民限定"}}),"conditional");
});

test("tomorrow date is calculated from Asia/Tokyo and uses a UTM facility detail URL",()=>{
  const now=new Date("2026-10-05T08:00:00Z");
  assert.equal(jstToday(now),"2026-10-05");
  const c=selectCandidate([facility()],{posts:[]},now);
  assert.equal(c.targetDate,"2026-10-06"); assert.equal(c.postType,"tomorrow");
  const url=new URL(c.url); assert.equal(url.pathname,new URL("facility/test-museum/", SITE_URL).pathname);
  assert.equal(url.searchParams.get("utm_source"),"x"); assert.equal(url.searchParams.get("utm_medium"),"social"); assert.equal(url.searchParams.get("utm_campaign"),"free_spot_daily");
  assert.match(c.text,/📍 東京・台東区/);
});

test("conditional adult eligibility is stated in the generated post",()=>{
  const f=facility({free_rules:[{type:"specific_date",date:"2026-10-06",label:"都民の日",audience:"東京都民限定",eligibility:{adult_general:false,adult_eligible:true,details:"東京都民限定"}}]});
  const c=generatePostCandidate({facility:f,targetDate:"2026-10-06",postType:"tomorrow"});
  assert.match(c.text,/大人も条件付きで無料/); assert.match(c.text,/東京都民限定/);
});

test("this-weekend candidates include only Saturday/Sunday occurrences",()=>{
  const f=facility({free_rules:[{type:"specific_date",date:"2026-10-10",label:"週末の無料公開日",eligibility:{adult_general:true,adult_eligible:true}}]});
  const pool=candidatePool([f],new Date("2026-10-05T08:00:00Z"));
  assert.equal(pool["this-weekend"][0].targetDate,"2026-10-10");
  assert.equal(pool["this-weekend"][0].postType,"this-weekend");
});

test("today and later-this-week priorities use the correct dates",()=>{
  const todayFacility=facility({free_rules:[{type:"specific_date",date:"2026-10-05",label:"今日の無料公開日",eligibility:{adult_general:true,adult_eligible:true}}]});
  const today=selectCandidate([todayFacility],{posts:[]},new Date("2026-10-05T08:00:00Z"));
  assert.equal(today.targetDate,"2026-10-05"); assert.equal(today.postType,"today");
  const weekFacility=facility({free_rules:[{type:"specific_date",date:"2026-10-08",label:"今週の無料公開日",eligibility:{adult_general:true,adult_eligible:true}}]});
  const week=selectCandidate([weekFacility],{posts:[]},new Date("2026-10-05T08:00:00Z"));
  assert.equal(week.targetDate,"2026-10-08"); assert.equal(week.postType,"this-week");
});

test("empty candidate pool exits without generating an item",()=>{
  assert.equal(selectCandidate([facility({free_rules:[]})],{posts:[]},new Date("2026-10-05T08:00:00Z")),null);
});

test("same facility/date, same text, and recently posted facilities are suppressed",()=>{
  const c=generatePostCandidate({facility:facility(),targetDate:"2026-10-06",postType:"tomorrow"});
  assert.equal(isDuplicateCandidate(c,{posts:[{facility_id:c.facilityId,target_date:c.targetDate,status:"posted"}]},{now:new Date("2026-10-05T08:00:00Z")}),"same-facility-target-date");
  assert.equal(isDuplicateCandidate(c,{posts:[{post_text:c.text,status:"posted"}]},{now:new Date("2026-10-05T08:00:00Z")}),"identical-post-text");
  assert.equal(isDuplicateCandidate(c,{posts:[{facility_id:c.facilityId,target_date:"2026-10-10",status:"posted",posted_at:"2026-10-01T12:00:00Z"}]},{now:new Date("2026-10-05T08:00:00Z")}),"facility-cooldown");
  assert.equal(isDuplicateCandidate(c,{posts:[{facility_id:c.facilityId,target_date:"2026-10-10",status:"unknown",scheduled_at:"2026-10-01T17:00:00+09:00"}]},{now:new Date("2026-10-05T08:00:00Z")}),"facility-cooldown");
});

test("post quality passes for a clean adult candidate and blocks missing conditions or 14-day repeats",()=>{
  const f=facility();
  const c=generatePostCandidate({facility:f,targetDate:"2026-10-06",postType:"tomorrow"});
  const now=new Date("2026-10-05T08:00:00Z");
  const pass=checkPostQuality({candidate:c,facility:f,history:{posts:[]},now});
  assert.equal(pass.passed,true); assert.ok(pass.checks.every(check=>check.passed));
  const missingCondition={...c,text:c.text.replace(c.ruleLabel,"")};
  const failed=checkPostQuality({candidate:missingCondition,facility:f,history:{posts:[]},now});
  assert.equal(failed.passed,false); assert.ok(failed.checks.some(check=>check.id==="condition_clear"&&!check.passed));
  const repeat=checkPostQuality({candidate:c,facility:f,history:{posts:[{post_id:"old",facility_id:c.facilityId,scheduled_at:"2026-10-01T17:00:00+09:00",posted_at:"2026-10-01T17:00:00+09:00",target_date:"2026-10-02",post_text:"old",status:"posted"}]},now});
  assert.equal(repeat.passed,false); assert.equal(repeat.duplicate_checks.no_post_within_14_days,false);
});

test("DRY RUN writes JSON and never loads credentials or sends an X request",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"free-day-social-"));
  try{
    const history=join(dir,"history.json"),outbox=join(dir,"latest.json");
    const cli=resolve("scripts/social/cli.mjs");
    const result=spawnSync(node,[cli,"dry-run","--now","2026-10-05","--history",history,"--outbox",outbox],{encoding:"utf8",env:{...process.env,X_API_KEY:"MUST_NOT_BE_READ"}});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/DRY RUN/); assert.doesNotMatch(result.stdout,/MUST_NOT_BE_READ/);
    const saved=JSON.parse(await readFile(outbox,"utf8")); assert.equal(saved.status,"candidate"); assert.equal(saved.quality.passed,true); assert.equal(saved.quality.checks.length,10); assert.ok(saved.scheduled_at);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("SOCIAL_POSTING_ENABLED=false exits before credentials, candidate file, or X API access",()=>{
  const cli=resolve("scripts/social/cli.mjs");
  const result=spawnSync(node,[cli,"post"],{encoding:"utf8",env:{...process.env,SOCIAL_POSTING_ENABLED:"false"}});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/X APIは呼び出していません/);
});

test("X API errors are classified without printing secrets",()=>{
  assert.equal(classifyXApiError(new XApiError("authentication",401)),"authentication");
  assert.equal(classifyXApiError(new XApiError("rate-limit",429)),"rate-limit");
  assert.equal(classifyXApiError(new XApiError("network")),"network");
  assert.equal(classifyXApiError(new XApiError("server",503)),"server");
});

test("X API client uses v2 create endpoint, OAuth user credentials, and safe errors",async()=>{
  const secret="never-log-this-secret"; let request;
  const client=await createXClient({env:{X_API_KEY:"key",X_API_SECRET:secret,X_ACCESS_TOKEN:"user-token",X_ACCESS_TOKEN_SECRET:"user-secret"},fetchImpl:async(url,options)=>{request={url,options};return {ok:true,status:201,json:async()=>({data:{id:"12345"}})};}});
  assert.deepEqual(await client.createPost("dry test"),{id:"12345"});
  assert.equal(request.url,"https://api.x.com/2/tweets"); assert.equal(request.options.method,"POST");
  assert.match(request.options.headers.Authorization,/OAuth oauth_consumer_key/); assert.doesNotMatch(request.options.headers.Authorization,new RegExp(secret));
  assert.deepEqual(JSON.parse(request.options.body),{text:"dry test"});
  const rateLimited=await createXClient({env:{X_API_KEY:"key",X_API_SECRET:secret,X_ACCESS_TOKEN:"user-token",X_ACCESS_TOKEN_SECRET:"user-secret"},fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(rateLimited.createPost("test"),error=>classifyXApiError(error)==="rate-limit"&&!String(error).includes(secret));
});
