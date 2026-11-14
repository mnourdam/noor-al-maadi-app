// No network client or credentials. Parent supplies synthetic bytes via stdin.
import {createDecoder} from '../../media-decoder/runner.mjs';
let size=0;const chunks=[];
try {
 for await(const chunk of process.stdin){size+=chunk.length;if(size>2097152)throw Error();chunks.push(chunk);}
 const output=await createDecoder()(Buffer.concat(chunks));
 process.stdout.write(output.bytes);
} catch (error) {process.exitCode=['decode_rejected','input_rejected'].includes(error?.message)?2:3;}
