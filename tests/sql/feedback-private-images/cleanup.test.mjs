import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drainFeedbackImageDeletes} from '../../../scripts/lib/feedback-media-cleanup.mjs';
const id='33333333-3333-4333-8333-333333333333';
const path=`11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${id}`;
function fixture(rows=[{id,object_path:path}],options={}){
 const calls=[]; const state={rows};
 return {calls,state,client:{
  from(table){assert.equal(table,'feedback_image_delete_queue');return {
   select(columns){assert.equal(columns,'id,object_path');return {order(column){assert.equal(column,'queued_at');return {limit:async(n)=>{calls.push(['list',n]);return {data:[...state.rows],error:options.listError};}};}};},
   delete(){return {eq(key,value){assert.equal(key,'id');assert.equal(value,id);return {eq:async(k,v)=>{assert.equal(k,'object_path');assert.equal(v,path);calls.push(['ack',value,v]);if(!options.ackError)state.rows=[];return {error:options.ackError};}};}};}
  };},
  storage:{from(bucket){assert.equal(bucket,'feedback-images');return {remove:async(paths)=>{calls.push(['remove',paths]);if(options.throwRemove)throw new Error('network');return {error:options.removeError};}};}}
 }};
}
test('uses exact private bucket/path and acknowledges only after Storage success',async()=>{const f=fixture();assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:1,retained:0});assert.deepEqual(f.calls,[['list',25],['remove',[path]],['ack',id,path]]);});
test('Storage error never drops cleanup evidence',async()=>{const f=fixture(undefined,{removeError:new Error('failed')});assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:0,retained:1});assert.equal(f.calls.some(x=>x[0]==='ack'),false);assert.equal(f.state.rows.length,1);});
test('transport exception retains pending deletion',async()=>{const f=fixture(undefined,{throwRemove:true});assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:0,retained:1});assert.equal(f.calls.some(x=>x[0]==='ack'),false);});
test('lost acknowledgement retains retry evidence and repeats immutable deletion',async()=>{const options={ackError:new Error('uncertain')};const f=fixture(undefined,options);assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:0,retained:1});options.ackError=null;assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:1,retained:0});assert.equal(f.calls.filter(x=>x[0]==='remove').length,2);assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:0,retained:0});});
test('malformed null or unsafe rows do not remove objects or stop valid work',async()=>{const f=fixture([null,5,{}, {id,object_path:'https://other/path'},{id:'different',object_path:path},{id,object_path:path}]);assert.deepEqual(await drainFeedbackImageDeletes(f.client),{removed:1,retained:5});assert.equal(f.calls.filter(x=>x[0]==='remove').length,1);});
test('invalid limit/list failure performs no removals',async()=>{const f=fixture(undefined,{listError:new Error('offline')});await assert.rejects(()=>drainFeedbackImageDeletes(f.client,101));await assert.rejects(()=>drainFeedbackImageDeletes(f.client));assert.equal(f.calls.some(x=>x[0]==='remove'),false);});
