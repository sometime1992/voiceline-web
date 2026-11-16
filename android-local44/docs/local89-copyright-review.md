# VoiceLine Local89 — Copyright risk review (2026-11-16)

This release restores the original Local86 piano-first interface, preserving piano, microphone pitch detection, recording, vibrato, metronome, all vocal-training modes, bilingual UI, and locally saved training data. The Naruvium Studio YouTube channel link stays at the bottom of the app menu.

## Song-following removal
The Android package no longer contains a song-following mode, user song/MR/vocal import, vocal-pitch extraction, created backing tracks, AI vocal separation, downloadable instrumentals, or song analysis cache. Associated UI, JavaScript/CSS, native playback bridge and song-specific workflows have been removed. No commercial song, lyric text, or backing track is bundled. Only the separately licensed Salamander piano note samples remain.

## Existing third-party licensing
- Salamander Grand Piano sampled notes by Alexander Holm, 28 MP3s: Creative Commons Attribution 3.0 (CC BY 3.0). Notices, credits, source and sample hashes are recorded in vendor/salamander/CREDITS.json, THIRD-PARTY-NOTICES.txt, and docs/asset-provenance.json.
- @tonejs/piano and Tone.js: MIT; other bundled JS dependencies: MIT or 0BSD, with full notices in legal/third-party-base.json and in-app third-party notices.
- AndroidX/runtime dependencies: Apache-2.0; validated through third-party-notices.gradle and THIRD-PARTY-COMPONENTS.json.

## Unresolved copyright clearance items
1. User-selected app icon files icon-192.png, icon-512.png and favicon.png have source identified only as selected image, with neither author nor permission evidence recorded. Obtain original creation, assignment or commercial-use license proof.
2. The origin and re-use rights of any externally adapted pitchYin implementation in piano.js need confirmation; no unsupported authorship claim should be made.
3. Audio recordings created by users can include copyrighted performances or songs. Existing user-controlled save/share/export functionality remains and has a rights warning; users should share only when authorized. Consider explicit confirmation before sharing.
4. If publishing screenshots, banners, promotional graphics or other projects' logos, check separately; this review does not clear any such assets.
5. Recheck third-party licenses and attributions after changing dependencies or sample files; test the notices UI on a real Android device.

All statements are source-based risk assessment, not a legal certification or guarantee of non-infringement. Older APK releases with the removed feature may remain downloadable and should be withdrawn independently if complete public removal is desired.
