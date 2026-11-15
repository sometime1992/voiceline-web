# Acoustic piano samples

## Current Android application (Local86)

The packaged instrument is **Salamander Grand Piano (Yamaha C5)**, recorded by
**Alexander Holm**, under **CC BY 3.0 Unported**. The 28 MP3 recordings are the
velocity-8 subset from the pinned upstream commit in
`android-local44/app/src/main/assets/www/vendor/salamander/CREDITS.json`.
The application changes playback pitch, gain and envelope. Keep the creator,
title, source, license link and modification notice with redistributed samples.

See [the current piano engine documentation](third-party-piano.md) and
[the third-party asset register](asset-provenance.json). The APK contains the
complete notices in its offline help screen. Android runtime license data is
collected from the dependencies actually resolved by each Android build.

## Historical Meta Piano experiment (superseded before Local86)

The following describes a previous beta experiment. Its CC0 license does **not**
apply to the current Salamander recordings. The historical downloader remains
for reference and must not be used to describe the current APK.

The historical Android beta used recorded **Meta Piano**, an 88-key upright piano from Meta Open Sound.

- Creator/publisher: Meta Creative Audio / Meta Open Sound
- Source: https://github.com/facebookincubator/Meta-open-sound/tree/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-piano
- License: **Creative Commons Zero (CC0 1.0)** (the piano recordings are dedicated to the public domain)
- Files: 28 **Ogg/Opus** recordings from the first (softest) dynamic layer, one per three semitones across C1–A7. Adjacent semitones use audio buffer playback-rate mapping.
- Compiled into APK at build time by `node scripts/fetch-piano-samples.mjs` and decoded through the system Web Audio implementation. The app plays these files locally without a network connection.
- Source may be redistributed and used commercially under CC0. Credit is optional, but this provenance is retained for transparency.
- The previous triangle/sine synthetic tone remains as a failsafe if bundled decoding is unsupported, but the Android CI build must bundle all recordings.

The full upstream instrument has 352 recordings in four dynamic layers; this compact mobile edition chooses a subset to keep download size and decoded memory moderate. It does not claim to reproduce all physical soundboard, pedal, and sympathetic-resonance behaviors of a concert grand.

The Android beta7 default now uses the gentlest recorded velocity to avoid hammer-onset thuds. Decoded buffers are conditioned with a raised-smoothstep fade-in/out, then played through an additional voice envelope. An in-app sine-tone A/B diagnostic is accessible in **사용법** to separate audio-asset clicks from device audio-route issues.
