"""Recheck an existing APK with bounded recovery from API36 UiAutomation errors."""
from pathlib import Path


def with_hierarchy_retry(source):
    needle = "        dump = adb('shell', 'uiautomator', 'dump', '--compressed', remote)\n        text = adb('exec-out', 'cat', remote)"
    replacement = "        try:\n            dump = adb('shell', 'uiautomator', 'dump', '--compressed', remote)\n            text = adb('exec-out', 'cat', remote)\n        except (RuntimeError, subprocess.TimeoutExpired) as error:\n            # API36 UiAutomation can lose its accessibility binder during a\n            # force-stop/relaunch. Retry a new dump; never reuse a stale XML.\n            (qa / 'hierarchy-retry.txt').write_text(str(error))\n            time.sleep(.5)\n            continue"
    assert source.count(needle) == 1, 'Unexpected Android smoke source'
    return source.replace('for attempt in range(2):', 'for attempt in range(3):', 1).replace(needle, replacement, 1)


if __name__ == '__main__':
    target = Path(__file__).resolve().parent.parent / 'ci/android-release-smoke.py'
    text = with_hierarchy_retry(target.read_text())
    exec(compile(text, str(target), 'exec'), {'__file__': str(target), '__name__': '__main__'})
