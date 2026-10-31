# Local45 APK build

This directory contains the complete Local45 Android project, including its
offline piano engine, samples, and regression tests. The Local44 baseline source archive
is `VoiceLine_AndroidStudio_Local44_Portrait_Landscape.zip`, SHA-256
`2e17511e47a63d4d7620bede62e0e58e0fe1395acac8c694556b3b2ab1bd75c1`.

Pushing changes to `build/android-apk` runs `.github/workflows/build-local44-apk.yml`.
The workflow runs the tests, builds the CI45 APK, verifies their signatures
and package metadata, and compares every bundled asset to the source bytes.
Download the `VoiceLine-Local45-APKs` artifact from the completed run.

| APK | Application ID | Installation |
| --- | --- | --- |
| VoiceLine-Local45-CI.apk | com.voiceline.app.local18.ci45 | Installs separately as 보이스라인 CI45, with its own recordings and practice history. |

Do not uninstall an existing app to work around a signature mismatch: its local
recordings and history may be lost. This CI build does not import recordings
from another installation. CI45 uses an explicit signing key cached on the build branch. The public
certificate fingerprint is pinned in `ci/android-debug-cert.sha256`; a missing
key after pinning or a changed certificate blocks an update build. Earlier
Local44 CI keys were not retained, so CI45 has its own application ID and keeps
those earlier installations intact. A durable release signing key is required
before distributing long-term updates.

The build uses version code 60 and target Android 35 with Android 26 minimum.
They include the Local45 portrait/landscape layout and rotation preservation.

## Local45 sensitivity update

The default microphone sensitivity is now 민감. Use the compact 감도 button
beside each microphone mode's help button to cycle through 표준, 민감, and 최대.
The selection persists locally and applies without restarting recording or training.
Only the input detection gate changes; PCM recording gain, pitch confidence
rules, and scoring tolerances remain unchanged. Pitch analysis is scheduled
more frequently to reduce graph response delay. The control shares the existing
heading row in both orientations.
