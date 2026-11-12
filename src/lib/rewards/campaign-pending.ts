/** Dormant seam only. No route imports, confirmation, grant or economy writes. */
import { readDurableSaveReceipt, type DurableSaveReceipt } from '@/lib/offline/gameplay-write';
import { settlementForOwner, type Binding } from './settlement';

export interface CampaignPendingIntent {
  key: string;
  campaignId: string;
  chapterId: string;
  /** Immutable attempted authored/tier contract, NOT verified eligibility. */
  terms: string;
  operationId: string;
  revision: string;
  payloadSnapshot: string;
  expected: Binding | null;
}
export async function prepareCampaignPending(receipt: DurableSaveReceipt, intent: CampaignPendingIntent) {
  const captured = structuredClone(intent);
  const accepted = readDurableSaveReceipt(receipt);
  if (accepted.kind !== 'chapter_progress' || typeof captured.key !== 'string' ||
      !captured.key.startsWith('campaign-attempt:') || captured.key.length === 'campaign-attempt:'.length ||
      typeof captured.terms !== 'string' || !captured.terms || accepted.operationId !== captured.operationId ||
      accepted.revision !== captured.revision || accepted.payloadSnapshot !== captured.payloadSnapshot) {
    throw new Error('campaign-pending:receipt-mismatch');
  }
  const payload = JSON.parse(accepted.payloadSnapshot);
  if (typeof captured.campaignId !== 'string' || !captured.campaignId ||
      typeof captured.chapterId !== 'string' || !captured.chapterId || payload.campaignId !== captured.campaignId ||
      payload.chapterId !== captured.chapterId) throw new Error('campaign-pending:chapter-mismatch');
  const journal = settlementForOwner(accepted.owner);
  const existing = await journal.read(captured.key);
  readDurableSaveReceipt(receipt);
  if (existing?.attempts.some(a => a.progress !== 'pending'))
    throw new Error('campaign-pending:non-pending-history');
  // prepare's expected binding still arbitrates concurrent changes after this read.
  const row = await journal.prepare({
    key: captured.key, source: 'local', terms: captured.terms,
    binding: { operationId: accepted.operationId, revision: accepted.revision, snapshot: accepted.payloadSnapshot },
    expected: captured.expected, pendingOnly: true,
  });
  readDurableSaveReceipt(receipt);
  if (!row || row.attempts.some(a => a.progress !== 'pending')) throw new Error('campaign-pending:non-pending-history');
  return row;
}
