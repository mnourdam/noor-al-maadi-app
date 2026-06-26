package app.lovable.irth;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

final class AndroidABFlags {
    static final String ACTION_SET = "app.lovable.irth.SET_AB_FLAGS";
    static final String ACTION_CLEAR = "app.lovable.irth.CLEAR_AB_FLAGS";
    private static final String PREFS_NAME = "irth_ab_flags";

    private AndroidABFlags() {}

    static Config read(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Config config = new Config();
        config.focus = readBoolean(intent, prefs, "focus", "irth_ab_focus", "disableGlobalFocusBlur", false);
        config.selection = readBoolean(intent, prefs, "selection", "irth_ab_selection", "disableSelectionChange", false);
        config.resize = readBoolean(intent, prefs, "resize", "irth_ab_resize", "disableKeyboardViewportResize", false);
        config.scroll = readBoolean(intent, prefs, "scroll", "irth_ab_scroll", "disableScrollIntoView", false);
        config.visual = readBoolean(intent, prefs, "visual", "irth_ab_visual", "disableFocusVisualToggles", false);
        config.campaignFocus = readBoolean(intent, prefs, "campaignFocus", "irth_ab_campaignFocus", "disableCampaignFocusLogic", false);
        config.source = sourceFor(intent, prefs);
        return config;
    }

    static void applyIntentToPrefs(Context context, Intent intent) {
        if (intent == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (hasTruthyExtra(intent, "clear") || ACTION_CLEAR.equals(intent.getAction())) {
            editor.clear();
        }
        putIfPresent(intent, editor, "focus", "irth_ab_focus", "disableGlobalFocusBlur");
        putIfPresent(intent, editor, "selection", "irth_ab_selection", "disableSelectionChange");
        putIfPresent(intent, editor, "resize", "irth_ab_resize", "disableKeyboardViewportResize");
        putIfPresent(intent, editor, "scroll", "irth_ab_scroll", "disableScrollIntoView");
        putIfPresent(intent, editor, "visual", "irth_ab_visual", "disableFocusVisualToggles");
        putIfPresent(intent, editor, "campaignFocus", "irth_ab_campaignFocus", "disableCampaignFocusLogic");
        editor.apply();
    }

    static void logStartup(String source, Config config) {
        Log.i("IRTH_AB_FLAGS", simpleLine(config));
        Log.i("IrthMainActivity", "IRTH_NATIVE_TRACE ts=" + System.currentTimeMillis()
            + " event=ab.flags source=" + source + " " + simpleLine(config) + " configSource=" + config.source);
    }

    static String simpleLine(Config config) {
        return "focus=" + config.focus
            + " selection=" + config.selection
            + " resize=" + config.resize
            + " scroll=" + config.scroll
            + " visual=" + config.visual
            + " campaignFocus=" + config.campaignFocus;
    }

    static String json(Config config) {
        return "{"
            + "\"disableGlobalFocusBlur\":" + config.focus + ","
            + "\"disableSelectionChange\":" + config.selection + ","
            + "\"disableKeyboardViewportResize\":" + config.resize + ","
            + "\"disableScrollIntoView\":" + config.scroll + ","
            + "\"disableFocusVisualToggles\":" + config.visual + ","
            + "\"disableCampaignFocusLogic\":" + config.campaignFocus
            + "}";
    }

    static String bootstrapScript(Config config) {
        String line = simpleLine(config);
        return "(function(){try{"
            + "var flags=" + json(config) + ";"
            + "window.__IRTH_ANDROID_NATIVE_AB_FLAGS__=flags;"
            + "window.__IRTH_ANDROID_NATIVE_AB_SOURCE__='" + escape(config.source) + "';"
            + "try{window.localStorage.setItem('irth:android-focus-ab-native',JSON.stringify(flags));}catch(_){}"
            + "console.info('IRTH_AB_FLAGS " + escape(line) + "');"
            + "try{window.IrthNativeDiagnostics&&window.IrthNativeDiagnostics.logInputEvent&&window.IrthNativeDiagnostics.logInputEvent('focusAB.nativeBootFlags','" + escape(line) + "');}catch(_){}"
            + "}catch(e){try{console.error('IRTH_AB_FLAGS bootstrap failed',e&&e.message);}catch(_){}}})();";
    }

    private static boolean readBoolean(Intent intent, SharedPreferences prefs, String shortKey, String prefixedKey, String jsKey, boolean fallback) {
        Boolean fromIntent = readBooleanExtra(intent, shortKey, prefixedKey, jsKey);
        if (fromIntent != null) return fromIntent;
        if (prefs.contains(shortKey)) return prefs.getBoolean(shortKey, fallback);
        if (prefs.contains(prefixedKey)) return prefs.getBoolean(prefixedKey, fallback);
        if (prefs.contains(jsKey)) return prefs.getBoolean(jsKey, fallback);
        return fallback;
    }

    private static void putIfPresent(Intent intent, SharedPreferences.Editor editor, String shortKey, String prefixedKey, String jsKey) {
        Boolean value = readBooleanExtra(intent, shortKey, prefixedKey, jsKey);
        if (value == null) return;
        editor.putBoolean(shortKey, value);
    }

    private static boolean hasTruthyExtra(Intent intent, String key) {
        Boolean value = readBooleanExtra(intent, key, "irth_ab_" + key, key);
        return value != null && value;
    }

    private static Boolean readBooleanExtra(Intent intent, String... keys) {
        if (intent == null) return null;
        Bundle extras = intent.getExtras();
        if (extras == null) return null;
        for (String key : keys) {
            if (!extras.containsKey(key)) continue;
            Object raw = extras.get(key);
            if (raw instanceof Boolean) return (Boolean) raw;
            if (raw instanceof Number) return ((Number) raw).intValue() != 0;
            if (raw instanceof String) {
                String value = ((String) raw).trim().toLowerCase();
                if ("1".equals(value) || "true".equals(value) || "yes".equals(value) || "on".equals(value)) return true;
                if ("0".equals(value) || "false".equals(value) || "no".equals(value) || "off".equals(value)) return false;
            }
        }
        return null;
    }

    private static String sourceFor(Intent intent, SharedPreferences prefs) {
        if (readBooleanExtra(intent, "focus", "selection", "resize", "scroll", "visual", "campaignFocus",
            "irth_ab_focus", "irth_ab_selection", "irth_ab_resize", "irth_ab_scroll", "irth_ab_visual", "irth_ab_campaignFocus") != null) {
            return "intent";
        }
        if (prefs.getAll().size() > 0) return "sharedPreferences";
        return "defaults";
    }

    private static String escape(String raw) {
        return raw.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ");
    }

    static final class Config {
        boolean focus;
        boolean selection;
        boolean resize;
        boolean scroll;
        boolean visual;
        boolean campaignFocus;
        String source = "defaults";
    }
}