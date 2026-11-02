# VoiceLine Local65 · 가로·세로 설정 가독성 수정

현재 Android 프로젝트는 `android-local44/`입니다. Java 17 / Android SDK 36으로 빌드합니다.

- 설정창 제목·편집 본문·저장 버튼을 분리해 버튼이 입력 내용을 덮지 않습니다. 본문 한 곳에서 끝까지 스크롤합니다.
- 가로 화면은 왼쪽 요약 / 오른쪽 편집, 세로 화면은 위쪽 요약 / 아래쪽 편집입니다. 긴 진행 순서·음 목록은 **진행 순서·음 보기**를 펼쳐 확인합니다.
- 일반 설정에서 빈 루틴 도구 영역을 제거했습니다. 새로 열면 첫 항목부터 표시하고 편집 중에는 펼친 그룹·작성 값·스크롤을 유지합니다.
- 설명·기록 화면도 제목·닫기와 본문을 나누어 큰 글자에서 내용에 접근할 수 있습니다.
- 기준음·구절 듣기와 호흡 준비 중에는 보라색 감지 건반을 숨기고, 따라 부르기 구간의 새 발성부터 다시 표시합니다. 마이크 연결·녹음·채점 흐름은 유지합니다.
- 음계·도약·모음·슬라이드, 일반 연습과 루틴의 개별 설정·시간·반복·저장 방식은 같습니다. 아에이오우는 한 모음으로 음계 전체를 왕복한 다음 모음으로 넘어갑니다.
- 기준음은 C3 · 1옥 도가 기본입니다. 건반 크기와 가로의 반투명 그래프 / 세로의 그래프 위·건반 아래 배치를 유지합니다.

설치용 CI: **2.0.0-local65-ci (80)** · `com.voiceline.app.local18.ci45`. 기존 Local64 위에 업데이트합니다. 삭제하면 기기 내부 자료가 지워지므로 삭제하지 마세요.
정식 구성은 **2.0.0 (79)** · `com.voiceline.app`이며 CI와 저장 공간이 다릅니다. CI의 unsigned review AAB는 Play 업로드 파일이 아닙니다.

```sh
cd android-local44
node --test --test-concurrency=1 --test-timeout=60000 local_tests/*.test.cjs
./gradlew :app:assembleCiDebug :app:bundleRelease
```

화면 검사는 `ci/check-piano-layout.cjs`, 실제 입력칸·저장 버튼의 가림과 스크롤 검사는 `ci/check-settings-readability.cjs`에 있습니다. 실제 휴대폰 마이크·스피커 검사는 `store-kit/physical-qa-ko.md`를 따릅니다.

---

## 이전 개발 이력

# VOICE LINE 보이스라인 v2.0.0-beta1

가로 화면을 피아노 건반이 대부분 차지하는 보컬 연습 앱입니다.

## 기능
- 터치할 때 음이 나고 키가 눌리는 흰/검은 피아노 건반, 멀티터치, 옥타브 이동.
- 오른쪽 위 햄버거 메뉴: 음정 측정, 녹음, 비브라토, 음정 연습, 나의 기록, 사용법.
- 마이크로 감지한 음정은 보라색 건반으로, 연습 목표 음정은 민트색 건반으로 표시.
- 녹음 파일은 MediaRecorder 우선, 지원되지 않는 경우 Web Audio PCM/WAV 대체 방식 사용.
- 녹음 및 연습 기록은 IndexedDB로 휴대폰 앱 내부에만 저장하고 재생·개별 삭제 가능.
- 기존 1.4.0의 최근 연습 기록과 저장 음역대를 새 기록으로 가져옵니다.
- 녹음은 1회 최대 10분으로 제한합니다. 피아노 소리가 마이크에 들어갈 수 있으니 이어폰을 권장합니다.

## 웹 / PWA
Cloudflare Pages의 루트에서 정적 배포합니다. HTTPS 필요. PWA는 가로 방향을 요청합니다. 일반 브라우저에서는 화면 회전 강제가 불가능할 수 있어 세로 방향 안내를 표시합니다.

## Android
1. Android Studio에서 android-app 폴더를 엽니다.
2. SDK Platform 35, Java 17 확인 후 Gradle Sync.
3. Build → Build APK(s)로 디버그 APK 생성.
4. 결과: android-app/app/build/outputs/apk/debug/app-debug.apk

Android 앱은 sensorLandscape로 가로 방향 고정, WebViewAssetLoader 로컬 오프라인 assets 사용. Gradle preBuild에서 최상위 웹 파일을 앱에 복사합니다.

## 코드 검사
Node.js 환경에서 node --test tests/piano.test.cjs 실행. YIN 음정 분석 사인파 검증, 필수 메뉴, 문법과 안드로이드 설정을 확인합니다.

## 주의 및 추가 검증
실제 갤럭시/안드로이드 기기에서 마이크 권한, 멀티터치, 스피커 소리, 음성 녹음, 녹음 재생, 앱 재시작 후 기록 유지, 화면 회전을 확인해야 합니다. 현재 코드는 소스 점검과 합성 음성 테스트까지 수행했습니다. 앱 삭제 또는 앱 데이터 초기화 시 IndexedDB의 기록과 녹음도 삭제될 수 있습니다. 영구 보관용 내보내기는 아직 지원하지 않습니다.

v1.x 원본 스크립트는 롤백용으로 보존했지만 새 화면에서는 로드하지 않습니다. 음성은 서버에 업로드하지 않습니다. 음정 추정은 연습 참고용이며 의료 검사가 아닙니다.

## v2.0.0-beta2 · Android microphone fix
- Native AudioRecord bridge obtains Android RECORD_AUDIO permission directly, without WebView microphone permission dependencies.
- Android PCM 16-bit samples are passed to the local pitch detector, and recordings are saved as WAV in IndexedDB.
- In-browser fallback remains available for development; Android installed app prefers native audio.
- If permission is denied, the screen shows the reason. Recordings do not leave the device.

## v2.0.0-beta4 — acoustic piano keyboard

The mobile APK now carries natural acoustic piano recordings **offline**, based on the public-domain Meta Piano upright samples (CC0 1.0). One recorded mid-velocity note every three semitones maps across the keyboard, with gentle attacks and damped releases. The previous synthesizer is used only if device sample decoding fails. See `docs/acoustic-piano-samples.md` for the sample source and license.

Local Android Studio builds: Run `node scripts/fetch-piano-samples.mjs` **once** from the repository root before building. GitHub Actions automatically downloads the pinned CC0 source recordings and packages them in the APK. After installation, piano playback uses **no network**.

This testing APK is installed alongside the prior beta to avoid signing conflicts and accidental erasure of existing local recordings. Records are private to each app ID.

## v2.0.0-beta5 — reduced acoustic piano pops (Android)

The actual included acoustic Opus recordings were decoded and measured: none of the 28 samples had full-scale clipping (largest sample peak about 0.62). The preceding app played the original hammer transient with a very short 6ms ramp and 0.76 sample gain, before the 0.78 master and heavy compressor, which can sound percussive or overdriven on small phone speakers.

Soft piano now defaults to a 34ms note attack, 240ms note release, sub-bass/high-frequency filtering, 0.24 sample gain and 0.68 master gain, plus a safety-only compressor for loud peaks. The polyphony budget prioritizes newly touched notes. The existing Android native microphone support, on-device WAV recording and pitch tracking remain unchanged.

The testing package suffix is `.softpiano` and appears as **보이스라인 부드러운 피아노** so it can be tested without uninstalling other versions. Separate package IDs do not share locally saved data.

## v2.0.0-beta6 — vibrato reference keyboard alignment

- Selecting **비브라토 연습** now centers the keyboard around the currently selected reference pitch.
- The note selector offers every chromatic pitch, including black keys, from C2 (MIDI 36) through B6 (MIDI 95). Previously only white notes from C3 to B5 were present.
- Changing the reference automatically shifts the two-octave keyboard range and clearly marks the selected white or black key with a persistent mint outline and indicator.
- Live microphone pitch tracking never scrolls the selected vibrato reference off-screen while practice is underway.
- Includes the beta5 acoustic-piano transient and headroom improvements.

## v2.0.0-beta7 — anti-pop piano note transitions
- Change acoustic sampled instrument to softest authentic Meta Piano velocity layer (Vel01), minimizing hammer-onset thunk.
- Fade decoded Ogg/Opus sample data smoothly to zero at source endpoints and keep per-voice click-free gain ramps.
- Do not start a note while the Android Web Audio context is suspended; after resuming, play only if touch is still held.
- Fix voice-stealing tail accounting during rapid glissando, avoiding overaccumulation of overlapping voices.
- Add **사용법 → 소리 테스트: 순음으로 비교**, an A/B diagnostic to tell piano-sample-related pops from the audio output stack. Switch back via the same button.
- This Android debug test APK uses a separate application ID to protect the previous beta's local saved recordings and settings.

## v2.0.0-beta8 — consistent gentle piano levels
- Peak levels in 28 pinned, softest-velocity recordings vary substantially, so beta7 made some keys too quiet. Beta8 calibrates per-note gain against measured sample peaks (bounded boost ≤5×), with conservative mixer headroom.
- Preserves click-resistant PCM edge fades, safe AudioContext startup, bounded release tails, and the clean sine-tone audio diagnostic in **사용법**.

## v2.0.0-beta9 — duration-adaptive piano fades
- Acoustic piano keys now use a rounded fade-in envelope rather than an immediate attack. Normal touch has a consistent timbre because capacitive pressure is unreliable on most phones.
- Release duration varies with how long the note has actually sounded: about 105ms for a quick tap, increasing smoothly up to 400ms for longer holds. No hard stop until the fade has reached zero.
- When real stylus pressure is reported, the attack and expression adjust modestly. Regular finger pressure values are intentionally ignored.
- Pressed-key hold ownership, multi-touch, vibrato reference tracking, offline samples, microphone recording and local history are unchanged.
- Android beta9 uses a separate debug app ID `.fade9` to avoid deleting existing beta recordings.

## v2.0.0-beta10 — prevent pops on quick taps
- Responding to test feedback, reverse the beta9 release envelope: ultra-short taps get a long fade-out (about 390ms); held notes get a shorter but smooth release (about 240ms). Interpolate continuously with smoothstep.
- Increase overlapping voice budget to 8 and keep stolen tails for at least 120ms (instead of 65ms) to reduce clicks in fast repeated playing.
- Touch attack remains smoothly rounded, and actual pen pressure is optional, not assumed for finger touches.
- A standalone test APK with separate ID `.fade10` preserves prior beta recordings.

## v2.0.0-beta11 — replace DIY piano renderer with established engine
The Android APK now prioritizes published **@tonejs/piano 0.2.1** and Tone.js 14.7.77. It uses their `keyDown`, `keyUp`, velocity, polyphony, and key damping methods. The keyboard visuals, touch targets, native microphone, vibrato reference indicator and offline recordings remain VoiceLine's.

The sound source is Alexander Holm's **Salamander Grand Piano (Yamaha C5)**, licensed **CC BY 3.0**. A recording subset is packaged locally with the installed APK; the instrument code is MIT licensed. Attribution: Alexander Holm / Salamander Grand Piano — https://creativecommons.org/licenses/by/3.0/ . See `docs/third-party-piano.md`.

The optional piano keybed click, string harmonics click and pedal noises are disabled so users can compare against the previous app's finger-up pops. Local build: `npm install --legacy-peer-deps; npm run piano:download; npm run piano:bundle`, then build the Android app. GitHub Actions runs these steps automatically. This is a testing branch; main and prior APK builds remain unchanged.

## v2.0.0-beta12
- Complete on-device attribution in the help menu for the MIT piano runtime and CC BY 3.0 Salamander recordings.

## v2.0.0-beta13 — rapid-tap and note-click fix

- Diagnosed `@tonejs/piano`'s internal Tone.Sampler attack as **0 seconds** (instant PCM onset).
- Keep the published grand-piano engine and installed acoustic recordings, but set its existing Tone.Sampler `attack` option to **18ms** after loading (pinned library version); the normal release remains the library's approximately 400ms.
- `keyDown` triggers **synchronously** when the sample library and audio context are ready, avoiding a promise microtask on each touch.
- Notes shorter than **90ms** get a protected minimum sounding time. Fast re-press of the same MIDI key cancels its old scheduled key-up, releases the previous note, and starts the new note, preventing a stale callback from cutting a fresh note.
- Stop/cancel clears all pending key releases. The diagnostic sine comparison now correctly bypasses Tone Piano.
- A regression test drives 12ms, 16ms rapid taps and validates ordering/cleanup without a real speaker.
- No change to keyboard layout, pitch sensing, vibrato reference, recording, or on-device stored history.

The beta13 Android debug package uses `.rapid13` and installs independently to protect previous beta installations and their saved data. Acoustic-sample license credit remains in the app's help menu.

## v2.0.0-beta14 — user-controlled microphone and detection warning

- A clearly labeled **마이크 켜기 / 끄기** control is always available in the top bar. It shows the current live state, accessible pressed status, and disables itself during microphone permission/start/stop actions.
- The existing main mode button retains its behavior: recording, vibrato, exercise and pitch modes still start or stop as before.
- Manually switching the mic off safely finishes the current activity using the existing `stopActivity` path: a recording is saved, running practice/vibrato sessions are finished, and microphone capture is closed.
- Switching the microphone on in recording/vibrato/practice mode does **not** automatically start a recording or score an exercise; those remain explicitly controlled by the mode's Start button.
- Help now explains that audible piano playback can be picked up by the active mic and cause inaccurate sung pitch, vibrato and pitch exercise recognition. Earphones or pausing piano output during singing are recommended.
- Mobile landscape header mic button is sized for touch and 150% font growth. No new app permission and no network access are added.
- Debug application ID suffix `.mic14` keeps earlier tester's recordings intact.

## v2.0.0-beta15 — landscape vibrato overlay

- Vibrato mode now presents a translucent live pitch-versus-time chart **over** the piano keyboard with `pointer-events:none`, retaining black/white key multitouch and the highlighted reference key.
- The center line is the selected target pitch (0 cent); the purple trace shows microphone-detected pitch in cents with a rolling three-second window, including gaps when sound is absent.
- Four metrics: median center vs target (cent), robust vibrato half-span (±cent), detected cycle frequency (Hz), and period regularity (qualitative). These are signal-derived approximations, not clinical vocal assessments.
- Pitch changes used in the plot are unsmoothed; the app's previous 3-frame median remains for stable note labels. Vibrato rate is only reported when enough cycles are observed, avoiding a false positive on a steady note.
- Includes both native Android AudioRecord and browser fallback; canvas DPR and redraw rate are bounded for mobile performance.
- The chart is visible only in vibrato mode. Previous main screen, recordings, gesture handling, piano engine, microphone switch and offline storage remain intact.
- New Android package `.vib15` installs alongside earlier beta APKs without touching their stored recordings.
