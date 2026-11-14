import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {ROOT,verifySource,validateBindings} from './verify-source.mjs';
const records=JSON.parse(fs.readFileSync(`${ROOT}/public/campaign-key-art/interpretive-chapters.manifest.json`)).records;
const map=fs.readFileSync(`${ROOT}/src/lib/campaign-art/interpretive-chapters.ts`,'utf8');
test('three pinned source assets fully decode and exact map matches',async()=>assert.equal((await verifySource()).length,3));
test('missing duplicate or changed manifest fails',()=>{for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r[0].sha256='0'.repeat(64),r=>r[0].path='../escape',r=>r[0].chapter_id='other']){const r=structuredClone(records);mutate(r);assert.throws(()=>validateBindings(r,map));}});
test('changed map relation is rejected',()=>assert.throws(()=>validateBindings(records,map.replace('ch5','ch6'))));
