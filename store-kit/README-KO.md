# VoiceLine Google Play 준비 자료 · Local80

현재 자료는 나루비움 도메인을 반영한 Local80 소스 기준입니다. 새 APK·AAB의 빌드·서명·설치 검증은 아직 완료하지 않았습니다. 기존 `BUILD-VERIFICATION.json`과 `verification/`의 결과는 각 파일에 명시된 Local79 등 이전 산출물에 대한 기록이며, Local80 검증 결과로 사용하지 않습니다. `naruvium-migration-ko.md`를 먼저 확인하세요.

일반 연습과 루틴의 상세 설정을 통합했습니다. 현재 값·실제 진행 순서·전체/발성 시간을 위에서 확인하고 관련 항목을 펼쳐 편집합니다. 청음 직접 지정과 비브라토 기준음·메트로놈 저장 복원도 개선했습니다. 아·에·이·오·우는 각각 음계를 왕복합니다. 5음 음계와 도미솔 도약을 선택하고, 모음마다 한 구절 전체를 부릅니다. 각 목표 음을 유지하며 모음 사이 회복·모음마다 먼저 듣기·루틴 저장·반복을 지원합니다. 발음과 소리 크기는 판정하지 않습니다. 이전 모음 강약 루틴은 기준음·반복을 보존해 음계 왕복으로 전환합니다. 정식 업로드 번들은 `VoiceLine-2.0.0-Upload.aab`, 버전 `2.0.0 (96)`, 패키지는 `com.voiceline.app`입니다.

1. `custom-plans-ko.md`에서 새 기능의 사용법을 확인하고, `VoiceLine-Local64-Play-Readiness-KO.md`에서 적용 내용·검증 범위·남은 작업을 확인합니다.
2. `listing-ko.json` 또는 `listing-ko.md`의 소개 문구를 콘솔에 입력합니다.
3. `images/`의 512px 아이콘, 1024×500 피처 그래픽과 앱 화면 5장을 등록합니다. 화면은 Android 16 에뮬레이터 캡처입니다.
4. `console-guide-ko.md`에 따라 지원 정보와 앱 콘텐츠 선언을 입력합니다. 앱 변경만으로 Play Console의 주소가 자동 변경되지는 않습니다.
5. `physical-qa-ko.md`에 따라 실제 휴대폰을 검사하고, 계정에 필요한 실제 테스터 참여·피드백을 확인합니다.
6. 내부 테스트, 사전 출시 보고서와 실제 피드백을 확인한 뒤 심사를 제출합니다.

| 공개 정보 | 값 |
| --- | --- |
| 개발자 표시명 | 나루비움 스튜디오 |
| 홈페이지 | https://naruvium.com/ |
| VoiceLine 개인정보처리방침 | https://naruvium.com/apps/voiceline/privacy.html |
| VoiceLine 고객지원 | https://naruvium.com/support.html?app=voiceline#contact |
| 지원 이메일 | grand4870@gmail.com |

설치 확인은 `VoiceLine-Local80-CI.apk`로 진행합니다. CI 버전은 `2.0.0-local80-ci (97)`이며 기존 CI 테스트 앱을 삭제하지 않고 업데이트할 수 있습니다. CI 앱과 정식 앱은 패키지가 달라 기록이 자동 이전되지는 않습니다.

`BUILD-VERIFICATION.json`, `PUBLIC-DOWNLOAD-VERIFICATION.json`과 `verification/`가 포함된 패키지에서는 각 보고서의 소스 커밋·버전·해시를 대조하세요. 이전 산출물의 빌드·서명·설치·업데이트·lint 결과는 새 버전에 자동 적용되지 않습니다.

업로드 키는 기존 인증서를 그대로 사용했습니다. 개인 서명키와 비밀번호는 이전에 제공한 별도 비공개 백업을 보관하세요. 이번 ZIP에는 공개 인증서만 포함합니다.
