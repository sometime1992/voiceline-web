import hashlib
import json
import struct
from pathlib import Path

root=Path(__file__).resolve().parent.parent
media=root/'store-media'
expected={'feature-graphic-1024x500.png':(1024,500),'icon-512.png':(512,512),
          '01-piano-portrait.png':(1080,1920),'02-practice-portrait.png':(1080,1920),
          '03-dynamics-portrait.png':(1080,1920),'04-warmup-portrait.png':(1080,1920),
          '05-practice-landscape.png':(1920,1080)}
facts=[]
for name,dimensions in expected.items():
    data=(media/name).read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
    width,height=struct.unpack('>II',data[16:24]);assert (width,height)==dimensions,(name,width,height)
    assert data[24]==8
    if name=='icon-512.png':assert data[25]==6 and len(data)<=1024*1024
    facts.append({'name':name,'width':width,'height':height,'pngColorType':data[25],
                  'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
listing=json.loads((root/'store-kit/listing-ko.json').read_text())
assert listing['title']=='VoiceLine'
assert len(listing['title'])<=30 and len(listing['shortDescription'])<=80 and len(listing['fullDescription'])<=4000
(media/'VERIFIED_MEDIA.json').write_text(json.dumps(facts,indent=2)+'\n')
print('Verified store icon, feature graphic and 5 Android16 emulator screenshots.')
