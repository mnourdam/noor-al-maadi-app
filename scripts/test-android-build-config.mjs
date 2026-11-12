import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const activity = readFileSync(new URL('../android/app/src/main/java/app/lovable/irth/MainActivity.java', import.meta.url), 'utf8');
test('application explicitly generates BuildConfig in the activity namespace', () => {
  assert.match(gradle, /buildFeatures\s*\{\s*buildConfig\s+(?:=\s*)?true\s*\}/);
  assert.match(gradle, /namespace\s*=\s*"app\.lovable\.irth"/);
  assert.match(activity, /^package app\.lovable\.irth;/m);
});
test('native WebView debugging remains variant-gated, not unconditional', () => {
  assert.match(activity, /WebView\.setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
  assert.doesNotMatch(activity, /setWebContentsDebuggingEnabled\(\s*true\s*\)/);
  assert.doesNotMatch(gradle, /buildConfigField[^\n]*["']DEBUG["']/);
  assert.doesNotMatch(gradle, /debuggable\s*(?:=\s*)?true/);
});
