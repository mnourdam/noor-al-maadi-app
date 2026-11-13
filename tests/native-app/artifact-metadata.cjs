'use strict';
function validate(meta, expected) {
  const fail = () => { throw new Error('artifact_metadata_validation'); };
  if (!/^[1-9][0-9]*$/.test(expected.id) || !Number.isSafeInteger(Number(expected.id)) || !/^[0-9a-f]{64}$/.test(expected.digest) || !/^[0-9a-f]{40}$/.test(expected.sha)) fail();
  if (meta.id !== Number(expected.id) || meta.name !== expected.name || meta.expired !== false || meta.digest !== `sha256:${expected.digest}` || meta.workflow_run?.id !== expected.run || meta.workflow_run?.head_sha !== expected.sha || meta.workflow_run?.head_branch !== 'v18-01a-outbox-recovery' || meta.workflow_run?.repository_id !== expected.repository) fail();
  return true;
}
module.exports = {validate};
