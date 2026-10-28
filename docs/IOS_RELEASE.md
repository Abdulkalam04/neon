# iOS signing and release

iOS signing and archive creation require a Mac running a supported version of
Xcode. Device distribution and TestFlight/App Store uploads also require a
paid Apple Developer Program account. The project can be inspected on other
platforms, but signing and archiving cannot be completed there.

## Prepare the app

1. Choose a globally unique reverse-DNS bundle identifier, then replace the
   placeholder `com.yourname.neonserpent` in `capacitor.config.ts`.
2. Rebuild and sync the native project:

   ```sh
   npm ci
   npm run build:app
   npx cap sync ios
   npx cap open ios
   ```

3. In Xcode, select the **App** project and **App** target. Under **Signing &
   Capabilities**, select your Apple Developer team and confirm the Bundle
   Identifier matches the Capacitor app ID. Enable automatic signing unless
   your organization requires managed profiles.
4. Review the app name and version/build numbers. Set the display version to
   the release version and increment the build number for each upload. Confirm
   only the capabilities actually used by the app are enabled; online play
   uses ordinary network access and room sharing invokes the native share
   sheet, neither requires a special entitlement.
5. Select a generic iOS device or **Any iOS Device (arm64)** as the destination,
   then choose **Product → Archive**.
6. In Organizer, validate the archive and choose **Distribute App → App Store
   Connect → Upload**. Resolve any App Store Connect validation errors and
   wait for processing.
7. In App Store Connect, add the processed build to a TestFlight group, enter
   the requested compliance and review information, and invite internal or
   external testers. External testing may require Beta App Review.

Before uploading, replace the placeholder app ID and confirm that the privacy
policy URL, store listing, age rating, screenshots, and privacy disclosures
match the release. Preserve the same bundle identifier for later updates.

## Local device testing

For a signed device build, configure the team and provisioning profile in Xcode,
connect a registered device, and choose **Product → Run**. Simulator builds do
not require a paid developer account, but physical-device signing and
TestFlight distribution require appropriate Apple account access.
