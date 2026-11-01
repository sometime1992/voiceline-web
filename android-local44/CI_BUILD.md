# Local55 APK build

This directory contains the complete Local55 Android project, including its
offline piano engine, samples, and regression tests. The Local44 baseline source archive
is `VoiceLine_AndroidStudio_Local44_Portrait_Landscape.zip`, SHA-256
`2e17511e47a63d4d7620bede62e0e58e0fe1395acac8c694556b3b2ab1bd75c1`.

Pushing changes to `build/android-apk` runs `.github/workflows/build-local44-apk.yml`.
The workflow runs the tests, builds the CI45 APK, verifies their signatures
and package metadata, and compares every bundled asset to the source bytes.
Download the `VoiceLine-Local55-APKs` artifact from the completed run.

| APK | Application ID | Installation |
| --- | --- | --- |
| VoiceLine-Local55-CI.apk | com.voiceline.app.local18.ci45 | Updates the CI45/46/47/48 installation and preserves its recordings and practice history. |

Do not uninstall an existing app to work around a signature mismatch: its local
recordings and history may be lost. This CI build does not import recordings
from another installation. CI45 uses an explicit signing key cached on the build branch. The public
certificate fingerprint is pinned in `ci/android-debug-cert.sha256`; a missing
key after pinning or a changed certificate blocks an update build. Earlier
Local44 CI keys were not retained, so CI45 has its own application ID and keeps
those earlier installations intact. A durable release signing key is required
before distributing long-term updates.

The build uses version code 70 and target Android 36 with Android 26 minimum.
It preserves the portrait keyboard geometry and restores the earlier landscape UI.

## Local45 sensitivity update

The default microphone sensitivity is now 민감. Use the compact 감도 button
beside each microphone mode's help button to cycle through 표준, 민감, and 최대.
The selection persists locally and applies without restarting recording or training.
Only the input detection gate changes; PCM recording gain, pitch confidence
rules, and scoring tolerances remain unchanged. Pitch analysis is scheduled
more frequently to reduce graph response delay. The control shares the existing
heading row in both orientations.

## Local46 graph and dynamics guidance

Pitch measurement now shows the last six seconds of measured pitch with note
and octave labels, recent low/high notes, visible silence gaps, and a frozen
last graph after stopping. Rotation redraws the same data; a new microphone
session resets the measurement graph.

Dynamics uses the existing 12-second sequence: soft, medium, strong, soft,
three seconds each. Existing metric cards show the current stage, its remaining
time, and the next stage. Optional short cues align with those transitions;
cue windows do not contribute to the voice score or relative loudness graph.
The reference note plays during preparation. Microphone sensitivity applies
also to quiet dynamics, with the scoring ratios and time requirements retained.

The application ID remains com.voiceline.app.local18.ci45 and version code is 61.
The pinned CI45 key allows installation over CI45 without removing its records.

## Local47 keyboard and practice graph

All ten piano modes use the same viewport-based keyboard height and bottom
position. The graph or warmup guide uses the row above it; slide practice now
also shows that keyboard. Metronome keeps its dedicated view.
Both microphone entry points explicitly show the live pitch graph. Piano has
a waiting graph, and practice plots timed mint targets and purple detected
voice with genuine silent gaps. Version code is 62 and the CI45 key is retained.

The Chromium regression opens all ten modes at five portrait/landscape sizes,
compares keyboard height and position, checks graph bounds, sends synthetic
PCM through the native callback contract, and verifies actual canvas pixels.
The report includes screenshots for review; it does not replace phone testing.

## Local48 landscape UI restoration

Landscape returns to the earlier flexible full-height keyboard with floating
graphs. Slide practice returns to its full-area graph without a keyboard.
The portrait layout from Local47 is preserved. Live pitch measurement,
practice targets/voice graphs, labels and microphone fixes remain available.
The browser regression checks both layouts and both microphone entry points
in both directions, including returning to portrait during active practice.
Version code is 63; the application ID and pinned CI45 signing key are retained.

## Local50 unified practice and graph readability

The single practice menu offers step/interval patterns or continuous slides,
with optional listening before the response. A shared engine retains all
unique patterns, migrates previous settings without deleting history, and
keeps unlimited direct practice bounded in memory.
Landscape preserves the full-height keyboard with a centered translucent
graph capped at 680 CSS pixels and 76% of the available width. A following
six-second window and note-based vertical range avoid a flattened full-width
plot. Portrait retains its separate graph row and fixed keyboard height.
The primary action handles start, stop, recording save and microphone cancel;
the duplicate secondary stop action is hidden from both display and focus.

## Local50 landscape graph control

The fixed action at the right edge above the piano keys toggles landscape graphs without resizing the keyboard. Its persisted preference does not hide portrait graphs, breathing instructions or the metronome. Compact preparation/target/phase instructions remain visible; hidden canvases skip drawing while capture, audio, scoring and recording data continue. Regression checks cover mode changes, active practice/recording, rotation, reload, blocked storage and narrow landscape screens.

## Local51 dynamics targets

The first weak phase establishes a robust personal RMS reference; later phases keep it fixed. The complete twelve-second graph and score share target ratios and bands. Guide playback and wrong-pitch samples cannot establish calibration; each stage needs actual target-range coverage. Louder triangle cues have an independent persisted volume and preview. Browser checks run a complete PCM-driven exercise through rotations and graph hiding and retain the final plotted result.

## Local52 separate note targets

Stepped pitch patterns show a separate horizontal stroke per note, with no vertical pitch-change connectors. Smooth slide paths remain continuous. The target calculation, note timing, audio scheduling, tolerance shading, detected voice trace and scoring remain unchanged.

## Local55 volume endpoints and dynamics courses

Three volume controls paint their tracks from the actual percentage, including a fully filled 100 percent endpoint. Seven dynamics methods share immutable per-session timelines for target bands, phase labels, cue scheduling and grading. Each starts with a three-second weak reference and completes in twelve seconds. Regression checks cover each method, gradual contours, per-segment coverage, selected-method persistence and real slider endpoints.


## Local55 preparation, exercise duration and release review

Dynamics and sustain sessions listen for 1.8 seconds, then inhale for three seconds before measurement. Vibrato uses the same preparation; each ear response has its own ungraded three-second inhale. Direct pitch-phrase repeats provide three seconds of recovery. Dynamic durations are 8, 12, 16, 20 or 24 seconds; the weak reference stays three seconds and subsequent segments scale to fit.

Compile/target SDK 36 uses AGP 8.10.1 and Gradle 8.11.1. Android 13+ back handling uses OnBackInvokedDispatcher while the existing inset handling protects Android 16 content. The workflow builds an unsigned production AAB, runs release lint, and verifies all embedded assets. This review bundle is deliberately not a signed Play upload artifact. See PLAY_STORE_READINESS_KO.md for remaining owner and Console requirements.


## Local55 Play preparation

The Android display name, web title and installed PWA name are VoiceLine. A canonical policy generates the offline app document and its public website. Production bundles use 2.0.0 (70); CI updates retain com.voiceline.app.local18.ci45 and the pinned CI key. The owner upload key remains outside the repository and runner. The workflow validates bundle metadata with checksum-pinned official bundletool, builds a temporary CI-signed production runtime APK, tests it on an Android16 emulator, and exports store screenshots and brand graphics. That temporary runtime APK is not the owner-signed Play upload.
