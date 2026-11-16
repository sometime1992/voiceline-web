# VoiceLine Local90 — rights and attribution improvements (2026-11-16)

Scope: the original piano-first VoiceLine. Song/MR import, pitch extraction from commercial songs and vocal separation remain removed.

## 1. Piano attribution (CC BY 3.0)
- The app menu now has a direct “Piano sample credits and licenses” entry.
- Creator: Alexander Holm. Title: Salamander Grand Piano (Yamaha C5).
- Original sample source: https://github.com/tambien/Piano/tree/0cd2c034f820c53e83ab22f5c13bd490b9e4de85/audio
- License: https://creativecommons.org/licenses/by/3.0/
- VoiceLine includes 28 original MP3 note recordings and adjusts gain, envelope and playback pitch/speed in real time; the samples themselves are not re-encoded.
- Attribution does not imply endorsement from the creator. The full MIT/CC BY/Apache-2.0 notices remain available offline from the app.
- Asset metadata is also documented in vendor/salamander/CREDITS.json and android-local44/legal/third-party-base.json.

## 2. Export/share copyright check
- In-app microphone analysis and recordings stored privately within VoiceLine are unaffected.
- Before every external Save File or Share action (including export of recovered native files), a new unchecked consent dialog explicitly reminds users that songs, lyrics, instrumentals and performances may have separate owners.
- The outward action does not call VoiceLineDocuments.perform unless the user opts in on this attempt.
- Cancelling or using Android Back preserves the recording and does not make an external copy. No consent choice is persisted.
- Confirmation is a useful safeguard, NOT a grant of permission or a complete liability waiver.

## 3. YouTube link
- At the very bottom of the menu, a plain text link explicitly identifies the Naruvium Studio channel on YouTube.
- The prior hand-drawn play symbol has been removed: it was not an official, unmodified YouTube brand asset.
- This plain informational link avoids implying that YouTube sponsors or endorses VoiceLine. No YouTube API integration, streaming ripper or extra network permission was added.

## Known remaining copyright-clearance items
- Provenance for the app icon-192.png/icon-512.png/favicon.png is still pending original creation/permission evidence in docs/asset-provenance.json.
- An independently auditable provenance/third-party-code audit of any adapted pitchYin implementation remains advisable.
- Real-device checks and licensed legal advice are needed before claiming full legal compliance.
