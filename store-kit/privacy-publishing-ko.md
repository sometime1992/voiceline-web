# VoiceLine 개인정보처리방침 유지

- 공개 URL: https://naruvium.com/apps/voiceline/privacy.html
- 앱 내부 진입: 메뉴 → 개인정보처리방침, 또는 사용법 → 개인정보처리방침 보기
- 고객지원: https://naruvium.com/support.html?app=voiceline#contact
- 문의 이메일: grand4870@gmail.com
- 개발자 홈페이지: https://naruvium.com/

문의는 고객지원 웹페이지에서 VoiceLine을 선택하고 이메일 앱에서 작성·전송합니다. 홈페이지에서는 메일을 자동 전송하거나 문의를 접수하지 않습니다. GitHub는 고객 문의 경로로 안내하지 않습니다.

앱 문안의 원본은 `android-local44/app/src/main/assets/www/privacy-policy.json`입니다. `node ci/build-privacy-policy.cjs`를 실행하면 앱에서 쓰는 JavaScript와 `privacy.html`이 함께 생성됩니다. CI는 원본과 생성 파일이 일치하는지 확인합니다.

공개 홈페이지는 별도 `sometime1992/mindup-studio` 저장소의 Cloudflare Pages 배포입니다. 같은 문안을 `voiceline-source/privacy-policy/privacy-policy.json`에 반영하고 `python3 build.py`와 `python3 validate.py`로 검증합니다. 방침 본문을 빌드 코드에서 다른 문의 문구로 덮어쓰지 않습니다. 앱과 홈페이지를 함께 갱신한 후 공개 URL과 VoiceLine 문의 선택·이메일 수신 주소를 확인합니다.

Play Console의 앱별 개인정보처리방침·고객지원·이메일 값은 별도 항목입니다. 앱이나 홈페이지를 고쳐도 콘솔 입력값이 자동으로 변경되지는 않습니다.
