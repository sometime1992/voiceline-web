"""Check the actual APK outputs before publishing the CI artifact."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
project = root / "android-local44"
assets = project / "app/src/main/assets"
sdk_tools = Path(os.environ["ANDROID_HOME"]) / "build-tools/35.0.0"
dist = root / "dist"
dist.mkdir(exist_ok=True)
report = [
    "VoiceLine Local46 - GitHub Actions debug APKs",
    "Commit: " + os.environ["GITHUB_SHA"],
    "Run: https://github.com/" + os.environ["GITHUB_REPOSITORY"]
    + "/actions/runs/" + os.environ["GITHUB_RUN_ID"],
    "Original Local44 source ZIP SHA-256: "
    "2e17511e47a63d4d7620bede62e0e58e0fe1395acac8c694556b3b2ab1bd75c1",
    "Local46 adds a live pitch graph and timed dynamics guidance. The application ID and signing key match CI45.",
    "CI45 APK: separate application and separate storage; keeps earlier PC/CI installations and recordings intact.",
    "Do not uninstall an existing app to resolve a signature mismatch.",
    "CI45 signing uses an explicit cached key. Once pinned, a missing or different key blocks future builds.",
    "",
]
variants = [
    ("ciDebug", "com.voiceline.app.local18.ci45", "2.0.0-local46-ci", "VoiceLine-Local46-CI.apk"),
]
certificates = []
for variant, app_id, version, filename in variants:
    outputs = list((project / "app/build/outputs/apk" / variant).glob("*.apk"))
    assert len(outputs) == 1, (variant, outputs)
    apk = outputs[0]
    badging = subprocess.check_output([str(sdk_tools / "aapt"), "dump", "badging", str(apk)], text=True)
    assert "package: name='" + app_id + "'" in badging, badging
    assert "versionCode='61'" in badging, badging
    assert "versionName='" + version + "'" in badging, badging
    assert "sdkVersion:'26'" in badging, badging
    assert "targetSdkVersion:'35'" in badging, badging
    cert = subprocess.check_output([
        str(sdk_tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)
    ], text=True)
    digest = re.search(r"Signer #1 certificate SHA-256 digest: (\w+)", cert)
    assert digest, cert
    pinned = root / "ci/android-debug-cert.sha256"
    if pinned.exists():
        assert digest.group(1).lower() == pinned.read_text().strip().lower(), "CI signing certificate changed"
    certificates.append(digest.group(1))
    with zipfile.ZipFile(apk) as archive:
        assert archive.testzip() is None
        count = 0
        for source in assets.rglob("*"):
            if source.is_file():
                entry = "assets/" + source.relative_to(assets).as_posix()
                assert archive.read(entry) == source.read_bytes(), entry
                count += 1
        assert count > 35, count
    target = dist / filename
    shutil.copyfile(apk, target)
    report.extend([
        filename,
        "  Application ID: " + app_id,
        "  Version: " + version + " (61)",
        "  SHA-256: " + hashlib.sha256(target.read_bytes()).hexdigest(),
        "  Signing certificate SHA-256: " + digest.group(1),
        "  Offline assets verified byte-for-byte: " + str(count),
        "  Size: " + str(target.stat().st_size) + " bytes",
        "",
    ])
assert len(set(certificates)) == 1, "Variant signing keys differ"
(dist / "BUILD_INFO.txt").write_text("\n".join(report), encoding="utf-8")
print("\n".join(report))
