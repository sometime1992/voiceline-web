# VoiceLine copyright and license maintenance

Local86 adds the complete Apache License 2.0 to offline notices, together with
the exact runtime component coordinates and any license/NOTICE text present in
the resolved JARs/AARs. Existing MIT, 0BSD and CC BY 3.0 notices are retained.

## Android packaging

`android-local44/third-party-notices.gradle` resolves both
`ciDebugRuntimeClasspath` and `releaseRuntimeClasspath` before asset merging.
It checks each packaged artifact's published POM license and generates:

- `third-party-notices.js`: the existing offline help data, with upstream text.
- `THIRD-PARTY-NOTICES.txt`: the same readable notices in one file.
- `THIRD-PARTY-COMPONENTS.json`: exact versions, source POMs, variant membership,
  artifact/POM SHA-256 digests and supplied notice-file digests.

Missing metadata or a newly introduced license outside Apache 2.0 fails the
build for review. This gate applies to Android dependencies only. The unchanged
JavaScript bundle has separately retained notices in `legal/third-party-base.json`;
rebuilding that bundle requires a separate input/version/license review.

The source asset copies are regenerated during Android builds. When updating
Android dependencies, review and commit the regenerated output. Do not edit the
generated notices to invent copyright dates or declarations. License text stays
in its original form in either app language.

`ci/verify-third-party-notices.py` checks the generated data and the actual
APK/AAB after packaging. Exact component versions come from Gradle resolution,
not guesses from incomplete APK version markers. Full application regression
and bilingual UI checks remain in the Android workflow.

## Asset rights evidence

`asset-provenance.json` records known sources and hashes. An unknown field is
left unknown. The current icon is preserved; its original creation, purchase or
permission record still needs to be associated with the asset. Selecting an
image is not itself evidence of reproduction or distribution rights.

The pitch detector is implemented in `piano.js` as `pitchYin`; source-code
history is not replaced by an unsupported claim of independent authorship.
Keep a record of any external implementation reused or adapted.

The recording-sharing help explains that song, lyric and backing-track rights
must be checked separately. It does not grant permissions to users. The
application does not bundle commercial songs or lyrics as part of this update.
