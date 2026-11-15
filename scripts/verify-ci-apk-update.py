"""Verify an update using the exact APK and metadata already validated by CI."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
info = json.loads((root / 'dist/APK_LABEL_VERIFIED.json').read_text())
apks = list((root / 'dist').glob('*-CI.apk'))
assert len(apks) == 1, apks
apk = apks[0]
assert hashlib.sha256(apk.read_bytes()).hexdigest() == info['apk_sha256']
package = info['package']

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=60)

adb('install', '-r', str(root / 'release-review/previous-Local77-CI.apk'))
assert 'versionName=2.0.0-local77-ci' in adb('shell', 'dumpsys', 'package', package)
marker = 'files/voiceline-local86-update-probe'
adb('shell', 'run-as', package, 'mkdir', '-p', 'files')
adb('shell', 'run-as', package, 'touch', marker)
adb('install', '-r', str(apk))
installed = adb('shell', 'dumpsys', 'package', package)
assert 'versionName=' + info['version_name'] in installed
assert 'versionCode=' + str(info['version_code']) in installed
assert marker in adb('shell', 'run-as', package, 'ls', marker)
out = root / 'android-smoke'
out.mkdir(exist_ok=True)
result = {'status': 'passed', 'apk_sha256': info['apk_sha256'],
          'source_commit': info['source_commit'], 'package': package,
          'version_name': info['version_name'], 'version_code': info['version_code'],
          'updated_without_uninstall': True, 'private_test_data_preserved': True}
(out / 'CI_UPDATE_VERIFIED.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
