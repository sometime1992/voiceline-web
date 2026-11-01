# VoiceLine Local57 · 홈페이지 연결 및 Play 준비 확인

확인일: 2026-11-01 · 출시 구성 2.0.0 (71) · 테스트 APK 2.0.0-local57-ci (72)

VoiceLine의 공개 방침·개발자 문의·개발자 홈페이지를 마인드업 스튜디오에 연결했습니다. APK와 서명된 AAB를 준비하고 자동 검사를 통과했습니다. Play Console 설정, 실제 휴대폰 검사와 심사 제출은 아직 수행하지 않았습니다.

## 앱에 반영한 내용

앱 메뉴 → 개인정보처리방침에서 `공개 웹페이지`, `개발자 문의`, `개발자 홈페이지`를 사용할 수 있습니다. 외부 페이지는 버튼을 누를 때 시스템 브라우저에서 열립니다. 방침 본문은 앱 안에서 오프라인으로 읽을 수 있습니다.

| 항목 | 적용 값 |
| --- | --- |
| 앱 이름 | VoiceLine |
| 운영자 | 마인드업 스튜디오 |
| 홈페이지 | https://mindup-studio.pages.dev/ |
| VoiceLine 개인정보처리방침 | https://mindup-studio.pages.dev/apps/voiceline/privacy.html |
| VoiceLine 고객지원 | https://mindup-studio.pages.dev/support.html?app=voiceline |
| 공개 문의 이메일 | grand4870@gmail.com |

마이크 분석·녹음·연습 기록은 기존처럼 기기 안에서 처리합니다. 앱 인터넷 권한이나 광고·분석 SDK를 추가하지 않았습니다. 외부 웹사이트의 접속 정보 처리는 해당 서비스 정책에 따릅니다.

## 파일 선택과 설치

| 파일 | 용도 |
| --- | --- |
| `VoiceLine-Local57-CI.apk` | 현재 CI 테스트 앱을 업데이트하여 직접 설치 |
| `VoiceLine-Local57-CI.zip` | 같은 APK와 빌드 정보·설치 이름 확인 결과를 묶은 다운로드 |
| `VoiceLine-2.0.0-Upload.aab` | Google Play 업로드용, 기존 업로드 키로 서명 |
| `VoiceLine-Play-Store-Kit.zip` | 소개 문구·이미지·콘솔 입력 안내·검증 자료 |

기존 CI 앱은 삭제하지 않고 APK로 업데이트합니다. 정식 앱은 `com.voiceline.app`, CI 앱은 `com.voiceline.app.local18.ci45`로 서로 다른 설치 대상입니다. CI 기록이 정식 앱에 자동 이전되지는 않으므로 필요한 녹음은 먼저 내보내세요.

정식 AAB는 버전명 `2.0.0`, 코드 `71`, target SDK `36`, min SDK `26`이며 디버그 가능 앱이 아닙니다. CI APK는 버전명 `2.0.0-local57-ci`, 코드 `72`입니다. 두 파일의 버전 코드는 서로 다른 패키지의 값입니다.

## 확인한 결과

| 검사 | 결과와 범위 |
| --- | --- |
| 회귀 검사 | 296개 통과, 실패 0개 |
| 화면 검사 | 모드·가로/세로 화면 63개, 강약 미리보기 105개 통과 |
| 외부 링크 | GitHub Actions에서 홈페이지·VoiceLine 방침·고객지원의 공개 HTTPS 응답 및 내용 확인 |
| APK | 설치 이름 VoiceLine, 기존 CI 패키지·서명 유지, 내장 자산과 새 URL 확인 |
| 정식 AAB | 빌드·bundletool 검증·기존 키 서명·엄격한 서명 검증 통과 |
| 서명 전후 내용 | 원본 AAB의 서명 대상 항목 136개 내용 보존, 앱 내 웹 자산과 소스 일치 |
| Android 16 실행 | 오프라인 방침·뒤로 가기·연습/워밍업·화면 회전과 그래프 실행 검사 통과 |
| 기존 앱 업데이트 | 실제 배포 Local56 (71) → Local57 (72), 삭제 없이 설치하고 비공개 테스트 파일 유지 |
| release lint | Error/Fatal 0개, Warning 15개. 원본 XML·HTML 보고서 동봉 |
| 실기기 | S24 Ultra 등 실제 휴대폰 검사는 미실행 |
| Play Console | 주소 변경·AAB 업로드·트랙 배포·심사 제출 미실행 |

실행 검사는 Android 16 API 36 에뮬레이터 기준입니다. 실제 사용자 녹음·기록이나 휴대폰 마이크·스피커를 직접 검사한 결과는 아닙니다. Lint 경고에는 WebView JavaScript, 백업 규칙, API·의존성·아이콘 관련 항목이 남아 있으며 상세 내용은 원본 보고서에 있습니다.

`verification/CI_INSTALL_NAME.json`에 업데이트 전후의 실제 버전과 설치 이름을 기록했습니다. 원본 `ANDROID16_SMOKE.json`의 마지막 설명 문자열에는 이전의 “Local55”가 남아 있지만, 이번 실행의 설치 대상은 전용 기록에 적힌 Local56 → Local57입니다. 원본 결과는 수정하지 않았고, 이후 생성되는 설명 문구는 소스에서 바로잡았습니다.

## 소스와 공개 다운로드

- [검증한 앱 소스](https://github.com/sometime1992/voiceline-web/commit/cd5d2408a0fa48a7b05da9d46a63840bfccccc1f)
- [성공한 빌드·Android 검사](https://github.com/sometime1992/voiceline-web/actions/runs/41315537483)
- [공개 다운로드 및 해시 검사](https://github.com/sometime1992/voiceline-web/actions/runs/41316122948)
- [Local57 공개 릴리스](https://github.com/sometime1992/voiceline-web/releases/tag/voiceline-local57-ci)

다운로드한 APK·ZIP의 해시를 공개 릴리스와 대조했습니다. 정식 AAB는 위 성공한 빌드의 미서명 번들을 기존 업로드 키로 서명한 파일입니다. 공개 인증서 SHA-256은 `916a59f6613bdd7f69737eb3eda2c31e35111866d3da1edfa621095b1e2b02ce`이며 이전 제공 인증서와 같습니다.

| 파일 | SHA-256 |
| --- | --- |
| `VoiceLine-Local57-CI.apk` | `b73479674c91c452712c67e006b78859d243f1363b944ce5a0dfa2ab6407a98d` |
| `VoiceLine-Local57-CI.zip` | `e39d31b81eeb698accee60de759636e2667d7621d1c2016b6d2078f873ffe0cf` |
| `VoiceLine-2.0.0-Upload.aab` | `1f9f6ee6c2119fc28e26522e093085b70a601aba5ffc3600bebd82d7e68b63be` |

## 다음에 콘솔에서 할 작업

1. 개발자 표시명·지원 이메일과 위 홈페이지·앱별 방침 주소를 입력합니다. 앱 코드를 변경해도 콘솔 주소가 자동으로 바뀌지는 않습니다.
2. 기존 콘솔 앱이 있다면 패키지와 업로드 인증서를 먼저 대조하고, 이번 AAB의 코드 `71`이 기존 업로드보다 높은지 확인합니다.
3. AAB를 내부 테스트에 올리고 사전 출시 보고서와 실제 휴대폰 검사를 확인합니다. 문의·방침·홈페이지 버튼, 마이크 권한, 녹음, 소리 재생, 화면 회전과 업데이트 후 기록을 확인합니다.
4. 소개·이미지·데이터 보안·광고·앱 접근·대상 연령·콘텐츠 등급 등 실제 콘솔의 미완료 항목을 작성합니다. 세부 초안은 `console-guide-ko.md`, 검사표는 `physical-qa-ko.md`에 있습니다.
5. 계정에 적용되는 테스트·신청 요건을 확인하고 실제 테스터의 사용·피드백을 반영한 뒤 제출합니다. 빌드 성공이 Google 심사 승인을 의미하지는 않습니다.

같은 스튜디오의 MindUp은 별도 앱입니다. MindUp 정책은 `https://mindup-studio.pages.dev/privacy.html`, 문의는 `https://mindup-studio.pages.dev/support.html?app=mindup`입니다. MindUp에는 광고 SDK가 있으므로 VoiceLine의 광고·데이터 보안 답안을 그대로 복사하지 않습니다.

## 공식 안내

- [스토어 등록 정보](https://support.google.com/googleplay/android-developer/answer/9859152?hl=ko)
- [데이터 보안](https://support.google.com/googleplay/android-developer/answer/10787469?hl=ko)
- [건강 앱 선언](https://support.google.com/googleplay/android-developer/answer/14738291?hl=ko)
- [개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)
- [Android 앱 서명](https://developer.android.com/studio/publish/app-signing)
