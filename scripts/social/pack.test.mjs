import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {buildTrial,trackingLink} from './pack.mjs';
import {isOpenOn,matchesRule,adultRuleStatus} from '../../src/social/generator.js';
const ctx={window:{}};vm.runInNewContext(await readFile(new URL('../../data.js',import.meta.url),'utf8'),ctx);
const facilities=ctx.window.FACILITIES;
test('four-week kit contains 12 X and 8 Instagram drafts without altering history',()=>{
 const history={posts:[]},pack=buildTrial(facilities,history,'2026-10-12');
 assert.equal(history.posts.length,0);assert.equal(pack.posts.length,20);
 assert.equal(pack.posts.filter(p=>p.format==='x').length,12);
 for(const p of pack.posts){
  const f=facilities.find(f=>f.facility_id===p.candidate.facilityId),date=new Date(p.candidate.targetDate+'T12:00:00Z');
  assert.equal(f.audit.status,'confirmed');assert.ok(isOpenOn(f,date));
  assert.ok(f.free_rules.some(r=>matchesRule(r,date)&&adultRuleStatus(r)!=='excluded'));
  assert.equal(new URL(p.url).searchParams.get('utm_campaign'),'free_day_trial');
  assert.equal(p.video.type,'free_outing');assert.equal(p.video.duration,15);
 }
});
test('links distinguish formats and invalid dates are rejected',()=>{
 for(const format of ['x','carousel','story','reel']){
  const u=new URL(trackingLink('police-museum','2026-10-13',format));
  assert.equal(u.origin,'https://free-day-search.pages.dev');
  assert.equal(u.searchParams.get('utm_source'),format==='x'?'x':'instagram');
  assert.ok(u.searchParams.get('utm_content').endsWith('_'+format));
 }
 assert.throws(()=>buildTrial(facilities,{posts:[]},'2026-02-31'));
});
