"""Verify resolved native license coverage in source assets and built packages."""
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
web = root / 'android-local44/app/src/main/assets/www'
files = ['THIRD-PARTY-NOTICES.txt', 'third-party-notices.js', 'THIRD-PARTY-COMPONENTS.json']


def verify(read):
    text = read(files[0]).decode('utf-8')
    js = read(files[1]).decode('utf-8')
    inventory = json.loads(read(files[2]))
    assert inventory['schemaVersion'] == 1
    assert set(inventory['configurations']) == {'ciDebugRuntimeClasspath', 'releaseRuntimeClasspath'}
    components = inventory['components']
    coordinates = {entry['coordinate'] for entry in components}
    assert len(coordinates) == len(components) and len(components) >= 10
    assert {'androidx.core:core:1.15.0', 'androidx.webkit:webkit:1.12.1'} <= coordinates
    assert any(c.startswith('org.jetbrains.kotlin:kotlin-stdlib:') for c in coordinates)
    assert any(c.startswith('org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:') for c in coordinates)
    for component in components:
        assert component['coordinate'] in text and component['coordinate'] in js
        assert component['pom'].startswith('https://')
        assert len(component['artifactSha256']) == len(component['pomSha256']) == 64
        assert component['licenses']
        assert all('apache' in license['name'].lower() and '2.0' in license['name'] for license in component['licenses'])
        assert set(component['configurations']) <= set(inventory['configurations'])
    for phrase in ['Apache License', 'END OF TERMS AND CONDITIONS',
                   'Permission is hereby granted', 'Alexander Holm', 'CC BY 3.0',
                   'https://creativecommons.org/licenses/by/3.0/']:
        assert phrase in text and phrase in js, phrase
    return len(components)


count = verify(lambda name: (web / name).read_bytes())
for filename in sys.argv[1:]:
    path = Path(filename)
    prefix = 'base/assets/www/' if path.suffix == '.aab' else 'assets/www/'
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert verify(lambda name: archive.read(prefix + name)) == count
        for name in files:
            assert archive.read(prefix + name) == (web / name).read_bytes(), name
    print('Verified runtime licenses in', path.name)
print('Verified complete license coverage for', count, 'resolved Android components')
