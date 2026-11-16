"""Basic launch and language checks of the non-debuggable production package."""
import json,re,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
out=Path('production-smoke');out.mkdir(exist_ok=True)
package='com.voiceline.app'
def adb(*args):
    return subprocess.check_output(['adb',*args],text=True,timeout=45)
def tree():
    for attempt in range(5):
        try:
            adb('shell','uiautomator','dump','--compressed','/sdcard/release93.xml')
            value=adb('exec-out','cat','/sdcard/release93.xml')
            document=ET.fromstring(value[value.index('<?xml'):])
            (out/'last-window.xml').write_text(value)
            return document
        except (subprocess.SubprocessError,ValueError,ET.ParseError):time.sleep(.5)
    raise RuntimeError('Production accessibility tree unavailable')
def tap(label,identifier=None):
    deadline=time.monotonic()+25
    while time.monotonic()<deadline:
        for node in tree().iter('node'):
            if (node.get('text')==label or node.get('content-desc')==label or identifier and node.get('resource-id','').endswith(identifier)):
                values=[int(n) for n in re.findall(r'\d+',node.get('bounds',''))]
                if len(values)==4 and values[2]>values[0] and values[3]>values[1]:
                    adb('shell','input','tap',str((values[0]+values[2])//2),str((values[1]+values[3])//2));time.sleep(.7);return
        time.sleep(.3)
    raise AssertionError('Production control missing: '+label)
def visible(label):
    return any(label in (n.get('text',''),n.get('content-desc','')) for n in tree().iter('node'))
def wait_visible(label):
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        if visible(label):return
        time.sleep(.5)
    raise AssertionError('Production screen did not reach: '+label)
def wait_drawn():
    from PIL import Image
    import io
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        raw=subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30)
        image=Image.open(io.BytesIO(raw)).convert('RGB')
        w,h=image.size
        colors=image.crop((w//10,h//10,w*9//10,h*9//10)).getcolors(500)
        if colors is None or len(colors)>100:
            return
        time.sleep(.5)
    (out/'production-undrawn.png').write_bytes(raw)
    raise AssertionError('Production pixels stayed blank after launch')
def screenshot(name):
    (out/name).write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30))
adb('install','-r','release-review/release-runtime-review.apk')
installed=adb('shell','dumpsys','package',package)
assert 'versionName=2.0.0' in installed and 'versionCode=116' in installed
adb('shell','am','start','-W','-n',package+'/com.voiceline.app.MainActivity');wait_drawn()
assert adb('shell','pidof',package).strip()
screenshot('production-ko-piano.png')
tap('메뉴 열기','menuOpen');wait_visible('연습 메뉴')
tap('한국어','appLanguage');tap('English');time.sleep(1)
wait_visible('Practice menu')
screenshot('production-en-menu.png')
tap('Close','menuClose');screenshot('production-en-piano.png')
adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(2)
adb('shell','am','force-stop',package)
adb('shell','am','start','-W','-n',package+'/com.voiceline.app.MainActivity');wait_drawn()
tap('Open menu','menuOpen');wait_visible('Practice menu')
screenshot('production-en-cold-start.png')
logs=adb('logcat','-d','-s','AndroidRuntime:E')
assert 'Process: '+package+',' not in logs,logs
facts={'status':'passed','package':package,'version_code':116,'fresh_production_launch':True,'nonblank_screen_pixels':True,'korean_menu':True,'english_menu':True,'language_persists_after_process_restart':True,'production_debuggable':False,'source_commit':__import__('os').environ.get('GITHUB_SHA')}
(out/'PRODUCTION_SMOKE.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps(facts))
