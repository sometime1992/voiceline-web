# 보이스라인 VOICE LINE v1.3

목소리의 높낮이를 마이크로 분석하는 브라우저/Android 보컬 연습 앱입니다. 녹음 원본은 저장하거나 서버에 보내지 않습니다.

## 이용 방법

1. HTTPS 웹사이트에서 '마이크 켜기'를 누르고 권한을 허용합니다(호흡 훈련에는 필요 없음).
2. 상단에서 자유 측정 / 음정 따라가기 / 비브라토 / 호흡 훈련 / 음역대 측정을 선택합니다.
3. 음정 따라가기: 시작 음정과 12개 패턴, 길이와 반복 횟수를 선택하고 '연습 시작'을 누릅니다. 화면에 목표(민트)와 실제(보라) 음정이 표시됩니다.
4. 비브라토: 7종 훈련에서 선택하거나 목표 속도(Hz)와 폭(cent)을 조절합니다. 마이크 시작 후 비브라토 연습을 누릅니다. 결과는 음정 흔들림을 이용한 참고용 추정치입니다.
5. 호흡 훈련: 들숨(1~60초), 유지(0~60초), 날숨(1~120초), 쉼(0~60초), 반복(1~30회)을 자유롭게 설정합니다. 일시정지 및 초기화가 가능합니다. 편안한 범위에서 연습하고 무리해서 참지 마세요.
6. 음역대 측정: 편안히 지속할 수 있는 최저음/최고음을 측정하고 기기 로컬에 저장합니다.

### 옥타브 · 그래프

* 왼쪽 Y축과 현재 음정 칸에는 한국식 **N옥 도/레/미...**와 국제 표기 **C4, C5, C6...**가 함께 표시됩니다.
* 한국식 **2옥 도=C4, 3옥 도=C5, 4옥 도=C6**입니다.
* 고음으로 올라갈 때 그래프의 세로 범위가 부드럽게 따라 움직여 고음이 잘리지 않도록 합니다.
* 감지 대역은 약 **65~2,100Hz**입니다. 마이크·주위 소음·발성에 따라 특히 높은 음의 인식 정확도에 차이가 있습니다.
* 자유 측정에서 주파수, 편차(cent), 현재 음을 확인하고 음정 따라가기에서 목표의 ±35 cent 안에 든 측정 비율로 정확도를 표시합니다.

## 웹 배포

Cloudflare Pages에서 프로젝트 루트(`.`), 정적 사이트(None), 빌드 명령 없이 배포합니다.

## Android APK

`android-app/` 폴더는 **Android Studio에서 열고 빌드하는 오프라인 앱 프로젝트**입니다. `android-app/app/src/main/assets/www` 안의 웹 코드를 사용하므로 APK 앱에서는 인터넷 없이도 기본 기능을 쓸 수 있도록 구성했습니다.

1. PC에서 Android Studio를 열고 **Open → `android-app` 폴더** 선택.
2. Android SDK Platform 35 및 빌드 도구 설치 확인. Gradle 동기화(sync)합니다. Gradle 설치/네트워크 연결은 최초 빌드 때 필요할 수 있습니다.
3. 휴대폰 USB 디버깅을 켜고 연결하여 **Run** 하거나, **Build → Build APK(s)**를 선택합니다.
4. 결과는 보통 `android-app/app/build/outputs/apk/debug/app-debug.apk`에 있습니다.
5. 휴대폰에 APK를 복사하여 설치합니다. 마이크 권한은 앱 내 마이크 버튼을 누를 때 요청됩니다.

`android-app/`에는 `gradle/wrapper/gradle-wrapper.properties`가 포함되어 있으나 wrapper JAR은 동봉하지 않습니다. Android Studio에서 Gradle 프로젝트로 열거나, SDK가 설치된 PC에서 `gradle wrapper --gradle-version 8.10.2` 후 명령행 빌드할 수 있습니다.

GitHub Actions에서 APK를 생성하려면 `.github/workflows/build-apk.yml`의 수동 실행 `Run workflow`를 선택할 수 있습니다. GitHub Actions 무료 사용량을 소진한 경우에는 실행되지 않을 수 있으며, **로컬 Android Studio 빌드가 더 안정적**입니다.

## 프로젝트 구성

* `index.html`, `styles.css`, `training-guide.css`, `vibrato-breath.css`, `readability.css` – 인터페이스
* `app.js` – WebAudio/YIN 실시간 음정 분석, 그래프, 기록
* `training-plus.js` – 12가지 음정 연습 및 목표 가이드
* `vibrato-breath.js` – 비브라토 분석, 호흡 타이머
* `sw.js`, `manifest.webmanifest`, 아이콘 – PWA
* `android-app/` – Android WebView 래퍼 프로젝트

## 주의

목에 무리가 가는 음을 억지로 내거나 숨을 오래 참지 마세요. 어지럽거나 쉰 목소리가 나면 즉시 중단합니다. 이 앱은 참고용 음정 분석 도구로 의료/전문 음성 검사에 해당하지 않습니다.


## v1.3 모바일 사용성 개선
- 앱에서 한눈에 이해되는 시작 안내와 모드별 1줄 사용법
- 모바일 탭 한 줄 스와이프 탐색, 큰 시작 버튼 및 잘 읽히는 그래프
- Android APK에서 핀치 줌 비활성화 (세로 스크롤 유지)
- Android 15/16 상태바 겹침을 피하도록 네이티브 시스템 안전 영역 적용
- 기존 음정 12종, 비브라토 7종, 호흡 시간 조절 기능 유지
