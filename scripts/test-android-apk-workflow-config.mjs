import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync(new URL('../.github/workflows/build-android.yml', import.meta.url), 'utf8');
test('original APK workflow uses compatible Node and Java toolchains', () => {
  assert.match(workflow, /node-version:\s*["']24["']/);
  assert.match(workflow, /java-version:\s*["']21["']/);
});
test('original APK workflow installs reproducibly and builds Android web assets once through sync', () => {
  assert.match(workflow, /run: npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /run: npm install/);
  assert.doesNotMatch(workflow, /run: npm run build:android:web/);
  assert.equal((workflow.match(/run: npm run sync:android/g) ?? []).length, 1);
});
test('existing trigger and debug artifact scope remains unchanged', () => {
  assert.match(workflow, /branches: \[main, master\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /v18-01a-outbox-recovery|pull_request:/);
  assert.match(workflow, /run: cd android && \.\/gradlew assembleDebug/);
  assert.match(workflow, /path: android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.doesNotMatch(workflow, /assembleRelease|bundleRelease|secrets\./);
});
