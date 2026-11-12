import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTaskGraph } from './verify-android-compilation-task-graph.mjs';

for (const name of ['packageDebug', 'packageDebugAndroidTest', 'packagePaidDebug', 'packageReleaseBundle', 'assembleDebug', 'assemblePaidDebugAndroidTest', 'signDebugBundle', 'validateSigningDebugAndroidTest', 'bundleRelease', 'bundlePaidDebug', 'bundleDebugClassesToCompileJar']) {
  test(`rejects ${name} including root tasks`, () => {
    assert.throws(() => verifyTaskGraph(`:app:${name} SKIPPED`));
    assert.throws(() => verifyTaskGraph(`:${name} SKIPPED`));
  });
}
for (const name of ['compileDebugSources', 'compileDebugJavaWithJavac', 'testDebugUnitTest', 'packageDebugResources', 'packagePaidDebugResources', 'bundleLibCompileToJarDebug', 'bundleLibRuntimeToJarDebug']) {
  test(`permits compilation dependency ${name}`, () => {
    assert.deepEqual(verifyTaskGraph(`:capacitor-android:${name} SKIPPED`), [name]);
  });
}
test('fails closed on absent or unrecognized task output', () => {
  assert.throws(() => verifyTaskGraph('BUILD SUCCESSFUL'));
  assert.throws(() => verifyTaskGraph(':app:compileDebugSources'));
});
test('rejects unsafe task after safe task', () => {
  assert.throws(() => verifyTaskGraph(':app:compileDebugSources SKIPPED\n:app:packageDebugAndroidTest SKIPPED'));
});
