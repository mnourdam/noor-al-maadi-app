import React from 'react';import {createRoot} from 'react-dom/client';
import {EncyclopediaSources} from '@/components/encyclopedia/EncyclopediaSources';
import {EncyclopediaOriginalReferences} from '@/components/encyclopedia/EncyclopediaOriginalReferences';
import {parseEncyclopediaArticle} from '@/types/encyclopediaArticle';
// @ts-expect-error build-only hash-pinned virtual module
import records from 'virtual:disclosure-records';
import '@/styles.css';
const kind=location.hash==='#dinar'?'dinar':'duraid';const record=records[kind],article=parseEncyclopediaArticle(record.body,record.metadata);
createRoot(document.getElementById('app')!).render(<main data-fixture-kind={kind} className="mx-auto max-w-3xl p-5 text-foreground"><h1 className="font-display text-2xl">{record.title}</h1><EncyclopediaSources sources={article.sources}/><EncyclopediaOriginalReferences references={article.originalReferences}/></main>);
