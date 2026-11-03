"""Review an unsigned production bundle; this is not a Play upload artifact."""
import hashlib
import os
import shutil
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
project = root / 'android-local44'
bundle = project / 'app/build/outputs/bundle/release/app-release.aab'
assets = project / 'app/src/main/assets/www'
count = 0
with zipfile.ZipFile(bundle) as archive:
    assert archive.testzip() is None
    dex=b''.join(archive.read(name) for name in archive.namelist()
                 if name.startswith('base/dex/') and name.endswith('.dex'))
    for url in ['https://mindup-studio.pages.dev/','https://mindup-studio.pages.dev/apps/voiceline/privacy.html','https://mindup-studio.pages.dev/support.html?app=voiceline']:
        assert url.encode() in dex, 'Native public destination missing: '+url
    assert 'base/manifest/AndroidManifest.xml' in archive.namelist()
    assert 'BundleConfig.pb' in archive.namelist()
    assert not any(n.lower().endswith('.so') for n in archive.namelist())
    assert not any(n.startswith('META-INF/') and n.endswith(('.RSA', '.DSA', '.EC')) for n in archive.namelist()), 'Review bundle must stay unsigned'
    for source in assets.rglob('*'):
        if source.is_file():
            assert archive.read('base/assets/www/' + source.relative_to(assets).as_posix()) == source.read_bytes(), source
            count += 1
report = root / 'release-review'
report.mkdir(exist_ok=True)
target = report / 'VoiceLine-Local72-UNSIGNED-REVIEW.aab'
shutil.copyfile(bundle, target)
text = '\n'.join([
    'VoiceLine Local72 release build review - NOT READY FOR PLAY UPLOAD',
    'Commit: ' + os.environ['GITHUB_SHA'],
    'Release application ID: com.voiceline.app',
    'Target SDK: 36; minimum SDK: 26',
    'AGP: 8.10.1; Gradle: 8.11.1; Java: 17',
    'Unsigned CI AAB generated successfully; the prepared owner-held upload key is applied locally after download.',
    'Offline assets verified byte-for-byte: ' + str(count),
    'No bundled native .so libraries; no app-owned 16 KB ELF alignment work identified.',
    'SHA-256: ' + hashlib.sha256(target.read_bytes()).hexdigest(),
    'Public privacy policy and store material sources are prepared. Remaining owner steps: Console contact/details/declarations, package ID confirmation, required testers and physical-device checks.',
    'Android lint results accompany this report. Real Android 16 device and Play pre-launch tests remain required.',
]) + '\n'
(report / 'RELEASE_REVIEW.txt').write_text(text)
print(text)
