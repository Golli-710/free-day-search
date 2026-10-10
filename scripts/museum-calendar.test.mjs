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
