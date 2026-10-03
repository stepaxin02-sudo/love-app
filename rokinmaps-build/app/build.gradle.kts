plugins {
    id("com.android.application")
}

android {
    namespace = "io.rokinmap"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.rokin.maps"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.2.3"
    }

    buildTypes {
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
