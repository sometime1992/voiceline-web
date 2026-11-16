"""Verify the packaged source, original identity and both APK certificates."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'dist'
out.mkdir(exist_ok=True)
apk = out / 'VoiceLine-Local91-CI.apk'
previous = root / 'release-review/previous-Local90-CI.apk'
sdk = Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0'
pin = (root / 'ci/android-debug-cert.sha256').read_text().strip().lower()
def run(command, file):
    return subprocess.check_output([str(sdk / command), *file], text=True)
badging = run('aapt', ['dump', 'badging', str(apk)])
assert "name='com.voiceline.app.local18.ci45'" in badging
assert "versionCode='114'" in badging
assert "versionName='2.0.0-local91-ci'" in badging
assert "android.permission.INTERNET" not in run('aapt', ['dump', 'permissions', str(apk)])
signatures = {}
for name, file in [('Local90', previous), ('Local91', apk)]:
    certs = run('apksigner', ['verify', '--print-certs', str(file)])
    digest = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', certs, re.I).group(1).lower()
    assert digest == pin, name + ' changed certificate'
    signatures[name] = digest
web = root / 'android-local44/app/src/main/assets/www'
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    for file in web.rglob('*'):
        if file.is_file():
            name = 'assets/www/' + file.relative_to(web).as_posix()
            assert z.read(name) == file.read_bytes(), name
    names = z.namelist()
    assert len([p for p in names if p.startswith('assets/www/vendor/salamander/') and p.endswith('.mp3')]) == 28
    assert not any('song-practice' in p for p in names)
    html = z.read('assets/www/index.html').decode()
    for identifier in ['keyboard', 'recordRightsDialog', 'studioYoutubeLink', 'pianoCreditsOpen', 'trainingPitchGuide']:
        assert 'id="' + identifier + '"' in html
    js = z.read('assets/www/piano.js').decode()
    assert "indexedDB.open('voiceline-local-v2',4)" in js
    assert "🎤 감도 " in js
    assert 'requestRecordingRightsConsent(operation)' in js
    for removed in ['SongPlaybackBridge.java', 'LocalMrReducer.java']:
        assert not (root / 'android-local44/app/src/main/java/com/voiceline/app' / removed).exists()
facts = {'status': 'passed', 'source_commit': os.environ.get('GITHUB_SHA'),
         'package': 'com.voiceline.app.local18.ci45', 'version_name': '2.0.0-local91-ci',
         'version_code': 114, 'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
         'same_signing_certificate': True, 'certificate_sha256': pin,
         'previous_certificate_sha256': signatures['Local90'], 'all_offline_assets_identical_to_source': True,
         'piano_samples': 28, 'recording_database_name_and_version_unchanged': True,
         'removed_song_features_still_absent': True, 'copyright_controls_present': True}
(out / 'APK_VERIFIED.json').write_text(json.dumps(facts, indent=2) + '\n')
print(json.dumps(facts))
