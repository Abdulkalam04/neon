# Capacitor discovers native plugins reflectively; retain plugin classes and annotations.
-keepattributes *Annotation*
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.BridgeActivity { *; }

# Preserve JavaScript bridge methods exposed to WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
