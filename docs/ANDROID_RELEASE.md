# Android signed release

Android release builds use the version in the root `package.json`. Gradle derives
`versionName` from it and derives an increasing `versionCode` from its
`major.minor.patch` components. Bump versions before a Play release:

```sh
npm run version:bump -- patch
# or: npm run version:bump -- minor
# or: npm run version:bump -- 1.2.3
```

Commit the resulting `package.json` and `package-lock.json` changes before
creating the matching `v<version>` tag.

The Android code packs the version as `major * 1,000,000 + minor * 1,000 +
patch` (minor and patch components must each be below 1000).

The configured application ID is `com.abdulkalam04.neonserpent`. Keep it consistent in
`capacitor.config.ts`, Android's `namespace` and `applicationId`, and the Xcode
bundle identifier. Changing the ID after publishing creates a different Play
app.

## Create and protect a release keystore

Install a JDK and create the signing key once. Keep secure backups: losing this
key can prevent updates to the Play application.

```sh
keytool -genkeypair -v -keystore android/app/release-key.jks -alias neon-serpent -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties` locally (it is ignored by Git):

```properties
storeFile=app/release-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=neon-serpent
keyPassword=YOUR_KEY_PASSWORD
```

Do not commit the keystore or its passwords. Back up the keystore and passwords
in a secure password manager or encrypted vault. The Gradle release build uses
these properties; CI can instead supply `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`
environment variables.

## Build outputs

Build the static client and sync Capacitor plugins before Gradle:

```sh
npm ci
npm run build:app
npx cap sync android
```

From the repository root, build a Google Play Android App Bundle:

```sh
cd android
./gradlew bundleRelease
```

On Windows use `.\gradlew.bat bundleRelease`. The AAB is written to
`android/app/build/outputs/bundle/release/app-release.aab`.

For a signed APK suitable for direct sharing:

```sh
./gradlew assembleRelease
```

On Windows use `.\gradlew.bat assembleRelease`. The APK is written to
`android/app/build/outputs/apk/release/app-release.apk`. Directly shared APKs
must still be installed by users with permission to install unknown apps; use
the Play Store for normal distribution.

Release minification and resource shrinking are enabled. The ProGuard rules
preserve Capacitor plugin reflection and JavaScript bridge methods; all game
HTML, JavaScript, CSS, fonts, and sprites are bundled as WebView assets and are
not removed by Android code shrinking. Test a signed release install on a real
device before publishing.

## GitHub Actions

The Android workflow runs for a tag matching the `package.json` version, such as
`v1.0.1`. Add these GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: base64 encoding of the `.jks` file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create a release tag after version bumping and pushing the version commit:

```sh
git tag v1.0.1
git push origin v1.0.1
```

The workflow builds and uploads the signed AAB and APK as a 30-day Actions
artifact. Add `VITE_WS_URL` and `VITE_HTTP_URL` as GitHub Actions repository
variables so the release bundle includes the production multiplayer endpoint.
Store credentials only in GitHub Secrets, never in the repository.
