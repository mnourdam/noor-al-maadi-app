import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProfileProvider,useProfile} from '@/lib/profile';
import {AppShell} from '@/components/AppShell';
import {setActiveOwnerInternal} from '@/lib/identity/owner';
import '@/styles.css';
const w=window as any;
const profileKey='hakaya.profile.v2', filler='__fixture_only_profile_quota_filler__';
const nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem,nativeClear=Storage.prototype.clear;
const preserved=['irth.daily-challenges.2026-11-14','irth.daily-quest.history','irth.outbox.fallback.v1','irth_campaign_grants_v2','irth.reflections'];
setActiveOwnerInternal('guest:quota-synthetic');
nativeSet.call(localStorage,profileKey,JSON.stringify({name:'Synthetic player',loggedIn:false,points:100,dinars:50,hearts:3,heartsAt:Date.now()}));
for(const key of preserved)nativeSet.call(localStorage,key,JSON.stringify({synthetic:true,retained:'x'.repeat(256)}));
const before=Object.fromEntries([profileKey,...preserved].map(key=>[key,localStorage.getItem(key)]));
let writes=0,quotaFailures=0,removes=0,clears=0,fillAttempts=0,nativeFillQuota=false;
// Transparent observation only: all storage behavior remains native Chromium.
Storage.prototype.setItem=function(key,value){if(this===localStorage&&key===profileKey)writes++;try{return nativeSet.call(this,key,value)}catch(error){if(this===localStorage&&key===profileKey&&error instanceof DOMException&&error.name==='QuotaExceededError')quotaFailures++;throw error}};
Storage.prototype.removeItem=function(key){removes++;return nativeRemove.call(this,key)};
Storage.prototype.clear=function(){clears++;return nativeClear.call(this)};
let api:ReturnType<typeof useProfile>;
function snapshot(){return {hydrated:api?.hydrated,outcome:api?.getPersistence().outcome,writes,quotaFailures,removes,clears,fillAttempts,nativeFillQuota,retained:Object.entries(before).every(([key,value])=>localStorage.getItem(key)===value),savedProfile:localStorage.getItem(profileKey)}}
w.quotaFixture={snapshot,fill(){
 if(!api?.hydrated||localStorage.getItem(filler)!==null)throw Error('fixture admission failed');
 const start=performance.now();let low=0,high=8*1024*1024;
 const attempt=(length:number)=>{if(++fillAttempts>40||performance.now()-start>5000)throw Error('bounded fill exceeded');try{nativeSet.call(localStorage,filler,'f'.repeat(length));return true}catch(error){if(!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error;nativeFillQuota=true;return false}};
 if(attempt(high))throw Error('quota not reached within cap');
 while(low<high){const middle=Math.ceil((low+high)/2);if(attempt(middle))low=middle;else high=middle-1}
 if(!nativeFillQuota||low===0||!snapshot().retained)throw Error('quota evidence absent');
 return {fillerCharacters:low,fillAttempts,nativeFillQuota};
},grow(){api.applyServerStats({xp:100000000000})},freeOwnFiller(){if(!snapshot().retained)throw Error('retention must pass before harness frees filler');nativeRemove.call(localStorage,filler)},recover(){api.applyServerStats({xp:101})}};
function Probe(){api=useProfile();const [clicks,setClicks]=useState(0);return <AppShell><h1>Synthetic player remains mounted</h1><button onClick={()=>setClicks(x=>x+1)}>Interact {clicks}</button></AppShell>}
createRoot(document.getElementById('app')!).render(<ProfileProvider><Probe/></ProfileProvider>);
