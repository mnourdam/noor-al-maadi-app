# Durable, read-only Story image refresh route (investigation result + proposal)

## Findings (verified this turn, read-only)

- `/tmp` is a RAM disk (tmpfs). The sandbox had been up for only 3 minutes at the time of this check, so it restarted between turns. That restart wiped `/tmp/v18-story-review-m3arqaca`, which is why the outputs disappeared.
- `/mnt/documents` (the project "Files" area) links to a separate storage mount (`/tmp/r2-documents-mount`, 32 GB). It is not inside the Git repository. It still holds files dated June to August 2026, so it **does** survive sandbox restarts. This is the only supported durable export path the tools expose besides repository commits.
- The uploaded source archive is still at `/mnt/user-uploads/v18-story-source-db3282e3-sanitized.tar.gz`. It is read-only, 5,817,300 bytes, and its SHA256 `ea3572d0…9379` matches the approved value.
- Exact tool limits:
  - Each command can run for at most 600 seconds.
  - Nothing keeps running after a turn ends, and background processes do not survive a sandbox restart.
  - Anything saved to Files can be downloaded in the same turn using a file preview card.
- Not verified: who can see Files. It is project-scoped and not part of GitHub, but I cannot prove which collaborators can access it.
- Answer to "only repository commits persist?": no. Files (`/mnt/documents`) also persists, and it is not committed to GitHub.

## Can a small completed batch be exported in the same turn?

Yes. Each batch, kept to a size that finishes in under about 500 seconds, writes its images, manifest rows and logs straight into Files before the command returns. The batch becomes downloadable as soon as that command ends.

## Proposed route (not run now)

```text
Per batch (one command, <=500 s):
  re-extract approved archive -> /tmp/work (verify SHA ea3572d0...)
  read the checkpoint from Files -> pick the next N media IDs (e.g. 150)
  download with 1 attempt and concurrency 1, stopping at the first failure
  compute SHA256 and size per file -> append to batch manifest
  write to Files: v18-story-refresh/batch-NNN/{images, manifest.json, command-status.json, log}
  update the checkpoint (completed IDs + hashes) only after the batch fully succeeds
Final batch:
  merge the manifests, compare the before/after ID sets, run the existing verification gate
  stamp only if every gate passes, then zip the bundle (in /tmp) -> copy to Files
```

- Read-only: the job only reads the database and private storage, and it writes only to `/tmp` and Files. It makes no database writes, setting or permission changes, or publishing, and changes no project files.
- Private images and signed URLs are never committed to Git. Signed URLs are removed before logs are saved.
- Resumable: a restart loses at most the batch that was in progress. The checkpoint in Files is the record of what is complete.
- Each turn can run several batches. A full run is about 1,785 images (72 MB), which means roughly 12 batches over a few turns.

## Needs your approval before running

1. Using Files (`/mnt/documents/v18-story-refresh/`) as the durable export location.
2. Changing the approved source only in the temporary copy, splitting the download into batches.
3. Batch size (proposed: 150 images).
