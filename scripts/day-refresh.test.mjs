import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function browser(search='') {
 let now=Date.parse('2026-11-10T14:59:00Z'), html='', renders=0, form;
 const events={}, meta={};
 const app={set innerHTML(value){
  html=value; renders++;
  if(value.includes('id="search-form"')) {
   const date=value.match(/name="date" type="date" value="([^"]+)"/)[1];
   const elements=['prefecture','category','date','q'].map(name=>({name,value:name==='date'?date:'',defaultValue:name==='date'?date:''}));
   elements.namedItem=name=>elements.find(f=>f.name===name);
   form={elements,addEventListener(){}};
  } else form=null;
 },get innerHTML(){return html;}};
 const document={visibilityState:'visible',querySelector(s){return s==='#app'?app:s==='#search-form'?form:(meta[s]??={});},addEventListener(n,f){events[n]=f;}};
 const ctx={window:{FACILITIES:[],addEventListener(n,f){events[n]=f;}},document,URL,URLSearchParams,location:{href:'https://example.com/'+search,search},Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}}};
 vm.runInNewContext(source,ctx);
 return {events,document,html:()=>html,renders:()=>renders,field:n=>form.elements.namedItem(n),advance:t=>now=Date.parse(t)};
}
test('JST midnight refresh updates today and default date, preserving search choices',()=>{
 const b=browser(); b.field('q').value='美術'; b.field('prefecture').value='東京都';
 b.advance('2026-11-10T15:01:00Z'); b.events.focus();
 assert.match(b.html(),/明日 11月12日/);
 assert.equal(b.field('date').value,'2026-11-11');
 assert.equal(b.field('q').value,'美術'); assert.equal(b.field('prefecture').value,'東京都');
 const n=b.renders(); b.events.pageshow(); assert.equal(b.renders(),n);
});
test('hidden tabs defer refresh and explicitly chosen dates survive return',()=>{
 const b=browser(); b.field('date').value='2026-11-21';
 b.document.visibilityState='hidden'; b.advance('2026-11-11T01:00:00Z'); b.events.visibilitychange();
 assert.equal(b.renders(),1);
 b.document.visibilityState='visible'; b.events.visibilitychange();
 assert.equal(b.renders(),2); assert.equal(b.field('date').value,'2026-11-21');
});
test('relative tomorrow listing changes date when restored from page cache',()=>{
 const b=browser('?view=tomorrow'); assert.match(b.html(),/2026年11月11日/);
 b.advance('2026-11-11T01:00:00Z'); b.events.pageshow();
 assert.match(b.html(),/2026年11月12日/);
});
