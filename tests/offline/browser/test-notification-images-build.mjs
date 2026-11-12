import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const output of ['', 'relative', '/tmp/not-approved/site', '/tmp/irth-notification-images-x/../../unsafe']) {
  test(`reject output ${JSON.stringify(output)}`, () => {
    const result = spawnSync(process.execPath, ['tests/offline/browser/build-notification-images.mjs', output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /isolated temporary output required/);
  });
}
