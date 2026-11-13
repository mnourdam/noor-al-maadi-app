/** Synthetic selected-surface fixture, not the full app or native navigation. */
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppShell} from '@/components/AppShell';
import {ChapterReadingReview} from '@/components/imported-campaign/ChapterReadingReview';
import {setActiveOwnerInternal} from '@/lib/identity/owner';
import type {CampaignChapter} from '@/types/campaign';
import '@/styles.css';
const metrics={mounts:0,unmounts:0};
function Activity(){useEffect(()=>{metrics.mounts++;return()=>{metrics.unmounts++}},[]);return <label>إجابة غير مرسلة<input id="unsent" className="block w-full border p-2" defaultValue=""/></label>}
function Fixture(){
 const [chapterId,setChapterId]=useState('synthetic-one');
 const chapter={id:chapterId,order:1,title:'فصل تجريبي',introText:'مقدمة عربية تجريبية.',historicalReadingText:'نص عربي تجريبي طويل للقراءة. '.repeat(35),activities:[]} as CampaignChapter;
 useEffect(()=>{Object.assign(window,{rereadShell:{metrics,changeChapter:()=>setChapterId('synthetic-two'),changeOwner:()=>setActiveOwnerInternal('user:synthetic-bob')}})},[]);
 return <AppShell><main id="arabic-page" className="p-4"><h1>نشاط عربي تجريبي</h1><Activity/><ChapterReadingReview key={chapterId} chapter={chapter} completedActivityIds={[]}/></main></AppShell>;
}
setActiveOwnerInternal('user:synthetic-alice');
createRoot(document.getElementById('app')!).render(<Fixture/>);
