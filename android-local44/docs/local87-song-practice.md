# VoiceLine Local87 — existing piano UI retained

Base source: Local86 commit dc4da54c7371fac5d7598fc53b656233a28f3394 on build/android-apk.

Original piano, microphone, recording, vibrato, metronome, practice routines, bilingual UI and stored records remain unchanged except for a bridge exposed for the new optional audio modal.

- Song files are selected through the Android system picker, locally decoded and never uploaded.
- Reference pitch is estimated using YIN; on mixed original tracks accompaniment may be mistaken for vocals. User-supplied isolated vocal files improve signal isolation. No vocal separation model is included.
- Only calculated reference points are cached in a separate on-device IndexedDB store; audio and microphone samples are not saved by this feature.
- The Naruvium Studio YouTube button opens https://www.youtube.com/@naruvium-studio externally.
- CI package name and original signing certificate are preserved; version code 110 upgrades the earlier Local86 CI version code 109. Do not uninstall the existing app because recordings may be lost.
- Offline works after the APK is installed. Actual Android audio picker and microphone behavior still require device testing.
