// Data-only TypeScript compilation. Never loads target modules or vendor build scripts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require(process.env.REPRO_ESBUILD_MODULE);
const root=path.resolve(process.env.REPRO_SOURCE_ROOT),src=path.join(root,'src'),out=path.join(root,'dist');
process.chdir(root);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const lock=JSON.parse(fs.readFileSync(process.env.REPRO_COMPILER_LOCK));
const expectedIntegrity='sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==';
if(esbuild.version!=='0.28.1'||lock.packages['node_modules/esbuild'].integrity!==expectedIntegrity)throw Error('compiler pin mismatch');
if(hash(fs.readFileSync('tsconfig.json'))!=='b8c6c4bc7b12b1bacbcfda6c537523f52fafa1eab48f6a3e5e65bf22e5b355ae'||hash(fs.readFileSync('tree.json'))!=='4325735eb4092a1eba5509c4923548e759a6370f2b6ea86283c01dc4d447c318')throw Error('input configuration mismatch');
const known=new Set(JSON.parse(fs.readFileSync('tree.json')));
const config=JSON.parse(fs.readFileSync('tsconfig.json'));
const aliases=Object.entries(config.compilerOptions.paths).map(([from,[to]])=>[from.replace('*',''),path.resolve(to.replace('*',''))]);
function resolveSource(specifier,fromDir){
 const alias=aliases.find(([prefix])=>specifier.startsWith(prefix));
 if(!alias&&!specifier.startsWith('.'))return;
 const base=alias?path.join(alias[1],specifier.slice(alias[0].length)):path.resolve(fromDir,specifier);
 for(const file of [base+'.ts',path.join(base,'index.ts')])if(known.has(path.relative(root,file).split(path.sep).join('/')))return file;
}
function rewrite(code,sourceFile){return code.replace(/\b(require|import)\("([^"]+)"\)/g,(match,call,specifier)=>{
 const target=resolveSource(specifier,path.dirname(sourceFile));if(!target)return match;
 const relative=path.relative(path.dirname(sourceFile),target).split(path.sep).join('/').replace(/\.ts$/,'.js');
 return `${call}("${relative.startsWith('.')?relative:'./'+relative}")`;
});}
const modules=['storage/uploader','storage/database/pg','internal/hashing/string-to-int'];
const expected=['ca2d0c3c5ebfcc87288bbce37e964caead2fd6910db405a5618ff3425a54b702','5dd19ee62c62810fe0468434473beaeeb96af0ea54c0e31f2e7a49de8e717b7c','608f76b3aca24e7e17395e5dd0b8857919a60f82e90813057b967b41b0f3d630'];
const inputs=['e44e5458f70c9279e81f66c83ca82ef31de6fe84f1917903615095df5280716e','d3bcfa58b849cfe17e7fa311ecc3b119f50e0b41fc43e10024d761b03851496e','bab1e69c782912ba45b4a781e20883cc8df21a58614d07b29a2907f8827f272a'];
modules.forEach((name,i)=>{if(hash(fs.readFileSync(path.join(src,name+'.ts')))!==inputs[i])throw Error('input source mismatch')});
(async()=>{
 const result=await esbuild.build({absWorkingDir:root,entryPoints:modules.map(x=>'./src/'+x+'.ts'),bundle:false,outdir:out,platform:'node',format:'cjs',target:'node24',sourcemap:true,tsconfig:'tsconfig.json',loader:{'.ts':'ts'},write:false});
 for(const file of result.outputFiles){let b=file.contents;if(file.path.endsWith('.js'))b=Buffer.from(rewrite(file.text,path.join(src,path.relative(out,file.path)).replace(/\.js$/,'.ts')));fs.mkdirSync(path.dirname(file.path),{recursive:true});fs.writeFileSync(file.path,b);}
 const comparison=modules.map((name,i)=>{const input=fs.readFileSync(path.join(src,name+'.ts')),compiled=fs.readFileSync(path.join(out,name+'.js'));return {module:name,input_sha256:hash(input),compiled_bytes:compiled.length,compiled_sha256:hash(compiled),observed_sha256:expected[i],matches:hash(compiled)===expected[i]};});
 const evidence={compiler:esbuild.version,compiler_integrity:expectedIntegrity,official_revision:'872757184c35626fef3d84f35e0b3c4fa82af1b6',tsconfig_sha256:hash(fs.readFileSync('tsconfig.json')),tree_inventory_sha256:hash(fs.readFileSync('tree.json')),script_sha256:hash(fs.readFileSync(__filename)),comparisons:comparison,all_match:comparison.every(x=>x.matches),target_modules_executed:false};
 fs.writeFileSync('comparison.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
})();
