# Acoustic piano samples

VoiceLine Android beta uses recorded **Meta Piano**, an 88-key upright piano from Meta Open Sound.

- Creator/publisher: Meta Creative Audio / Meta Open Sound
- Source: https://github.com/facebookincubator/Meta-open-sound/tree/251c0be57d5d1b3242b91f53e0cde62ab1cb42d9/systems/instruments/meta-piano
- License: **Creative Commons Zero (CC0 1.0)** (the piano recordings are dedicated to the public domain)
- Files: 28 **OGG Vorbis** recordings from the third dynamic layer, one per three semitones across C1–A7. Adjacent semitones use audio buffer playback-rate mapping.
- Compiled into APK at build time by `node scripts/fetch-piano-samples.mjs` and decoded through the system Web Audio implementation. The app plays these files locally without a network connection.
- Source may be redistributed and used commercially under CC0. Credit is optional, but this provenance is retained for transparency.
- The previous triangle/sine synthetic tone remains as a failsafe if bundled decoding is unsupported, but the Android CI build must bundle all recordings.

The full upstream instrument has 352 recordings in four dynamic layers; this compact mobile edition chooses a subset to keep download size and decoded memory moderate. It does not claim to reproduce all physical soundboard, pedal, and sympathetic-resonance behaviors of a concert grand.
