# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ============================================================
# V16 — release R8 keep rules (minifyEnabled/shrinkResources true)
# Correctness first: Capacitor, its plugins and Firebase all rely on
# reflection / manifest instantiation, which R8 cannot see.
# ============================================================

# --- Capacitor core + bridge (reflective plugin loading, JS interface) ---
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod <methods>;
}
-keepclassmembers class * extends com.getcapacitor.Plugin { *; }
-keep class com.capacitorjs.** { *; }

# --- Cordova plugins bridged through Capacitor (reflective) ---
-keep class org.apache.cordova.** { *; }

# --- App native package: MainActivity, IrthApp, RingerModePlugin ---
-keep class app.lovable.irth.** { *; }

# --- WebView @JavascriptInterface members ---
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# --- Firebase Messaging: services/receivers are manifest-instantiated ---
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# --- Annotations / signatures used by the above reflection ---
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
