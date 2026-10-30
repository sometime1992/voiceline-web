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
