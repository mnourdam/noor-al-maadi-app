import {createElement,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {useOnline} from '@/hooks/useOnline';
import {applyContentUpdate,getContentUpdateState} from '@/lib/offline-content-update';
import {loadSnapshot,saveSnapshot,SNAPSHOT_SCHEMA_VERSION} from '@/lib/offline-storage';
import {ensureLocalSnapshotLoaded,localEncyclopediaAll,localSnapshotInfo} from '@/lib/local-first-store';
function ConnectivityObserver(){
 const online=useOnline();
 useEffect(()=>{Object.assign(window,{observedOnline:online});},[online]);
 return null;
}
async function start(){
 if(!await loadSnapshot()){
  const collections={encyclopedia_entities:Array.from({length:1500},(_,id)=>({id:String(id),title:'baseline',enabled:true})),admin_campaigns:[{id:'campaign',slug:'campaign',status:'published',data:{chapters:[]}}]};
  await saveSnapshot({snapshot_version:1,schema_version:SNAPSHOT_SCHEMA_VERSION,generated_at:'2020-01-01T00:00:00Z',collections,content_counts:{encyclopedia_entities:1500,admin_campaigns:1}});
 }
 await ensureLocalSnapshotLoaded();
 const observer=document.createElement('div');document.body.appendChild(observer);
 createRoot(observer).render(createElement(ConnectivityObserver));
 Object.assign(window,{runtime:{apply:applyContentUpdate,state:getContentUpdateState,durable:async()=>{const s=await loadSnapshot();return {version:s?.snapshot_version,title:s?.collections.encyclopedia_entities[0]?.title,count:s?.collections.encyclopedia_entities.length,checksum:s?.checksum}},local:()=>({count:localEncyclopediaAll().length,title:localEncyclopediaAll()[0]?.title}),active:()=>({version:localSnapshotInfo()?.snapshot_version,titles:[...new Set(localEncyclopediaAll().map(row=>row.title))]})},ready:true});
}
void start();
