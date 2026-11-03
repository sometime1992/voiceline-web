"""Validate the exact production bundle and prepare a test-signed runtime APK."""
import json
import os
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parent.parent
bundle=root/'android-local44/app/build/outputs/bundle/release/app-release.aab'
jar=Path(os.environ['VOICELINE_BUNDLETOOL_JAR'])
review=root/'release-review'
review.mkdir(exist_ok=True)
command=['java','-jar',str(jar)]
subprocess.run(command+['validate','--bundle='+str(bundle)],check=True)
manifest=subprocess.check_output(command+['dump','manifest','--bundle='+str(bundle)],text=True)
(review/'RELEASE_MANIFEST.xml').write_text(manifest)
doc=ET.fromstring(manifest);a='{http://schemas.android.com/apk/res/android}'
assert doc.attrib['package']=='com.voiceline.app'
assert doc.attrib[a+'versionName']=='2.0.0' and doc.attrib[a+'versionCode']=='90'
sdk=doc.find('uses-sdk');assert sdk.attrib[a+'targetSdkVersion']=='36' and sdk.attrib[a+'minSdkVersion']=='26'
app=doc.find('application');assert app.attrib[a+'label']=='VoiceLine';assert app.attrib.get(a+'debuggable','false')=='false'
permissions=[n.attrib[a+'name'] for n in doc.findall('uses-permission')]
assert 'android.permission.RECORD_AUDIO' in permissions
assert set(permissions)<= {'android.permission.RECORD_AUDIO','com.voiceline.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'}
facts={'package':doc.attrib['package'],'name':'VoiceLine','versionName':'2.0.0','versionCode':90,'targetSdk':36,'minSdk':26,'debuggable':False,'permissions':permissions,'sourceCommit':os.environ['GITHUB_SHA']}
(review/'APP_BUNDLE_INFO.json').write_text(json.dumps(facts,indent=2)+'\n')
apks=review/'release-runtime-review.apks'
subprocess.run(command+['build-apks','--bundle='+str(bundle),'--output='+str(apks),'--mode=universal','--overwrite','--ks='+os.environ['VOICELINE_CI_KEYSTORE'],'--ks-key-alias=androiddebugkey','--ks-pass=pass:android','--key-pass=pass:android'],check=True)
with zipfile.ZipFile(apks) as archive:
    (review/'release-runtime-review.apk').write_bytes(archive.read('universal.apk'))
apks.unlink()
print(json.dumps(facts))
