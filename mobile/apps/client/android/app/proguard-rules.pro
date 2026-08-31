# Capacitor / WebView
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Aparajita Secure Storage / Biometric Auth
-keep class com.aparajita.** { *; }
-dontwarn com.aparajita.**

# AndroidX Biometric (used by biometric plugin)
-keep class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**
