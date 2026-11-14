import {expect,it} from 'vitest';
import {requirePersistedForOfflineBoot} from './browser/content-runtime-startup';
it('offline fixture boot rejects missing durable data before seed admission',()=>{
 for(const absent of [null,undefined,false])expect(()=>requirePersistedForOfflineBoot('/offline-reopen.html',absent)).toThrow('requires persisted snapshot');
 expect(requirePersistedForOfflineBoot('/offline-reopen.html',{snapshot_version:2})).toBe(true);
 expect(requirePersistedForOfflineBoot('/',null)).toBe(false);
});
