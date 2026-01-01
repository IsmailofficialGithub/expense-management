# Build Instructions for Android APK and iOS IPA

## Prerequisites

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```

3. **Verify Project Connection**:
   ```bash
   eas whoami
   ```

## Building Android APK

### Option 1: Build APK (for direct installation)
```bash
eas build --platform android --profile apk
```

### Option 2: Build AAB (for Google Play Store)
```bash
eas build --platform android --profile production
```

### Option 3: Build locally (requires Android SDK)
```bash
eas build --platform android --profile apk --local
```

## Building iOS IPA

### Option 1: Build for TestFlight/App Store
```bash
eas build --platform ios --profile production
```

### Option 2: Build for internal distribution
```bash
eas build --platform ios --profile ios-preview
```

### Option 3: Build locally (requires macOS and Xcode)
```bash
eas build --platform ios --profile ios-preview --local
```

## Build Status

After starting a build, you can:
- Check build status: `eas build:list`
- View build details: Visit https://expo.dev/accounts/[your-account]/projects/manager/builds

## Downloading Builds

Once the build completes:
1. You'll receive an email notification
2. Download from: https://expo.dev/accounts/[your-account]/projects/manager/builds
3. Or use: `eas build:list` to see download URLs

## Important Notes

### Android:
- APK files can be installed directly on Android devices
- AAB files are required for Google Play Store submission
- Make sure `android.package` in `app.json` is set correctly

### iOS:
- IPA files require an Apple Developer account ($99/year)
- For internal testing, you can use TestFlight
- Make sure `ios.bundleIdentifier` in `app.json` is set correctly
- You may need to configure certificates and provisioning profiles

## Troubleshooting

1. **Build fails with authentication error**:
   - Run `eas login` again
   - Check your Expo account status

2. **iOS build requires credentials**:
   - Run `eas credentials` to configure certificates
   - Follow the prompts to set up your Apple Developer account

3. **Android build fails**:
   - Check that `android.package` is unique
   - Verify all dependencies are compatible

## Quick Commands Reference

```bash
# Build Android APK
eas build --platform android --profile apk

# Build iOS IPA
eas build --platform ios --profile ios-preview

# Build both platforms
eas build --platform all --profile production

# Check build status
eas build:list

# View build logs
eas build:view [build-id]
```

