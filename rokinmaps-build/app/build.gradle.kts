plugins {
    id("com.android.application")
}

android {
    namespace = "io.rokinmap"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.rokin.maps.beta"
        minSdk = 26
        targetSdk = 35
        versionCode = 16
        versionName = "0.2.15"
    }

    signingConfigs {
        getByName("debug") {
            storeFile = file("rokinmaps-dev.keystore")
            storePassword = "android"
            keyAlias = "rokinmaps_dev"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
