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
test('static kit separates regions and removes paid voice/video formats',()=>{
 const pack=buildTrial(facilities,{posts:[]},'2026-10-12',2,{areas:['東京都','大阪府']});
 assert.ok(pack.posts.length>0);
 for(const p of pack.posts){
  assert.ok(['東京都','大阪府'].includes(p.area));
  assert.ok(p.region.startsWith(p.area));
  assert.ok(['x','carousel'].includes(p.format));
  assert.ok(p.candidate.targetDate>p.scheduled_at.slice(0,10),'17:00 posts promote a future outing');
  assert.equal(p.channel,p.format==='x'?'x':'instagram');
  assert.ok(p.assets.every(x=>x.endsWith('.png')));
  if(p.channel==='x')assert.ok(p.text.startsWith(`【${p.region}】`));
 }
 assert.equal(buildTrial(facilities,{posts:[]},'2026-10-12',2,{areas:['存在しないエリア']}).posts.length,0);
});
test('roundups keep each facility condition and day in one prefecture',()=>{
 const pack=buildTrial(facilities,{posts:[]},'2026-10-12',2,{roundup:true});
 assert.equal(pack.posts.length,10);
 for(const p of pack.posts){
  assert.ok(p.roundup.length>=2);
  for(const m of p.roundup){
   const f=facilities.find(f=>f.facility_id===m.facility_id);
   assert.equal(f.prefecture,p.area);assert.ok(m.condition);assert.ok(m.scope);assert.ok(m.audience);
   assert.ok(m.target_date>p.scheduled_at.slice(0,10));assert.ok(isOpenOn(f,new Date(m.target_date+'T12:00:00Z')));
   if(p.channel==='instagram')assert.ok(p.text.includes(m.condition));
  }
  assert.equal(p.assets.length,p.channel==='x'?1:p.roundup.length+2);
 }
});
