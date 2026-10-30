# VoiceLine iOS work-in-progress — recording pitch and responsive layout

This branch is for **iPhone/iPad UX preparation**, while keeping Android Beta 15 unchanged. No IPA is built or claimed here.

## What has been implemented

- In **녹음하기**, a translucent, touch-pass-through live pitch graph appears above the piano keyboard, as it does in 비브라토 연습.
- During an active recording it plots microphone-detected **musical note height**, not loudness, across the most recent six seconds; it automatically resizes its Y-axis for different voice registers.
- The panel shows current pitch (e.g. A4), pitch in Hz, and the lowest/highest pitch measured during the current recording. Its trace is frozen when recording stops. The saved recording's history row now also shows the approximate measured range.
- Gaps in detected speech are drawn as gaps, not false tones. Real-time graph memory is strictly bounded.
- Narrow iPhone landscape layout uses responsive header, horizontally scrollable controls and readable action buttons. The overlay does not consume keyboard touch events.
- The **existing** vibrato chart and microphone manual switch remain intact.

## Running on iPhone/iPad Safari

The HTML uses browser microphone APIs. It must be served from an **HTTPS secure origin** for mic permission to work; opening index.html as an offline file is not enough. This repository has no iOS deployment URL configured. A web server with HTTPS, such as an existing hosted static site, is needed to test it on a real device.

The GitHub Actions workflow builds a **web asset ZIP only**, containing HTML, JS, CSS, locally bundled Tone Piano and 28 offline Salamander audio recordings. It is **not an app-installable IPA**.

## Later native iOS integration

When IPA work is resumed, create a WKWebView/Capacitor iOS shell on a Mac with Xcode, place the bundled web assets at a secure origin suitable for WKWebView, configure microphone permission (`NSMicrophoneUsageDescription`), orientation, content/audio playback policies, sign with Apple credentials, then validate mic recording (including Safari `MediaRecorder` availability), audio session behavior, pitch tracking and local persistence on physical iPhone and iPad.

**Unverified on a physical iOS device:** microphone permission, MediaRecorder encoding, oscillator playback during capture, and true iOS Dynamic Type behavior. Tests on Linux/Chromium are not a substitute for iOS/WebKit or Xcode validation.

## License credits

Acoustic clips: Salamander Grand Piano, Alexander Holm, Creative Commons BY 3.0. Tone.js and `@tonejs/piano`: MIT. Attribution is also displayed in the app.
