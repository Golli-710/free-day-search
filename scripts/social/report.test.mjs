import test from "node:test";
import assert from "node:assert/strict";
import { buildJobSummary } from "./report.mjs";

test("Job Summary includes candidate, quality, duplicate checks, seven-day history, and bias counts",()=>{
  const candidate={facilityName:"確認済み博物館",facilityId:"test",prefecture:"東京都",municipality:"台東区",category:"博物館",targetDate:"2026-10-06",postType:"tomorrow",ruleLabel:"文化の日",targetConditions:"大人・一般",reason:"明日優先",text:"投稿本文です\n施設情報",url:"https://example.test/facility/test/?utm_source=x"};
  const quality={passed:true,checks:[{passed:true,label:"URL",detail:"UTMあり"}],duplicate_checks:{no_post_within_14_days:true,no_same_facility_target_date:true,no_identical_text:true,recent_dry_run_same_facility_count:1}};
  const history={posts:[
    {status:"dry_run",scheduled_at:"2026-10-05T17:00:00+09:00",facility_name:"確認済み博物館",facility_id:"test",prefecture:"東京都",municipality:"台東区",category:"博物館",target_date:"2026-10-06",post_type:"tomorrow",post_text:"投稿本文です",reason:"明日優先",quality_passed:true},
    {status:"dry_run",scheduled_at:"2026-10-04T17:00:00+09:00",facility_name:"前日の施設",facility_id:"a",prefecture:"神奈川県",municipality:"横浜市",category:"美術館",target_date:"2026-10-05",post_type:"tomorrow",post_text:"前日の投稿文",reason:"明日",quality_passed:true},
    {status:"dry_run",scheduled_at:"2026-09-26T17:00:00+09:00",facility_name:"8日前の施設",facility_id:"b",prefecture:"大阪府",category:"動物園",target_date:"2026-09-27",post_type:"tomorrow",post_text:"古い投稿文",reason:"明日",quality_passed:true}
  ]};
  const summary=buildJobSummary({candidate,quality,history,scheduledAt:"2026-10-05T17:00:00+09:00",generatedAt:"2026-10-05T08:00:00Z"});
  assert.match(summary,/投稿予定日時/); assert.match(summary,/確認済み博物館/); assert.match(summary,/文化の日/);
  assert.match(summary,/投稿本文です/); assert.match(summary,/品質チェック/); assert.match(summary,/過去14日以内/);
  assert.match(summary,/前日の施設/); assert.doesNotMatch(summary,/8日前の施設/);
  assert.match(summary,/地域別候補数/); assert.match(summary,/東京都: 1件/); assert.match(summary,/カテゴリ別候補数/);
});

test("Job Summary reports quality blockers and no-candidate runs",()=>{
  const blocked=buildJobSummary({candidate:{facilityName:"要確認館",facilityId:"x",prefecture:"大阪府",municipality:"大阪市",category:"博物館",targetDate:"2026-10-06",postType:"tomorrow",ruleLabel:"日付要確認",targetConditions:"未確認",reason:"候補",text:"本文",url:"https://example.test"},quality:{passed:false,checks:[{passed:false,label:"無料条件",detail:"日付要確認"}],duplicate_checks:{no_post_within_14_days:true,no_same_facility_target_date:true,no_identical_text:true}},history:{posts:[]},scheduledAt:"2026-10-05T17:00:00+09:00",generatedAt:"2026-10-05T08:00:00Z"});
  assert.match(blocked,/BLOCKED/); assert.match(blocked,/日付要確認/);
  const empty=buildJobSummary({candidate:null,quality:null,history:{posts:[]},scheduledAt:"2026-10-05T17:00:00+09:00",generatedAt:"2026-10-05T08:00:00Z"});
  assert.match(empty,/No eligible post candidate/); assert.match(empty,/まだ7日分/);
});
