# VoiceLine 정식 업로드 파일과 서명키

정식 제출 대상은 `com.voiceline.app`, 버전 `2.0.0`, 코드 `72`입니다. Play Console에 이미 앱을 만들었다면 패키지 이름을 먼저 대조하세요. 패키지 이름의 예약·사용 가능 여부는 콘솔에서 확인해야 합니다.

## 이번 제공 파일

- `VoiceLine-2.0.0-Upload.aab`: 소유자 업로드 키로 서명한 정식 코드의 AAB. Play Console에 올릴 파일입니다.
- `VoiceLine-Upload-Key-Backup.zip`: 업로드 키와 공개 인증서의 비공개 백업입니다. 스토어 이미지나 공개 릴리스 ZIP에 포함하지 않습니다.
- `VoiceLine-Upload-Key-Passwords.txt`: 백업 키를 여는 비밀번호입니다. 키 백업과 분리해 안전하게 보관합니다.
- `VoiceLine-Upload-Certificate.pem`: 공개 인증서입니다. 개인 키가 아니며, 인증서 등록이 필요할 때 사용할 수 있습니다.
- `VoiceLine-Local58-CI.apk`: 기존 CI45 패키지의 테스트 앱을 업데이트하는 APK입니다. Local57에서 삭제 없이 업데이트하고 비공개 테스트 파일이 유지되는 것을 확인했습니다. 실제 휴대폰의 녹음·연습 기록 유지 여부는 설치 후 확인하세요. 스토어 제출 파일은 AAB를 사용합니다.

CI에 만든 `release-runtime-review.apk`는 에뮬레이터 실행 확인에만 쓰는 임시 테스트 서명 파일입니다. 위 정식 AAB와 구분해야 합니다.

## 이후 업데이트

업로드 키를 매번 새로 만들지 마세요. 제공된 백업을 사용합니다. 이번 파일은 기존 업로드 인증서를 그대로 사용했습니다. 이후 정식 버전은 버전 코드를 72보다 크게 올려야 합니다.

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
