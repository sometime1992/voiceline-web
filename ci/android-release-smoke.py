"""Run only on an isolated Android 16 emulator; never touches a user's phone."""
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / 'store-media'
out.mkdir(exist_ok=True)
qa = root / 'android-smoke'
qa.mkdir(exist_ok=True)
package = 'com.voiceline.app'
checks = []
hierarchy_number = 0
systemui_startup_recovered = False

class HierarchyUnavailable(RuntimeError):
    pass

def adb(*args, binary=False, timeout=50):
    result = subprocess.run(['adb', *args], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode(errors='replace')

def tree():
    global hierarchy_number
    for attempt in range(2):
        hierarchy_number += 1
        remote = '/sdcard/voiceline-window-' + str(hierarchy_number) + '.xml'
        dump = adb('shell', 'uiautomator', 'dump', '--compressed', remote)
        text = adb('exec-out', 'cat', remote)
        # During cold WebView startup, uiautomator can return success without
        # creating its file. Never parse cat's diagnostic or reuse an old tree.
        begin = text.find('<?xml')
        if begin >= 0:
            try:
                document = ET.fromstring(text[begin:])
                (qa / 'last-window.xml').write_text(text[begin:])
                return document
            except ET.ParseError:
                pass
        (qa / 'hierarchy-retry.txt').write_text(dump + '\n' + text)
        time.sleep(.5)
    raise HierarchyUnavailable('Android hierarchy temporarily unavailable; see hierarchy-retry.txt')

def visible(label, document=None):
    document = tree() if document is None else document
    return any(label in (n.attrib.get('text', ''), n.attrib.get('content-desc', '')) for n in document.iter('node'))

def tap(label, identifier=None, partial=False):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            document = tree()
        except HierarchyUnavailable:
            continue
        candidates = [n for n in document.iter('node') if
                      n.attrib.get('text') == label or n.attrib.get('content-desc') == label or
                      identifier and n.attrib.get('resource-id', '').endswith(identifier)]
        if partial:
            candidates += [n for n in document.iter('node') if n not in candidates and
                           n.attrib.get('clickable') == 'true' and
                           any(label in n.attrib.get(key, '') for key in ('text', 'content-desc'))]
        candidates.sort(key=lambda n: 0 if identifier and n.attrib.get('resource-id','').endswith(identifier) else 1)
        for node in candidates:
            values = list(map(int, re.findall(r'\d+', node.attrib.get('bounds', ''))))
            if len(values) == 4 and values[2] > values[0] and values[3] > values[1]:
                adb('shell', 'input', 'tap', str((values[0]+values[2])//2), str((values[1]+values[3])//2))
                time.sleep(.5)
                return
        time.sleep(.4)
    raise AssertionError('Android control not found: ' + label)


def settings_rect(label, identifier=None, document=None):
    document=tree() if document is None else document
    candidates=[n for n in document.iter('node') if (n.attrib.get('text')==label or n.attrib.get('content-desc')==label) and (not identifier or n.attrib.get('resource-id','').endswith(identifier))]
    # The last dialog follows underlying WebView content in accessibility order.
    for n in reversed(candidates):
        r=[int(v) for v in re.findall(r'\d+',n.attrib.get('bounds',''))]
        if len(r)==4 and r[2]>r[0] and r[3]>r[1]:return r
    raise AssertionError('Settings control has no visible bounds: '+label)

def assert_settings_readable(landscape=False, selected='모음 · 아에이오우'):
    # A single editor can scroll vertically. Verify each field at its reachable
    # position rather than requiring all long selects above the footer at once.
    geometry={}
    for key,text in [('label','연습 종류'),('field',selected),('pattern','아에이오우 · 5음 음계 왕복')]:
        scroll_settings_to(text)
        document=tree()
        rect=settings_rect(text,document=document)
        confirm=settings_rect('변경 확인','planRun',document)
        close=settings_rect('연습 설정 닫기','planClose',document)
        assert rect[1]>=close[3] and rect[3]<=confirm[1],(key,rect,confirm,close)
        geometry[key]=rect
    name='settings-landscape-geometry.json' if landscape else 'settings-portrait-geometry.json'
    (qa/name).write_text(json.dumps({'status':'passed','fields':geometry,'actions':confirm,'header':close,'landscape':landscape,'single_editor':True},indent=2))


def scroll_settings_to(label):
    def in_view(document):
        try:
            r=settings_rect(label,document=document)
            top=settings_rect('연습 설정 닫기','planClose',document)[3]
            bottom=settings_rect('변경 확인','planRun',document)[1]
            return r[1]>=top and r[3]<=bottom
        except AssertionError:return False
    for attempt in range(28):
        document=tree()
        if in_view(document):return
        area=next(n for n in document.iter('node') if n.attrib.get('resource-id','').endswith('planScroll'))
        bounds=[int(v) for v in re.findall(r'\d+',area.attrib['bounds'])]
        columns=set()
        for n in document.iter('node'):
            if n.attrib.get('text','').endswith('설정 영역'):
                r=[int(v) for v in re.findall(r'\d+',n.attrib.get('bounds',''))]
                if len(r)==4 and r[2]>r[0]:columns.add((r[0],r[2]))
        columns=sorted(columns)
        # Swipe in an observed card gutter, never over a native select or slider.
        gaps=[(left[1]+right[0])//2 for left,right in zip(columns,columns[1:]) if right[0]-left[1]>=6]
        x=gaps[0] if gaps else bounds[0]+max(60,(bounds[2]-bounds[0])//6)
        target=[n for n in document.iter('node') if n.attrib.get('text')==label or n.attrib.get('content-desc')==label]
        r=[int(v) for v in re.findall(r'\d+',target[-1].attrib.get('bounds',''))] if target else []
        # Offscreen WebView nodes are clipped to the window edge, so their
        # bounds still identify which direction leads back to the control.
        toward_top=len(r)==4 and r[1]<bounds[1] or not r and attempt<4
        middle=(bounds[1]+bounds[3])//2
        distance=min(250,max(60,(bounds[3]-bounds[1])//2))
        start=middle-distance//2 if toward_top else middle+distance//2
        finish=middle+distance//2 if toward_top else middle-distance//2
        adb('shell','input','swipe',str(x),str(start),str(x),str(finish),'450')
        time.sleep(.3)
    raise AssertionError('Single-page settings control not reachable: '+label)

def choose_vowel_settings():
    # Click the select in the current modal rather than the similar underlying control.
    r=settings_rect('음계')
    adb('shell','input','tap',str((r[0]+r[2])//2),str((r[1]+r[3])//2))
    time.sleep(.5)
    tap('모음 · 아에이오우',partial=True)
    wait_visible('모음 · 아에이오우')

def start():
    adb('shell', 'am', 'force-stop', package)
    adb('shell', 'am', 'start', '-W', '-n', package + '/com.voiceline.app.MainActivity')
    # A cold emulator can still be starting WebView after the Activity is visible.
    wait_visible('VoiceLine', timeout=60)
    wait_visible('C3 · 1옥 도', timeout=40)
    wait_visible('메뉴 열기', timeout=40)

def choose(label):
    tap('메뉴 열기', 'menuOpen')
    if label == '나의 루틴':
        screenshot('menu-android16.png', False)
    # WebView exposes a menu button's title and description as one accessible label.
    tap(label, partial=True)
    time.sleep(1)

def screenshot(name, store=True):
    (out if store else qa).joinpath(name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))

def wait_visible(label, timeout=25):
    global systemui_startup_recovered
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            document = tree()
            # API36's cold boot can show a System UI ANR above a fully loaded
            # WebView. Wait once for that exact OS dialog; never dismiss an
            # application ANR or treat an obscured app as a successful start.
            if visible("System UI isn't responding", document) and not systemui_startup_recovered:
                wait = next((n for n in document.iter('node') if n.attrib.get('resource-id') == 'android:id/aerr_wait'), None)
                bounds = [int(n) for n in re.findall(r'\d+', wait.attrib.get('bounds', ''))] if wait is not None else []
                if len(bounds) == 4:
                    systemui_startup_recovered = True
                    (qa / 'systemui-startup-recovery.xml').write_bytes(ET.tostring(document, encoding='utf-8'))
                    adb('shell', 'input', 'tap', str((bounds[0]+bounds[2])//2), str((bounds[1]+bounds[3])//2))
                    time.sleep(1)
                    continue
            if visible(label, document):
                return
        except HierarchyUnavailable:
            pass
        time.sleep(.5)
    raise AssertionError('Android UI not ready: ' + label)

def verify_ci_update_name():
    ci_package = 'com.voiceline.app.local18.ci45'
    adb('install', '-r', str(root / 'release-review/previous-Local75-CI.apk'))
    old_package = adb('shell', 'dumpsys', 'package', ci_package)
    assert 'versionName=2.0.0-local75-ci' in old_package
    adb('shell', 'am', 'start', '-W', '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS',
        '-d', 'package:' + ci_package)
    wait_visible('VoiceLine', timeout=60)
    screenshot('ci-before-update-app-info.png', False)
    adb('shell', 'run-as', ci_package, 'mkdir', '-p', 'files')
    marker = 'files/voiceline-name-update-probe'
    adb('shell', 'run-as', ci_package, 'touch', marker)
    adb('shell', 'am', 'force-stop', 'com.android.settings')
    adb('install', '-r', str(root / 'dist/VoiceLine-Local76-CI.apk'))
    installed = adb('shell', 'dumpsys', 'package', ci_package)
    assert 'versionName=2.0.0-local76-ci' in installed and 'versionCode=91' in installed
    assert marker in adb('shell', 'run-as', ci_package, 'ls', marker)
    adb('shell', 'am', 'start', '-W', '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS',
        '-d', 'package:' + ci_package)
    wait_visible('VoiceLine', timeout=60)
    document = tree()
    assert not any('보이스라인' in n.attrib.get('text', '') for n in document.iter('node'))
    screenshot('ci-after-update-app-info.png', False)
    (qa / 'ci-installed-app-info.xml').write_bytes(ET.tostring(document, encoding='utf-8'))
    (qa / 'CI_INSTALL_NAME.json').write_text(json.dumps({
        'status': 'passed', 'package': ci_package, 'before_version': '2.0.0-local75-ci (90)',
        'before_app_info_label': 'VoiceLine', 'after_version': '2.0.0-local76-ci (91)',
        'after_app_info_label': 'VoiceLine', 'update_installed_without_uninstall': True,
        'private_test_file_preserved': True, 'environment': 'Android16 API36 emulator',
        'phone_physical_test': 'not performed',
    }, ensure_ascii=False, indent=2) + '\n')

console_file = (qa / 'web-console-live.txt').open('w')
console_process = None
try:
    assert adb('shell', 'getprop', 'ro.build.version.sdk').strip() == '36'
    adb('shell', 'wm', 'size', '1080x1920')
    adb('shell', 'wm', 'density', '420')
    adb('shell', 'wm', 'user-rotation', 'lock', '0')
    adb('install', '-r', str(root / 'release-review/release-runtime-review.apk'))
    adb('logcat', '-c')
    console_process = subprocess.Popen(['adb', 'logcat', '-v', 'time', 'VoiceLineWeb:W', 'AndroidRuntime:E', '*:S'],
                                       stdout=console_file, stderr=subprocess.STDOUT)
    start()
    assert visible('VoiceLine')
    checks.append('API36 production build starts and displays VoiceLine')
    screenshot('01-piano-portrait.png')
    choose('개인정보처리방침')
    assert visible('개인정보처리방침')
    assert visible('공개 웹페이지') and visible('개발자 문의') and visible('개발자 홈페이지')
    screenshot('privacy-android16.png', False)
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(1)
    assert not visible('개인정보처리방침')
    assert adb('shell', 'pidof', package).strip()
    checks.append('Offline privacy policy opens and Android16 back closes it without leaving the app')
    choose('나의 루틴')
    assert visible('현재 설정') and visible('새 루틴')
    screenshot('routine-editor-android16.png', False)
    tap('새 루틴','planNew')
    tap('단계 추가',partial=True)
    tap('추가할 연습','planAddMode')
    screenshot('routine-add-picker-android16.png',False)
    for attempt in range(6):
        document=tree()
        try:
            settings_rect('호흡·워밍업',document=document)
            break
        except AssertionError:
            adb('shell','input','swipe','540','1450','540','650','350')
            time.sleep(.3)
    tap('호흡·워밍업',partial=True)
    tap('추가','planAdd')
    wait_visible('들이쉬기 직접 입력')
    wait_visible('내쉬기 직접 입력')
    assert not visible('수정할 항목')
    document=tree()
    assert not any(n.attrib.get('resource-id','').endswith(('planPrev','planNext')) for n in document.iter('node'))
    screenshot('routine-step-single-page-android16.png',False)
    tap('허밍 늘리기')
    assert not visible('1단계 삭제')
    tap('적용 완료','planRun')
    wait_visible('루틴 구성')
    wait_visible('1단계 삭제')
    screenshot('routine-outline-actions-android16.png',False)
    tap('1. 호흡·워밍업',partial=True)
    wait_visible('허밍 직접 입력')
    adb('shell', 'input', 'keyevent', '4')
    wait_visible('루틴 구성')
    adb('shell', 'input', 'keyevent', '4')
    wait_visible('현재 설정')
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(.5)
    assert not visible('새 루틴')
    checks.append('Routine outline owns step management; warmup editor has no step management and Apply returns to the outline; reopening retains changed settings; closing discards the unsaved new routine')
    choose('음정 연습')
    screenshot('02-practice-portrait.png')
    tap('연습 설정', 'customTimingOpen')
    wait_visible('현재 설정')
    screenshot('settings-summary-android16.png', False)
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.5')
    time.sleep(1)
    # font_scale recreates the Activity. Start a fresh Activity at the selected
    # scale rather than using a partially rebuilt accessibility tree.
    start()
    choose('음정 연습')
    tap('연습 설정', 'customTimingOpen')
    wait_visible('현재 설정')
    tap('수정', 'planSave')
    wait_visible('연습 종류')
    choose_vowel_settings()
    assert_settings_readable()
    screenshot('settings-font150-android16.png', False)
    adb('shell', 'wm', 'user-rotation', 'lock', '1')
    time.sleep(1)
    wait_visible('연습 종류')
    assert_settings_readable(landscape=True)
    screenshot('settings-landscape-font150-android16.png', False)
    scroll_settings_to('한 음 길이 직접 입력')
    wait_visible('한 음 길이 직접 입력')
    ime=adb('shell','dumpsys','input_method')
    assert not re.search(r'\bmInputShown=true\b',ime)
    screenshot('settings-stepper-font150-android16.png', False)
    adb('shell','wm','user-rotation','lock','0')
    time.sleep(.6)
    scroll_settings_to('한 음 길이 직접 입력')
    tap('한 음 길이 직접 입력')
    time.sleep(.8)
    edit=None
    focus_deadline=time.monotonic()+30
    while time.monotonic()<focus_deadline:
        try:
            document=tree()
            edit=next((n for n in document.iter('node') if n.attrib.get('class')=='android.widget.EditText' and n.attrib.get('focused')=='true'),None)
            if edit is not None:break
        except HierarchyUnavailable:
            pass
        time.sleep(.4)
    assert edit is not None,'Direct numeric input did not focus an EditText'
    rect=[int(v) for v in re.findall(r'\d+',edit.attrib['bounds'])]
    confirm=settings_rect('변경 확인','planRun',document)
    close=settings_rect('연습 설정 닫기','planClose',document)
    assert rect[1]>=close[3] and rect[3]<=confirm[1],(rect,close,confirm)
    screenshot('settings-keyboard-font150-android16.png',False)
    adb('shell','input','keyevent','123')
    for _ in range(8):adb('shell','input','keyevent','67')
    adb('shell','input','text','0.5')
    adb('shell','input','keyevent','66')
    time.sleep(.5)
    tap('변경 확인', 'planRun')
    wait_visible('저장할까요?')
    wait_visible('최종 저장')
    screenshot('settings-review-font150-android16.png', False)
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(.5)
    wait_visible('한 음 길이 직접 입력')
    tap('변경 확인', 'planRun')
    wait_visible('최종 저장')
    tap('최종 저장', 'planRun')
    wait_visible('저장 완료')
    screenshot('settings-saved-font150-android16.png', False)
    tap('연습 설정 닫기', 'planClose')
    adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
    time.sleep(1)
    assert adb('shell', 'pidof', package).strip()
    choose('음정 연습')
    tap('연습 설정', 'customTimingOpen')
    wait_visible('현재 설정')
    wait_visible('아에이오우 · 5음 음계 왕복')
    wait_visible('0.5초/음')
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(.5)
    checks.append('Translucent inset settings popup: 150% portrait/landscape controls above actions, all fields in one page and default stepper without keyboard, optional numeric IME geometry, review/back/final save and reopened 0.5-second vowel settings')
    choose('발성 강약 조절')
    screenshot('03-dynamics-portrait.png')
    choose('호흡·워밍업')
    tap('훈련 시작', 'mainButton')
    time.sleep(2.2)
    assert visible('훈련 중단')
    screenshot('04-warmup-portrait.png')
    checks.append('Guided warmup starts without microphone permission')
    start()
    choose('음정 연습')
    # Ask WindowManager to rotate the device; setting a preference alone did
    # not rotate this API36 image. Wait for the actual app layout before capture.
    adb('shell', 'wm', 'user-rotation', 'lock', '1')
    wait_visible('그래프 숨기기', timeout=30)
    screenshot('05-practice-landscape.png')
    assert visible('그래프 숨기기')
    tap('그래프 숨기기', 'graphToggle')
    assert visible('그래프 보기')
    tap('그래프 보기', 'graphToggle')
    checks.append('Landscape layout and graph toggle work on Android16')
    adb('shell', 'wm', 'user-rotation', 'lock', '0')
    time.sleep(1)
    verify_ci_update_name()
    checks.append('Exact distributed CI APK updates Local75 to Local76 without uninstall; Android app-info label is VoiceLine and private test data remains')
    result={'status':'passed','environment':'Android 16 API36 x86_64 emulator; production build signed only with CI test key for runtime review','package':package,'checks':checks,'physical_s24_ultra':'not tested','store_screenshots':'unaltered app UI captured from this Android emulator'}
    (qa / 'ANDROID16_SMOKE.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
except Exception:
    screenshot('failure.png', False)
    (qa / 'logcat.txt').write_text(adb('logcat','-d','-t','1500'))
    web_errors = adb('logcat', '-d', '-s', 'VoiceLineWeb:W', 'AndroidRuntime:E')
    (qa / 'web-errors.txt').write_text(web_errors)
    (qa / 'webview-provider.txt').write_text(adb('shell', 'dumpsys', 'webviewupdate'))
    (qa / 'window-displays.txt').write_text(adb('shell', 'dumpsys', 'window', 'displays'))
    print(web_errors)
    raise
finally:
    if console_process:
        console_process.terminate()
        console_process.wait(timeout=5)
    console_file.close()
    if (qa / 'web-console-live.txt').stat().st_size:
        print((qa / 'web-console-live.txt').read_text())
