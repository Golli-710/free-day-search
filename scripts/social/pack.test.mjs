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
 assert.ok(pack.posts.length>0 && pack.posts.length<=10);
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
test('all roundup members are withheld for 28 days, including future reservations',()=>{
 const pack=buildTrial(facilities,{posts:[]},'2026-10-12',4,{roundup:true});
 const last=new Map();
 for(const p of pack.posts)for(const m of p.roundup){
  const day=Date.parse(p.scheduled_at);if(last.has(m.facility_id))assert.ok(day-last.get(m.facility_id)>=28*86400000);
  last.set(m.facility_id,day);
 }
 const booked=facilities.map(f=>({facility_id:f.facility_id,status:'scheduled',scheduled_at:'2026-10-15T19:00:00+09:00'}));
 assert.equal(buildTrial(facilities,{posts:booked},'2026-10-12',2,{roundup:true}).posts.length,0);
});
test('Kasori includes Chiba and shifts closure across consecutive holidays',()=>{
 const f=facilities.find(f=>f.facility_id==='kasori-shell-mounds-museum');
 assert.equal(f.prefecture,'千葉県');assert.equal(f.audit.status,'confirmed');
 for(const day of ['2026-10-12','2026-10-17','2026-10-18','2026-05-05','2026-05-06'])assert.ok(isOpenOn(f,new Date(day+'T12:00:00Z')));
 for(const day of ['2026-10-13','2026-05-07','2026-12-29','2026-06-03'])assert.equal(isOpenOn(f,new Date(day+'T12:00:00Z')),false);
});
test('Chiba roundup has distinct verified museums and holiday closures',()=>{
 const chiba=facilities.filter(f=>f.prefecture==='千葉県'&&f.category==='博物館');assert.ok(chiba.length>=3);
 assert.ok(chiba.some(f=>f.facility_id==='chiba-city-folk-museum'));
 for(const f of chiba){assert.ok(isOpenOn(f,new Date('2026-10-17T12:00:00Z')));assert.equal(isOpenOn(f,new Date('2026-10-13T12:00:00Z')),false);}
 const pack=buildTrial(chiba,{posts:[]},'2026-10-12',1,{areas:['千葉県'],roundup:true});
 assert.equal(pack.posts.length,1);assert.equal(new Set(pack.posts[0].roundup.map(m=>m.facility_id)).size,3);
});
test('science free days and child-only planetarium never become general free admission',()=>{
 const science=facilities.find(f=>f.facility_id==='chiba-science-industry-museum');
 assert.ok(science.free_rules.some(r=>r.month_day==='11-03'&&matchesRule(r,new Date('2026-11-03T12:00:00Z'))));
 assert.ok(!science.free_rules.some(r=>r.type==='always_free'));
 const water=facilities.find(f=>f.facility_id==='abiko-mizunoyakata-planetarium');
 assert.ok(!water.free_rules.some(r=>matchesRule(r,new Date('2026-11-01T12:00:00Z'))));
 assert.ok(water.free_rules.filter(r=>matchesRule(r,new Date('2026-10-17T12:00:00Z'))).every(r=>r.audience));
});

test('Hasseiden SNS selection respects the official year-end boundaries',()=>{
 const f=facilities.find(f=>f.facility_id==='yokohama-hasseiden-museum');
 for(const [day,expected] of [['2026-12-27',true],['2026-12-28',false],['2027-01-04',false],['2027-01-05',true]]){
  assert.equal(isOpenOn(f,new Date(day+'T12:00:00Z')),expected,day);
 }
});
