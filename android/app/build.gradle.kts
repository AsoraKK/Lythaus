import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Add the Google services Gradle plugin
    id("com.google.gms.google-services")
    // Add Firebase Crashlytics Gradle plugin
    id("com.google.firebase.crashlytics")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val isReleaseTaskRequested = gradle.startParameter.taskNames.any { taskName ->
    val normalized = taskName.lowercase()
    // Only require key.properties for tasks that actually perform signing/packaging,
    // not for manifest processing, compilation, or other non-signing release tasks.
    (normalized.contains("assemble") || normalized.contains("bundle") || normalized.contains("package")) &&
        normalized.contains("release")
}

fun requireSigningProperty(name: String): String {
    val value = keystoreProperties[name] as String?
    if (value.isNullOrBlank()) {
        throw GradleException(
            "Missing Android release signing property '$name' in key.properties"
        )
    }
    return value
}

android {
    namespace = "co.lythaus.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "28.2.13676358"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "co.lythaus.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            if (isReleaseTaskRequested && !keystorePropertiesFile.exists()) {
                throw GradleException(
                    "Missing android/key.properties for release signing. " +
                        "Use android/key.properties.example as a template."
                )
            }

            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.create("release") {
                    storeFile = file(requireSigningProperty("storeFile"))
                    storePassword = requireSigningProperty("storePassword")
                    keyAlias = requireSigningProperty("keyAlias")
                    keyPassword = requireSigningProperty("keyPassword")
                }
            }
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    // Import the Firebase BoM
    implementation(platform("com.google.firebase:firebase-bom:34.6.0"))
    
    // Firebase Cloud Messaging and Crashlytics (versions managed by BoM)
    // Use non-KTX artifacts; KTX modules are no longer published in recent BoMs.
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.firebase:firebase-crashlytics")
    
    // Note: firebase_messaging and firebase_core Flutter packages
    // are already in pubspec.yaml and will be linked automatically
}
