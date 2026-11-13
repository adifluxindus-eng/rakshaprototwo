# Raksha SOS — Direct Distress Android App (Kotlin)

This standalone Android Studio project sends an instant Distress SOS with device GPS coordinates directly to the Raksha AI Admin Control Room (`POST /api/incidents`) and polls `GET /api/state` to show live ambulance dispatch & ETA on the phone.

## Important Server URL Note
- Set **Backend Server URL** in the app to your **Shared App URL** (`https://ais-pre-kstq6hkfmw7ed4xwm2bpfi-494056090238.asia-east1.run.app`) after clicking **Share / Publish** in AI Studio so external Android phones can reach `/api/incidents` without browser login redirects.

## Option 1: Build `.apk` in Android Studio
1. Extract `raksha-sos-android-project.zip` and open the `android_distress_app` folder in **Android Studio** (Hedgehog / Koala or newer).
2. Let Gradle sync finish.
3. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)** (or run `./gradlew assembleDebug` in terminal).
4. Locate the generated APK at `app/build/outputs/apk/debug/app-debug.apk` and install it on any Android phone.

## Option 2: Auto-Build `.apk` via GitHub Actions (No Android Studio Needed)
1. Push the extracted `android_distress_app` folder to a GitHub repository.
2. Open the **Actions** tab → **Build Raksha SOS APK** → download the `raksha-sos-debug-apk` artifact (`app-debug.apk`).
