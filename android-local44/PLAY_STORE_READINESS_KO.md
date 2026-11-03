# VoiceLine Google Play 등록 준비

확인일: 2026-11-01 · Local55 · 정식 버전 2.0.0 (70)

앱 이름·개인정보처리방침·스토어 자료와 정식 업로드 빌드 절차를 준비했습니다. Play Console 계정 설정·심사 제출·실제 테스터 참여는 수행하지 않았습니다. 패키지 이름의 사용 가능 여부도 콘솔에서 확인해야 합니다.

## 준비한 항목

| 항목 | 내용 |
| --- | --- |
| 앱 이름 | 설치 이름·화면·PWA·스토어 소개를 VoiceLine으로 통일 |
| Android | min SDK 26 / compile·target SDK 36 |
| 출시 빌드 | `com.voiceline.app`, 버전 `2.0.0`, 코드 `70`, 디버그 비활성화 |
| 기존 테스트 앱 | `com.voiceline.app.local18.ci45`, 기존 CI 서명 유지. 현재 CI 앱의 기록 보존 |
| 업로드 키 | 전용 키 생성, 비공개 백업·비밀번호 별도 제공. 개인 키는 공개 저장소·CI에 넣지 않음 |
| 서명 절차 | CI의 미서명 AAB 검증 후 로컬에서 전용 업로드 키로 서명. 최종 파일의 서명과 내용 재확인 |
| 개인정보처리방침 | 공개 웹페이지와 동일 문안을 앱 안에서 오프라인으로 읽음 |
| 문의 | GitHub 공개 문의 연결. Play 스토어에 공개할 지원 이메일은 운영자 지정 필요 |
| 데이터 처리 | 광고·로그인·분석 SDK·앱 인터넷 권한 없음. 마이크 분석·녹음·연습 기록은 기기 내 처리. 사용자 주도 내보내기/공유 |
| 스토어 원고 | `store-kit/listing-ko.json` 등. 이름 30자·간단 설명 80자·자세한 설명 4,000자 제한 검증 |
| 스토어 이미지 | 기존 브랜드의 512px 32-bit PNG, 1024×500 피처 그래픽, Android16 에뮬레이터 앱 화면 캡처 |
| 자동 검사 | 회귀·가로/세로 UI·오프라인 방침·외부 링크·AAB 메타데이터·서명·내장 자산·release lint |
| Android 실행 | 에뮬레이터에서 출시 코드 시작·오프라인 방침·뒤로 가기·워밍업·회전·그래프 숨김 확인 절차 |

공개 방침: https://voiceline-privacy-sometime1992.quantum4870.chatgpt.site/

현재 공개 문의: https://github.com/sometime1992/voiceline-web/issues/new

실제 빌드·실행 결과와 해시·경고 수는 해당 커밋의 Actions 보고서와 최종 제공 자료에 기록합니다. 에뮬레이터 확인은 실제 S24 Ultra의 마이크·출력 지연·기기별 동작 확인을 대신하지 않습니다.

## 운영자가 완료할 항목

1. 개발자 계정의 본인·연락처·기기 확인을 완료하고 공개할 지원 이메일과 개발자 정보를 입력합니다. 연결 계정의 개인 이메일을 임의로 공개하지 않았습니다.
2. 콘솔의 기존 앱 또는 새 앱에서 패키지 이름 `com.voiceline.app`을 대조합니다. 패키지는 첫 업로드 전 확정해야 합니다. 사용 중이거나 다른 식별자로 만들었다면 AAB를 다시 준비합니다.
3. 최종 서명 AAB로 내부 테스트를 시작하고 Play App Signing을 설정합니다. 업로드 키 백업을 소유자가 안전하게 보관합니다. CI APK와 에뮬레이터 확인용 임시 서명 APK를 스토어 파일로 혼용하지 않습니다.
4. 방침 URL, 스토어 소개·이미지·이메일, 데이터 보안·광고·앱 접근·대상 연령·콘텐츠 등급·건강 앱 선언을 실제 기능에 맞게 작성합니다. `store-kit/console-guide-ko.md`에 확인된 사실과 운영자 판단 항목을 구분했습니다.
5. `store-kit/physical-qa-ko.md`의 S24 Ultra Android16 확인을 수행합니다. 권한 거절·회전·뒤로 가기·호흡 중단·녹음 저장/복구/삭제/내보내기와 실제 소리를 확인합니다. 미실행 항목을 통과한 것으로 표시하지 않았습니다.
6. 2023-11-13 이후 생성된 신규 개인 계정 요건에 해당하면, 최소 12명이 연속 14일 참여하는 비공개 테스트 후 프로덕션 액세스를 신청합니다. 가짜 테스터나 참여 기록은 만들지 않습니다.
7. 사전 출시 보고서와 피드백을 확인한 뒤 심사에 제출합니다. 빌드·서명 성공은 Google의 심사 승인이나 공개 배포를 의미하지 않습니다.

정식 앱과 CI 앱은 식별자가 달라 기록이 자동 이전되지 않습니다. 필요한 녹음은 현재 CI 앱에서 먼저 내보내세요. 앱 삭제·데이터 초기화는 내부 기록을 지웁니다.

## 자료

- `store-kit/`: 소개·콘솔 작성·실기기 QA·테스터 안내·서명/방침 유지 절차
- `VoiceLine-2.0.0-Upload.aab`: 최종 업로드 키 서명 파일
- `VoiceLine-Play-Store-Kit.zip`: 스토어 자료·이미지·공개 인증서
- 별도 키 백업 ZIP과 비밀번호 파일: 비공개 보관. 공개 스토어 자료에 넣지 않음

## 공식 기준

- [대상 API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=ko)
- [방침·앱 콘텐츠](https://support.google.com/googleplay/android-developer/answer/9859455?hl=ko)
- [데이터 보안](https://support.google.com/googleplay/android-developer/answer/10787469?hl=ko)
- [건강 앱 선언](https://support.google.com/googleplay/android-developer/answer/14738291?hl=ko)
- [스토어 이미지](https://support.google.com/googleplay/android-developer/answer/9866151?hl=ko)
- [서명](https://developer.android.com/studio/publish/app-signing)
- [개인 계정 테스트](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)
