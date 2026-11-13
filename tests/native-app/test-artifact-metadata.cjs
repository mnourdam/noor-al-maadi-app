const {test}=require('node:test');const assert=require('node:assert/strict');const {validate}=require('./artifact-metadata.cjs');
const expected={id:'123',digest:'a'.repeat(64),sha:'b'.repeat(40),run:456,repository:789,name:'synthetic-apk-456-1'};
const good={id:123,name:expected.name,expired:false,digest:'sha256:'+expected.digest,workflow_run:{id:456,head_sha:expected.sha,head_branch:'v18-01a-outbox-recovery',repository_id:789}};
test('exact current-run binding',()=>assert.equal(validate(good,expected),true));
test('foreign metadata rejected',()=>{for(const patch of [{id:124},{name:'other'},{expired:true},{digest:'sha256:'+'c'.repeat(64)},{workflow_run:{...good.workflow_run,id:457}},{workflow_run:{...good.workflow_run,head_sha:'c'.repeat(40)}},{workflow_run:{...good.workflow_run,repository_id:790}},{workflow_run:{...good.workflow_run,head_branch:'main'}}])assert.throws(()=>validate({...good,...patch},expected));});
test('invalid trusted output format fails closed',()=>{for(const patch of [{id:'1;cmd'},{id:'99999999999999999999'},{digest:'invalid'},{sha:'bad'}])assert.throws(()=>validate(good,{...expected,...patch}));});
