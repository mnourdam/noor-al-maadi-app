// Test-only admission wrapper; actual entry/root are not substituted.
export async function startActualApp(load,scope=window){
 if(scope.__IRTH_NATIVE_GUARDS_INSTALLED__!==true)throw Error('fixture_guard_admission_failed');
 Object.defineProperty(scope,'__IRTH_NATIVE_REGISTERED_PLUGIN_PROBE__',{value:async()=>{
  const before=scope.__IRTH_NATIVE_OBSERVATIONS__();
  if(!before.bridgeGuardsIntact || before.unexpected!==0 || before.nativeBlocked!==0)throw Error('fixture_bridge_guard_lost');
  const [{App},{Browser}]=await Promise.all([import('@capacitor/app'),import('@capacitor/browser')]);
  const active=await App.getState();let denied=false;
  try{await Browser.open({url:'https://irth-fixture.invalid/forbidden-intent'});}catch{denied=true;}
  const after=scope.__IRTH_NATIVE_OBSERVATIONS__();
  return {appActive:active.isActive===true,denied,exactExpectedDelta:after.unexpected===before.unexpected+1 && after.nativeBlocked===before.nativeBlocked+1 && after.bridgeGuardsIntact};
 },writable:false,configurable:false});
 await load();
}
