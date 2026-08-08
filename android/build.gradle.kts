plugins {
    // Add the dependency for the Google services Gradle plugin
    id("com.google.gms.google-services") version "4.4.4" apply false
    // Firebase Crashlytics plugin for crash symbol mapping uploads
    id("com.google.firebase.crashlytics") version "3.0.6" apply false
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Inject missing namespace for third-party Android library modules.
// Required by AGP 8+ for plugins that do not declare `namespace`.
subprojects {
    plugins.withId("com.android.library") {
        val android = extensions.getByType<com.android.build.gradle.LibraryExtension>()

        // Align Java target with Kotlin target to avoid AGP/Kotlin mismatch errors
        // in third-party plugins (e.g. compileReleaseJavaWithJavac 1.8 vs Kotlin 17).
        android.compileOptions {
            sourceCompatibility = JavaVersion.VERSION_17
            targetCompatibility = JavaVersion.VERSION_17
        }

        if (android.namespace.isNullOrBlank()) {
            val manifest = project.file("src/main/AndroidManifest.xml")
            if (manifest.exists()) {
                val pkg = Regex("""package\s*=\s*"([^"]+)"""")
                    .find(manifest.readText())?.groupValues?.get(1)
                if (!pkg.isNullOrEmpty()) {
                    android.namespace = pkg
                }
            }

            // Fallback when manifest has no `package` attribute.
            if (android.namespace.isNullOrBlank()) {
                val safeName = project.name.replace(Regex("[^A-Za-z0-9_]"), "_")
                android.namespace = "co.lythaus.thirdparty.$safeName"
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
