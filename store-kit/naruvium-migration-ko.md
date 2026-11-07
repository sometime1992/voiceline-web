# VoiceLine Local80 · 나루비움 스튜디오 공식 도메인

수정일: 2026-11-07. 기준 소스: `6b665cc22df0fbe06cedb469af7679c43f8b4a3d`.

| 용도 | 주소 |
| --- | --- |
| 개발자 이름 | 나루비움 스튜디오 / Naruvium Studio |
| 공식 홈페이지 | https://naruvium.com/ |
| 개인정보처리방침 | https://naruvium.com/apps/voiceline/privacy.html |
| 고객지원 | https://naruvium.com/support.html?app=voiceline#contact |
| 공개 문의 이메일 | grand4870@gmail.com |

Android의 고정 외부 URL, 브라우저 대체 동작, 오프라인 개인정보처리방침과 생성 원본, 스토어 안내 및 자동 검사의 기대 주소를 함께 변경했습니다. 이전 정책·문의 페이지 경로와 앱 선택 쿼리·contact 앵커를 유지합니다.

현재 소스의 정식 구성은 `com.voiceline.app`, 2.0.0 / 코드 96이며 CI 구성은 `com.voiceline.app.local18.ci45`, 2.0.0-local80-ci / 코드 97입니다. 패키지와 기존 서명 방식, 녹음·연습 기록 형식은 변경하지 않습니다.

Local79에서 완료했던 Android 실행·서명·업데이트 검사는 당시 산출물에 대한 기록입니다. 이번 Local80 소스에 그 결과를 자동으로 적용하지 않습니다. 이전 APK·AAB에는 이전 URL이 남아 있을 수 있습니다. 이번 Local80의 공식 도메인 HTTPS·정책·지원 페이지 공개 접속을 확인했습니다. Play Console 입력값과 실제 휴대폰 설치는 이 작업으로 자동 변경되지 않습니다.

## Local80 실제 빌드 결과

빌드 소스: `074e1268feefb7f50503196f0ba5e5b3de4b2fe2`. 빌드와 모든 단계는 https://github.com/sometime1992/voiceline-web/actions/runs/42349613340 에서 통과했습니다.

회귀 검사 363개, 브라우저 레이아웃 검사, Android lint, AAB 검증과 Android 16 실행·설정·화면 회전·기존 CI 업데이트 검사를 통과했습니다. Local77 → Local80 업데이트는 삭제 없이 설치됐고 비공개 테스트 파일이 보존됐습니다. 실제 휴대폰 검사는 수행하지 않았습니다.

CI APK는 기존 인증서 `e0bc85a5900a64eee520a444e80db3844a4b9372c172ab021e0944d239ce429c`, 정식 APK·AAB는 기존 업로드 인증서 `916a59f6613bdd7f69737eb3eda2c31e35111866d3da1edfa621095b1e2b02ce`로 확인했습니다. 정식 APK는 검증한 서명 AAB에서 universal APK로 생성했습니다. Android 실행 검사는 같은 정식 코드에 CI 테스트 키로 서명한 실행 확인용 APK에서 수행했습니다.

현재 배포 파일의 해시·서명·버전·네이티브 URL·내장 자산 일치 결과는 `naruvium-build-verification.json`을 기준으로 확인합니다. 개인 키·비밀번호는 스토어 자료에 포함하지 않습니다.
