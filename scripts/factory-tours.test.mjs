import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {selectCandidate} from '../src/social/generator.js';
const ctx={window:{},document:{querySelector(){return null;}},Date,URL,URLSearchParams,location:{href:'https://example.com/',search:''}};
vm.runInNewContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),ctx);
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
vm.runInNewContext(source.replace('  render();\n})();','  window.factoryCheck={isFreeOn,nextDateInfo,categories};\n})();'),ctx);
const factories=ctx.window.FACILITIES.filter(f=>f.category==='工場見学');
test('browser factory category discloses booking without matching a date',()=>{
 assert.ok(ctx.window.factoryCheck.categories.includes('工場見学'));
 for(const f of factories){
  assert.equal(ctx.window.factoryCheck.isFreeOn(f,new Date('2026-10-24T12:00:00Z')),false);
  assert.match(ctx.window.factoryCheck.nextDateInfo(f,new Date()).label,/要予約/);
 }
});
test('automatic SNS never promotes unconfirmed reservation availability',()=>{
 assert.equal(selectCandidate(factories,{posts:[]},new Date('2026-10-22T08:00:00Z')),null);
});
