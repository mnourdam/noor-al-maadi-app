/** Read-only museum presentation. Does not feed the earning engine or claim RPCs.
 * Only confirmed user_collection rows count; pending/guest/legacy profile arrays do not.
 * Cache is memory-only and scoped to owner+epoch. Offline restart relies on the
 * existing persisted achievement mirror, never on a reconstructed reward claim.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getActiveOwner, getActiveUserId, getIdentityEpoch, onOwnerChange } from '@/lib/identity/owner';
import type { AchievementView, ProgressSnapshot } from './types';
import { registry } from './index';

const EMPTY: readonly string[] = Object.freeze([]);
let scope = '';
let ids: readonly string[] = EMPTY;
let generation = 0;
let active: AbortController | null = null;
let flight: Promise<void> | null = null;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
const key = () => `${getIdentityEpoch()}:${getActiveOwner()}`;
function currentIds() { return scope === key() ? ids : EMPTY; }
function emit() { for (const cb of [...listeners]) cb(); }
function retire() {
  generation++; active?.abort(); active = null; flight = null;
  scope = key(); ids = EMPTY; emit();
}
export function refreshMuseumPresentation(replace = false): Promise<void> {
  const captured = key();
  if (scope !== captured) retire();
  if (replace && flight) { generation++; active?.abort(); active = null; flight = null; }
  if (flight) return flight;
  const uid = getActiveUserId();
  if (!uid || getActiveOwner() !== `user:${uid}`) return Promise.resolve();
  const gen = ++generation;
  const controller = new AbortController(); active = controller;
  const valid = () => gen === generation && key() === captured && !controller.signal.aborted;
  let resolveDeadline!: () => void;
  const deadline = new Promise<void>(resolve => { resolveDeadline = resolve; });
  const timer = setTimeout(() => controller.abort(), 8000);
  controller.signal.addEventListener('abort', resolveDeadline, { once: true });
  // Defer SDK invocation until after the exact flight slot is installed, so a
  // synchronous SDK throw cannot leave a permanently cached settled promise.
  const work = Promise.resolve().then(async () => {
    try {
      if (!valid()) return;
      const { data } = await supabase.auth.getSession();
      if (!valid() || data.session?.user?.id !== uid) return;
      const result = await supabase.from('user_collection').select('item_id,item_type').eq('user_id', uid).abortSignal(controller.signal);
      if (!valid() || result.error || !Array.isArray(result.data)) return;
      const next = new Set<string>();
      for (const row of result.data) {
        if (!row || typeof row.item_id !== 'string' || typeof row.item_type !== 'string') continue;
        const id = row.item_id.trim(), type = row.item_type.trim();
        if (id && type) next.add(`${type}:${id}`);
      }
      scope = captured; ids = Object.freeze([...next]); emit();
    } catch { /* Keep only this owner's last confirmed in-memory view. */ }
  });
  const task = Promise.race([work, deadline]).finally(() => {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', resolveDeadline);
    if (flight === task && gen === generation) { active = null; flight = null; }
  });
  flight = task;

  return task;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!stop) {
    const off = onOwnerChange(() => { retire(); void refreshMuseumPresentation(); });
    const refresh = () => { void refreshMuseumPresentation(); };
    const mutation = () => { void refreshMuseumPresentation(true); };
    const events = ['online', 'focus'];
    const changes = ['irth:collection:changed', 'irth:outbox:flushed'];
    for (const name of events) window.addEventListener(name, refresh);
    for (const name of changes) window.addEventListener(name, mutation);
    stop = () => { off(); for (const name of events) window.removeEventListener(name, refresh); for (const name of changes) window.removeEventListener(name, mutation); };
    void refreshMuseumPresentation();
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size) { stop?.(); stop = null; generation++; active?.abort(); active = null; flight = null; }
  };
}
export function useMuseumPresentationIds() {
  return useSyncExternalStore(subscribe, currentIds, () => EMPTY);
}
/** Existing granted rows remain authoritative. Newly satisfied rows are shown
 * unlocked (not claimed); no reward, notification or persistence is performed.
 * Thresholds remain exclusively in the existing canonical definitions.
 */
export function projectMuseumViews(views: AchievementView[], owned: readonly string[], snapshot: ProgressSnapshot): AchievementView[] {
  const ownedIds = new Set(owned);
  const projected = { ...snapshot, museum: { ...snapshot.museum, ownedIds, totalOwned: ownedIds.size } };
  return views.map(view => {
    const definition = registry.byId.get(view.id);
    if (!definition || view.category !== 'museum' || view.state === 'claimed' || view.state === 'unlocked') return view;
    const satisfied = definition.predicate(projected);
    return { ...view, progress: definition.progress(projected), state: satisfied ? 'unlocked' : view.state, ownershipPresentationOnly: satisfied };
  });
}
