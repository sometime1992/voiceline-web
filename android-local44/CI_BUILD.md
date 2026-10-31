# Local44 APK build

This directory contains the complete Local44 Android project, including its
offline piano engine, samples, and regression tests. The original source archive
is `VoiceLine_AndroidStudio_Local44_Portrait_Landscape.zip`, SHA-256
`2e17511e47a63d4d7620bede62e0e58e0fe1395acac8c694556b3b2ab1bd75c1`.

Pushing changes to `build/android-apk` runs `.github/workflows/build-local44-apk.yml`.
The workflow runs the tests, builds both APK variants, verifies their signatures
and package metadata, and compares every bundled asset to the source bytes.
Download the `VoiceLine-Local44-APKs` artifact from the completed run.

| APK | Application ID | Installation |
| --- | --- | --- |
| VoiceLine-Local44.apk | com.voiceline.app.local18 | Can update a PC-built Local44 only if its signing certificate matches. |
| VoiceLine-Local44-CI.apk | com.voiceline.app.local18.ci | Installs separately as 보이스라인 CI, with its own recordings and practice history. |

Do not uninstall an existing app to work around a signature mismatch: its local
recordings and history may be lost. This CI build does not import recordings
from another installation. Debug signing is for testing; the key is cached on
this build branch and may change if GitHub evicts that cache. A durable release
signing key is required before distributing long-term updates.

Both variants use version code 59 and target Android 35 with Android 26 minimum.
They include the Local44 portrait/landscape layout and rotation preservation.
