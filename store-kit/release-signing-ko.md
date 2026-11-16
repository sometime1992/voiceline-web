# VoiceLine Local93 정식 업로드 파일과 서명키

2026-11-16 기준 정식 제출 후보는 `VoiceLine-2.0.0-Local93-Upload.aab`, 패키지 `com.voiceline.app`, 버전 `2.0.0`, 코드 `116`입니다. 기존 업로드 키로 서명했고 인증서 SHA-256이 `upload-certificate-sha256.txt`의 값과 일치함을 확인했습니다. 서명 후에도 번들의 기존 엔트리와 검증한 APK의 오프라인 자산이 유지됩니다.

시험용 `VoiceLine-Local93-CI.apk`는 `com.voiceline.app.local18.ci45`, `2.0.0-local93-ci` (116)이며 기존 CI 인증서를 유지합니다. Local92에서 삭제 없이 업데이트하고 녹음·설정·루틴·연습 기록이 보존되는 것을 Android 16에서 확인했습니다. 정식 구성의 비디버그 화면과 한·영 전환·재시작 후 언어 유지도 별도로 검사했습니다.

Play Console에 실제 등록한 패키지·업로드 인증서와 버전 코드 사용 이력은 직접 대조해야 합니다. 116보다 큰 코드가 이미 사용됐다면 코드를 올리고 다시 빌드합니다. 실제 Galaxy 테스트와 계정별 출시 요건·심사는 별도입니다. 전체 검토는 Local93 결과 보고서와 검증 JSON을 확인하세요.

기존 `VoiceLine-Upload-Key-Backup.zip`과 `VoiceLine-Upload-Key-Passwords.txt`의 키를 계속 사용하며 새 키를 만들지 않습니다. 배포 파일에 개인 키나 비밀번호를 넣지 않습니다.

## 이후 업데이트

업로드 키를 매번 새로 만들지 마세요. 제공된 백업을 사용합니다. 새 버전도 기존 업로드 인증서로 서명해야 합니다. 이후 정식 버전은 Play Console에서 이미 사용한 코드보다 큰 버전 코드를 사용해야 합니다. 현재 정식 구성은 116입니다.

Android Studio의 **Build → Generate Signed App Bundle / APK → Android App Bundle → release**에서 백업의 `voiceline-upload.p12`와 별도 비밀번호를 선택합니다. 별칭은 `voiceline-upload`입니다. 업로드 키를 저장소 안에 복사하거나 Git에 커밋하지 마세요.

자동 빌드가 필요하면 프로젝트는 다음 환경변수를 지원합니다. 실제 비밀번호는 소스 파일이나 명령줄에 직접 넣지 않습니다.

| 환경변수 | 값 |
| --- | --- |
| `VOICELINE_UPLOAD_KEYSTORE` | 저장소 밖의 `voiceline-upload.p12` 절대 경로 |
| `VOICELINE_UPLOAD_STORE_PASSWORD` | 별도 비밀번호 |
| `VOICELINE_UPLOAD_KEY_ALIAS` | `voiceline-upload` |
| `VOICELINE_UPLOAD_KEY_PASSWORD` | 저장소 비밀번호와 같으면 생략 가능 |

환경을 설정한 뒤 Gradle 8.11.1 / Java 17 환경에서 `:app:bundleRelease`를 빌드합니다. Play App Signing을 사용하면 Google이 설치용 앱 서명을 관리하며, 업로드 키는 제출자 확인에 사용합니다.

정식 앱 식별자는 CI 테스트 앱과 다르므로 현재 CI 앱의 기록이 정식 앱으로 자동 이전되지는 않습니다. 필요한 녹음은 CI 앱에서 먼저 내보내세요.
