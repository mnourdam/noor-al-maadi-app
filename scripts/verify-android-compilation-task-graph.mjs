import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// AGP BundleAllClasses publishes classes.jar for JVM compile/runtime consumers.
// These exact debug tasks are not Android App Bundle or APK packaging.
const debugClassJars = new Set(['bundleDebugClassesToCompileJar', 'bundleDebugClassesToRuntimeJar']);

export function prohibitedTask(name) {
  return /^(assemble|sign|validateSigning)/i.test(name) ||
    (/^package/i.test(name) && !/^package.*Resources$/i.test(name)) ||
    (/^bundle/i.test(name) && !/^bundleLib/i.test(name) && !debugClassJars.has(name));
}

export function verifyTaskGraph(text) {
  const tasks = text.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(:\S+)\s+(?:SKIPPED|UP-TO-DATE|FROM-CACHE|NO-SOURCE)\b/);
    if (trimmed.startsWith(':') && !match) throw new Error('Unrecognized Gradle task line');
    return match ? [match[1].split(':').at(-1)] : [];
  });
  if (!tasks.length) throw new Error('No Gradle dry-run tasks recognized');
  const denied = tasks.filter(prohibitedTask);
  if (denied.length) throw new Error(`Prohibited compilation graph tasks: ${denied.join(', ')}`);
  return tasks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyTaskGraph(readFileSync(process.argv[2], 'utf8'));
  console.log('Compilation task graph accepted: no recognized signing/APK packaging tasks');
}
