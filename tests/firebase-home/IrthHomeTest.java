package app.lovable.irth.acceptance.test;

import android.app.Activity;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.os.Bundle;
import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Synthetic-only Home acceptance. No auth, storage seeding, JS clicks or route replacement. */
@RunWith(AndroidJUnit4.class)
public class IrthHomeTest {
  private final Instrumentation inst = InstrumentationRegistry.getInstrumentation();
  private Activity activity;
  private WebView web;
  private WebView findWeb(View view) {
    if (view instanceof WebView) return (WebView)view;
    if (view instanceof ViewGroup) {
      ViewGroup group=(ViewGroup)view;
      for(int n=0;n<group.getChildCount();n++){WebView found=findWeb(group.getChildAt(n));if(found!=null)return found;}
    }
    return null;
  }
  private JSONObject observe(String expression) throws Exception {
    CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
    inst.runOnMainSync(()->web.evaluateJavascript(expression,value->{result.set(value);ready.countDown();}));
    assertTrue("javascript_callback_deadline",ready.await(5,TimeUnit.SECONDS));
    return new JSONObject(result.get());
  }
  private static final String APP="app.lovable.irth.acceptance";
  private String hash(byte[] bytes) throws Exception {
    byte[] digest=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder out=new StringBuilder();
    for(byte b:digest)out.append(String.format("%02x",b&255));return out.toString();
  }
  private String fileHash(String path) throws Exception {
    MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];
    try(FileInputStream in=new FileInputStream(path)){int n;while((n=in.read(buffer))!=-1)digest.update(buffer,0,n);}
    StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format("%02x",b&255));return out.toString();
  }
  private String expected(Bundle args,String key){String value=args.getString(key);assertNotNull(key,value);assertTrue(key,value.matches("[0-9a-f]{64}"));return value;}
  private void provenance() throws Exception {
    Bundle args=InstrumentationRegistry.getArguments();PackageManager pm=inst.getTargetContext().getPackageManager();
    assertEquals("56bd440232ca1a7b426b1b7dcf928f36f0aa76ce",args.getString("sourceSha"));
    assertEquals(APP,pm.getInstrumentationInfo(inst.getComponentName(),0).targetPackage);
    assertEquals(APP+".test",inst.getContext().getPackageName());
    assertEquals(expected(args,"appSha256"),fileHash(inst.getTargetContext().getApplicationInfo().sourceDir));
    assertEquals(expected(args,"testSha256"),fileHash(inst.getContext().getApplicationInfo().sourceDir));
    for(String name:new String[]{APP,APP+".test"}){
      PackageInfo info=pm.getPackageInfo(name,PackageManager.GET_SIGNING_CERTIFICATES);
      assertNotNull("signing_info",info.signingInfo);Signature[] signers=info.signingInfo.getApkContentsSigners();
      assertEquals("single_signer",1,signers.length);assertEquals(expected(args,"signerSha256"),hash(signers[0].toByteArray()));
    }
    File data=new File(inst.getTargetContext().getApplicationInfo().dataDir);
    assertFalse("fresh_webview_data_required",new File(data,"app_webview").exists());
    assertFalse("fresh_native_preferences_required",new File(data,"shared_prefs/CapacitorStorage.xml").exists());
  }
  private void foreground() {
    Rect bounds=new Rect();boolean[] focused=new boolean[1];
    inst.runOnMainSync(()->{focused[0]=activity.hasWindowFocus()&&!activity.isFinishing()&&web.isShown();web.getGlobalVisibleRect(bounds);});
    assertTrue("app_not_focused",focused[0]);assertFalse("empty_webview_bounds",bounds.isEmpty());
    AccessibilityNodeInfo root=inst.getUiAutomation().getRootInActiveWindow();
    assertNotNull("active_window_unavailable",root);
    try{assertEquals("active_window_not_app",APP,String.valueOf(root.getPackageName()));}finally{root.recycle();}
    java.util.List<AccessibilityWindowInfo> windows=inst.getUiAutomation().getWindows();
    assertFalse("native_window_inventory_unavailable",windows.isEmpty());int owners=0;
    for(AccessibilityWindowInfo window:windows){
      Rect rect=new Rect();window.getBoundsInScreen(rect);AccessibilityNodeInfo node=window.getRoot();
      String pkg=node==null?"":String.valueOf(node.getPackageName());if(node!=null)node.recycle();
      if(window.getType()==AccessibilityWindowInfo.TYPE_APPLICATION&&APP.equals(pkg)&&window.isActive()&&window.isFocused())owners++;
      else assertFalse("unknown_native_overlay",Rect.intersects(bounds,rect));
    }
    assertEquals("unique_focused_application",1,owners);
  }
  private void bridge() throws Exception {
    JSONObject begin=observe("(()=>{if(Object.prototype.hasOwnProperty.call(window,'__IRTH_HOME_BRIDGE_CHECK__'))return {started:false};window.__IRTH_HOME_BRIDGE_CHECK__={pending:true};Capacitor.Plugins.App.getState().then(x=>{window.__IRTH_HOME_BRIDGE_CHECK__={pending:false,active:x.isActive===true}},()=>{window.__IRTH_HOME_BRIDGE_CHECK__={pending:false,active:false}});return {started:true}})()");
    assertTrue("bridge_probe_collision",begin.getBoolean("started"));
    try{long end=SystemClock.elapsedRealtime()+5000;boolean active=false;
      while(SystemClock.elapsedRealtime()<end){JSONObject v=observe("window.__IRTH_HOME_BRIDGE_CHECK__");if(!v.optBoolean("pending")){active=v.optBoolean("active");break;}SystemClock.sleep(50);}
      assertTrue("App_getState_inactive_or_timeout",active);
    }finally{observe("(()=>{delete window.__IRTH_HOME_BRIDGE_CHECK__;return {cleared:true}})()");}
  }
  private JSONObject guardedState() throws Exception {
    foreground();JSONObject s=observe(PROBE);JSONObject c=s.getJSONObject("checks");
    assertTrue("fixture_or_guard_failure",c.getBoolean("fixture")&&c.getBoolean("native")&&c.getBoolean("guards")&&!c.getBoolean("unknown"));
    return s;
  }
  private void tapAndTransition(JSONObject original) throws Exception {
    guardedState();bridge();JSONObject fresh=guardedState();assertTrue("target_disappeared",fresh.has("tap"));
    JSONObject point=fresh.getJSONObject("tap"),old=original.getJSONObject("tap");
    assertEquals("target_stage_changed",old.getString("stage"),point.getString("stage"));
    for(String key:new String[]{"x","y","left","top","right","bottom"})assertEquals("target_geometry_changed",old.getDouble(key),point.getDouble(key),0.5);
    float x=(float)point.getDouble("x"),y=(float)point.getDouble("y");
    int[] origin=new int[2];float[] scale=new float[1];
    inst.runOnMainSync(()->{web.getLocationOnScreen(origin);scale[0]=web.getScale();});
    foreground();long t=SystemClock.uptimeMillis();
    MotionEvent down=MotionEvent.obtain(t,t,MotionEvent.ACTION_DOWN,origin[0]+x*scale[0],origin[1]+y*scale[0],0);
    MotionEvent up=MotionEvent.obtain(t,t+80,MotionEvent.ACTION_UP,origin[0]+x*scale[0],origin[1]+y*scale[0],0);
    try{inst.sendPointerSync(down);inst.sendPointerSync(up);}finally{down.recycle();up.recycle();}
    long end=SystemClock.elapsedRealtime()+8000;boolean transitioned=false;
    while(SystemClock.elapsedRealtime()<end){JSONObject after=guardedState();if(!after.getString("stage").equals(point.getString("stage"))){transitioned=true;break;}SystemClock.sleep(100);}
    assertTrue("no_post_action_transition_no_retry",transitioned);
  }
  @Test public void syntheticGuestReachesRealHome() throws Throwable {
    String target=inst.getTargetContext().getPackageName();
    assertEquals("app.lovable.irth.acceptance",target);
    assertEquals("must_not_have_network",PackageManager.PERMISSION_DENIED,
      inst.getTargetContext().getPackageManager().checkPermission("android.permission.INTERNET",target));
    provenance();
    AccessibilityServiceInfo oldService=inst.getUiAutomation().getServiceInfo();
    assertNotNull("accessibility_service_info_missing",oldService);
    final int originalFlags=oldService.flags;
    // Body protection begins BEFORE mutating flags, setting service info or launching Activity.
    SafeCleanup.run(() -> {
      oldService.flags=originalFlags|AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      inst.getUiAutomation().setServiceInfo(oldService);
      Intent launch=new Intent().setClassName(target,"app.lovable.irth.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity=inst.startActivitySync(launch);
      inst.runOnMainSync(()->web=findWeb(activity.getWindow().getDecorView()));
      assertNotNull("webview_missing",web);
      long pollBudgetEnd=SystemClock.elapsedRealtime()+150000;Set<String> completed=new HashSet<>();boolean passed=false;
      while(SystemClock.elapsedRealtime()<pollBudgetEnd){
        JSONObject state=observe(PROBE);
        android.util.Log.i("IRTH_HOME_TEST",state.optJSONObject("checks").toString());
        if(state.optBoolean("ready")){guardedState();bridge();JSONObject last=guardedState();assertTrue("home_changed",last.getBoolean("ready"));passed=true;break;}
        if(state.has("tap")){String stage=state.getString("stage");assertTrue("stage_repeated_no_blind_retry",completed.add(stage));tapAndTransition(state);}
        else SystemClock.sleep(500);
      }
      assertTrue("home_not_accepted_in_150s_poll_budget; enclosing_steps_may_extend_wall_time",passed);
    }, () -> {
      if(activity!=null)inst.runOnMainSync(()->activity.finish());
    }, () -> {
      oldService.flags=originalFlags;
      inst.getUiAutomation().setServiceInfo(oldService);
    });
  }
  private static final String PROBE = "(()=>{\nconst visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible'&&Number(getComputedStyle(e).opacity)>0;\nconst profile=visible(document.querySelector(\"#root a[href='/profile'][aria-label='بطاقة هويتك — الذهاب إلى حسابي']\"));\nconst investigations=visible(document.querySelector(\"#root [data-testid='home-stat-investigations'][href='/investigations']\"));\nconst splash=!!document.querySelector('#irth-boot-splash,.splash-root');\nconst dialogs=[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(visible);\nconst cinematic=document.querySelector('[data-irth-cinematic-opening][role=dialog]');\nconst guest=document.querySelector('[data-irth-first-launch][role=dialog]');\nconst tutorial=document.querySelector('[role=dialog][aria-labelledby=\"irth-tutorial-title\"]');\nconst skips=dialogs.filter(e=>e.getAttribute('role')==='alertdialog'&&e.querySelector('h2')?.textContent.trim()==='هل تريد تخطي الجولة؟');\nconst skip=skips.length===1?skips[0]:null;\nconst unknown=dialogs.some(e=>![cinematic,guest,tutorial,skip].includes(e));\nconst native=!!window.Capacitor&&Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';\nconst obs=typeof window.__IRTH_NATIVE_OBSERVATIONS__==='function'?window.__IRTH_NATIVE_OBSERVATIONS__():null;\nconst guards=!!obs&&obs.unexpected===0&&obs.nativeBlocked===0&&obs.bridgeGuardsIntact===true;\nconst fixture=window.__IRTH_NATIVE_FIXTURE__?.origin==='https://irth-fixture.invalid'&&location.origin==='https://localhost';\nconst checks={root:location.pathname==='/',profile,investigations,splash,dialog:dialogs.length>0,native,guards,fixture,unknown};\nconst stage=visible(cinematic)?'cinematic':visible(skip)?'tutorial-confirm':visible(guest)?'guest':visible(tutorial)?'tutorial':'none';\nconst out={ready:checks.root&&profile&&investigations&&!splash&&!checks.dialog&&native&&guards&&fixture&&!unknown,checks,stage};\n// Only exact known, currently topmost choices; never route or persistence writes.\nif(!fixture||!native||!guards||unknown||splash||stage==='cinematic')return out;\nconst scope=stage==='guest'?guest:stage==='tutorial-confirm'?skip:stage==='tutorial'?tutorial:null;\nconst label=stage==='guest'?'اللعب كضيف':'تخطي';\nconst matches=scope?[...scope.querySelectorAll('button')].filter(b=>visible(b)&&!b.disabled&&b.textContent.trim()===label):[];\nif(matches.length===1){const e=matches[0],r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;\nif(r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(x,y)))out.tap={x,y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,stage};}\nreturn out;\n})()\n";
}
