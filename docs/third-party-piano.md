# VoiceLine piano engine

Playback is provided by **@tonejs/piano 0.2.1** (Yotam Mann, MIT License) and Tone.js 14.7.77 (MIT). VoiceLine implements only the keyboard UI and its integration to vocal-training modes.

The instrument uses **Salamander Grand Piano** original piano recordings by Alexander Holm, licensed under **CC BY 3.0**. The source is https://github.com/tambien/Piano/tree/0cd2c034f820c53e83ab22f5c13bd490b9e4de85/audio . Licensed under https://creativecommons.org/licenses/by/3.0/ .

We bundle one sampled dynamic layer across 28 original notes, allowing the piano engine to interpolate other notes. Files are downloaded at **build time**, never at runtime. In this edition `release:false` and `pedal:false` intentionally disable optional keybed click and pedal sound effects while leaving the library's standard string-note releases active. The sample library's 0.4-second release envelope is not replaced by custom oscillators. The UI remains unchanged except for sound status and provider attribution.

Build commands (repository root):

```bash
npm install --no-save --legacy-peer-deps @tonejs/piano@0.2.1 tone@14.7.77 esbuild@0.25.12
node scripts/fetch-salamander-samples.mjs
./node_modules/.bin/esbuild scripts/tone-piano-entry.mjs --bundle --format=iife --platform=browser --target=es2020 --outfile=android-app/app/src/main/assets/www/vendor/tone-piano.js
```

The current beta is an A/B integration candidate, not yet validated on actual Galaxy devices. It is intentionally separated from other beta test package IDs. If the app's audio still pops even with the library engine, further native Android audio-renderer investigation is needed.

