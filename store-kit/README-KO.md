# VoiceLine Google Play 준비 자료 · Local58

C3 기본 기준음, 직접 시간 입력, 연습별 무한 반복과 여러 루틴 저장·순서 변경·반복을 반영한 버전입니다. 정식 업로드 파일은 별도로 제공한 `VoiceLine-2.0.0-Upload.aab`이며 버전 `2.0.0 (72)`, 패키지 `com.voiceline.app`입니다. 이 ZIP에는 스토어 자료와 공개 인증서가 있습니다.

1. `custom-plans-ko.md`에서 새 기능의 사용법을 확인하고, `VoiceLine-Local58-Play-Readiness-KO.md`에서 적용 내용·검증 범위·남은 작업을 확인합니다.
2. `listing-ko.json` 또는 `listing-ko.md`의 소개 문구를 콘솔에 입력합니다.
3. `images/`의 512px 아이콘, 1024×500 피처 그래픽과 앱 화면 5장을 등록합니다. 화면은 Android 16 에뮬레이터 캡처입니다.
4. `console-guide-ko.md`에 따라 지원 정보와 앱 콘텐츠 선언을 입력합니다. 앱 변경만으로 Play Console의 주소가 자동 변경되지는 않습니다.
5. `physical-qa-ko.md`에 따라 실제 휴대폰을 검사하고, 계정에 필요한 실제 테스터 참여·피드백을 확인합니다.
6. 내부 테스트, 사전 출시 보고서와 실제 피드백을 확인한 뒤 심사를 제출합니다.

| 공개 정보 | 값 |
| --- | --- |
| 개발자 표시명 | 마인드업 스튜디오 |
| 홈페이지 | https://mindup-studio.pages.dev/ |
| VoiceLine 개인정보처리방침 | https://mindup-studio.pages.dev/apps/voiceline/privacy.html |
| VoiceLine 고객지원 | https://mindup-studio.pages.dev/support.html?app=voiceline |
| 지원 이메일 | grand4870@gmail.com |

설치 확인은 `VoiceLine-Local58-CI.apk`로 진행합니다. CI 버전은 `2.0.0-local58-ci (73)`이며 기존 Local57 테스트 앱을 삭제하지 않고 업데이트할 수 있습니다. CI 앱과 정식 앱은 패키지가 달라 기록이 자동 이전되지는 않습니다.

`BUILD-VERIFICATION.json`, `PUBLIC-DOWNLOAD-VERIFICATION.json`과 `verification/`에 이번 빌드·서명·설치 이름·업데이트·lint 확인 결과가 있습니다. 세부 업데이트 버전은 `CI_INSTALL_NAME.json`을 기준으로 확인합니다.

업로드 키는 기존 인증서를 그대로 사용했습니다. 개인 서명키와 비밀번호는 이전에 제공한 별도 비공개 백업을 보관하세요. 이번 ZIP에는 공개 인증서만 포함합니다.
