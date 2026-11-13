// Dormant cleanup primitive. No credentials, scheduling, or network client here.
// Caller must supply an explicitly authorized service client for the SAME project.
// Removing relational metadata is never treated as proof of byte erasure.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pathPattern = new RegExp(`^${uuid}/${uuid}/${uuid}$`, 'i');
export async function drainFeedbackImageDeletes(client, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid cleanup batch');
  const batch = await client.from('feedback_image_delete_queue').select('id,object_path').order('queued_at').limit(limit);
  if (batch.error || !Array.isArray(batch.data)) throw new Error('cleanup queue unavailable');
  let removed = 0, retained = 0;
  for (const item of batch.data) {
    if (!item || typeof item !== 'object' || typeof item.object_path !== 'string' || !pathPattern.test(item.object_path) || item.id !== item.object_path.split('/')[2]) {
      retained++; continue;
    }
    try {
      // The Storage API removes object bytes; never DELETE storage.objects in SQL.
      // Random ID tombstones prohibit path reuse, making duplicate drains safe.
      const result = await client.storage.from('feedback-images').remove([item.object_path]);
      if (result.error) { retained++; continue; }
      const ack = await client.from('feedback_image_delete_queue').delete().eq('id', item.id).eq('object_path', item.object_path);
      if (ack.error) { retained++; continue; }
      removed++;
    } catch { retained++; }
  }
  return { removed, retained };
}
