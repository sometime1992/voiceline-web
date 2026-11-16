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

`asset-provenance.json` records known sources and hashes. Local93 located the
2026-10-30 generated original in the owner's files. RGBA pixels in icon-192.png,
icon-512.png and favicon.png exactly match LANCZOS resizes of that 1254px source.
The file identity, generation metadata and original hash are retained. This
establishes the creation chain; it does not assert exclusivity of AI output or
guarantee absence of all third-party claims.

Local93 replaces the estimator core in `piano.js#pitchYin` with an explicitly
attributed adaptation of yinjs 0.1.0 (Adriano Di Giovanni, MIT). The exact upstream
source, commit, file hashes, full license and adaptation notes are retained in
`vendor/yinjs/`, and the complete notice is included in offline app credits.
VoiceLine retains its input-level gates and adds bounded CMND, invalid-input
rejection, confidence checking and interpolation. Tests cover all selectable
notes across 16, 44.1 and 48kHz inputs. Do not describe this as a clean-room or
entirely independently authored implementation.

The recording-sharing help explains that song, lyric and backing-track rights
must be checked separately. It does not grant permissions to users. The
application does not bundle commercial songs or lyrics as part of this update.
