import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CachedImage } from '@/components/CachedImage';
import { NotificationThumbnail } from '@/components/notifications/NotificationThumbnail';
const baseline = new URL(location.href).searchParams.get('mode') === 'baseline';
function Fixture() {
  const [clicks, click] = useState(0);
  return <><button id="action" onClick={() => click(n => n + 1)}>Action {clicks}</button>
    {Array.from({ length: 150 }, (_, i) => <article key={i}>
      {baseline ? <CachedImage src={`${location.origin}/images/${i}.svg`} alt="" loading="lazy" />
        : <NotificationThumbnail src={`${location.origin}/images/${i}.svg`} notificationId={String(i)} />}
      <span>Synthetic notice {i}</span>
    </article>)}
  </>;
}
let root = createRoot(document.getElementById('app')!);
function mount() { flushSync(() => root.render(<Fixture />)); }
Object.assign(window, { fixture: {
  remount() { root.unmount(); root = createRoot(document.getElementById('app')!); mount(); },
  cached: async () => (await (await caches.open('irth-images-v1')).keys()).length,
} });
mount();
