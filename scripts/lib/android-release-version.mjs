/**
 * Pure helpers for the Android release-version guard (V16 Phase A).
 *
 * Rules enforced for RELEASE builds only:
 *   - versionCode present, positive integer
 *   - versionName present and non-empty
 *   - a known Play production versionCode baseline exists
 *   - versionCode strictly greater than the Play production baseline
 *   - the placeholder `versionCode 1` is rejected once a real baseline exists
 *
 * Debug builds never run this guard.
 */

export function parseGradleVersion(gradleText) {
  const codeMatch = gradleText.match(/^\s*versionCode\s+(\S+)/m);
  const nameMatch = gradleText.match(/^\s*versionName\s+"([^"]*)"/m);
  const rawCode = codeMatch ? codeMatch[1] : null;
  const versionCode = rawCode !== null && /^\d+$/.test(rawCode) ? Number.parseInt(rawCode, 10) : null;
  const versionName = nameMatch ? nameMatch[1] : null;
  return { rawCode, versionCode, versionName };
}

/**
 * @returns {{ ok: boolean, errors: string[], versionCode: number|null, versionName: string|null }}
 */
export function validateRelease(gradleText, baseline) {
  const { rawCode, versionCode, versionName } = parseGradleVersion(gradleText);
  const errors = [];

  if (rawCode === null) {
    errors.push("android/app/build.gradle: versionCode is missing.");
  } else if (versionCode === null) {
    errors.push(`android/app/build.gradle: versionCode "${rawCode}" is not a positive integer.`);
  } else if (versionCode <= 0) {
    errors.push(`android/app/build.gradle: versionCode must be > 0 (found ${versionCode}).`);
  }

  if (versionName === null || versionName.trim() === "") {
    errors.push("android/app/build.gradle: versionName is missing or empty.");
  }

  const playCode = baseline?.playProductionVersionCode ?? null;
  if (playCode === null || playCode === undefined) {
    errors.push(
      "android/release-version.json: playProductionVersionCode is not set. " +
        "Read the active production release's 'Version code' in Google Play Console " +
        "(Release → Production → active release → App bundles) and record it before releasing.",
    );
  } else if (!Number.isSafeInteger(playCode) || playCode <= 0) {
    errors.push(`android/release-version.json: playProductionVersionCode must be a positive integer (found ${playCode}).`);
  } else if (versionCode !== null) {
    if (versionCode === 1) {
      errors.push("android/app/build.gradle still contains the placeholder `versionCode 1`.");
    }
    if (versionCode <= playCode) {
      errors.push(
        `Release versionCode ${versionCode} must be strictly greater than the Play production versionCode ${playCode}.`,
      );
    }
  }

  const prefix = baseline?.releaseVersionNamePrefix;
  if (prefix && versionName && !versionName.startsWith(prefix)) {
    errors.push(`versionName "${versionName}" does not start with the expected release prefix "${prefix}".`);
  }

  return { ok: errors.length === 0, errors, versionCode, versionName };
}
