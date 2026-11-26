import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context = {window:{}, document:{querySelector(){return null;}}, Date, URL, URLSearchParams, location:{href:'https://example.com/', search:''}};
vm.runInNewContext(await readFile(new URL('../data.js', import.meta.url), 'utf8'), context);
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
// Run the actual browser calendar code without mounting the UI.
vm.runInNewContext(source.replace('  render();\n})();', '  window.calendarCheck = openOn;\n})();'), context);
const get = id => context.window.FACILITIES.find(f => f.facility_id === id);
test('browser calendar respects museum holiday closure rules', () => {
  for (const id of ['tokyo-fire-museum','banknote-postage-museum']) {
    for (const [day, expected] of [['2026-10-12',true],['2026-10-13',false],['2026-05-04',true],['2026-05-05',true],['2026-05-06',true],['2026-05-07',false],['2026-12-29',false]]) {
      assert.equal(context.window.calendarCheck(get(id), new Date(day+'T00:00:00Z')), expected, id+' '+day);
    }
  }
  assert.equal(context.window.calendarCheck(get('police-museum'), new Date('2026-05-05T00:00:00Z')),false);
  assert.equal(context.window.calendarCheck(get('police-museum'), new Date('2026-05-06T00:00:00Z')),true);
  assert.equal(context.window.calendarCheck(get('tokyo-fire-museum'), new Date('2029-10-01T00:00:00Z')),true);
});

test('Hasseiden browser calendar excludes the complete official year-end closure',()=>{
 const f=get('yokohama-hasseiden-museum');
 for(const [day,expected] of [['2026-12-27',true],['2026-12-28',false],['2027-01-04',false],['2027-01-05',true],['2026-10-21',false],['2026-10-24',true]]){
  assert.equal(context.window.calendarCheck(f,new Date(day+'T00:00:00Z')),expected,day);
 }
});

test('new facilities honor holidays and bounded schedule confirmation',()=>{
 for(const [id,d,ok] of [
 ['jma-weather-museum','2026-10-12',true],['jma-weather-museum','2026-10-13',false],['jma-weather-museum','2026-10-14',false],
 ['jma-weather-museum','2026-11-09',false],['jma-weather-museum','2026-11-10',false],['jma-weather-museum','2026-11-11',true],
 ['nikon-museum','2026-11-21',true],['nikon-museum','2026-11-22',false],['nikon-museum','2026-11-23',false],['nikon-museum','2026-12-01',false],
 ['kodaira-gas-museum','2026-11-23',true],['kodaira-gas-museum','2026-11-24',false],['kodaira-gas-museum','2026-12-01',false],
 ['suginami-animation-museum','2026-11-23',true],['suginami-animation-museum','2026-11-24',false],['suginami-animation-museum','2026-12-28',false]])
 assert.equal(context.window.calendarCheck(get(id),new Date(d+'T00:00:00Z')),ok,id+' '+d);
 assert.equal(get('postal-museum-japan').free_rules.some(r=>r.type==='always_free'),false);
});
