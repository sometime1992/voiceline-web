'use strict';
// VoiceLine: all analysis stays on the device. Mixed songs yield a rough, not verified, melody.
(() => {
  const $song = id => document.getElementById(id);

  // Standalone local signal analysis; no model downloads or external APIs.
  const seconds = ms => {
    const n=Math.max(0,Math.floor(ms/1000));
    return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  };
  const hzToMidi=hz=>69+12*Math.log2(hz/440);
  const noteLabel=m=>{const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];const n=Math.round(m);return names[((n%12)+12)%12]+(Math.floor(n/12)-1);};
  const median=v=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

function detectPitchYIN(samples, sampleRate) {
  let power=0;
  for (let i=0;i<samples.length;i++) power+=samples[i]*samples[i];
  const rms=Math.sqrt(power/samples.length);
  if (rms < 0.007) return null;
  const minTau=Math.max(2,Math.floor(sampleRate/2100));
  const maxTau=Math.min(Math.floor(sampleRate/65),Math.floor(samples.length/2)-2);
  if(maxTau <= minTau) return null;
  const windowSize=Math.min(1024,samples.length-maxTau-1);
  const diffs=new Float32Array(maxTau+1);
  for(let tau=1;tau<=maxTau;tau++) {
    let sum=0;
    for(let i=0;i<windowSize;i++) {
      const v=samples[i]-samples[i+tau];sum+=v*v;
    }
    diffs[tau]=sum;
  }
  let runningSum=0, bestTau=-1, minNorm=1;
  for(let tau=1;tau<=maxTau;tau++) {
    runningSum+=diffs[tau];
    diffs[tau]=runningSum===0?1:diffs[tau]*tau/runningSum;
    if(tau>=minTau && diffs[tau]<minNorm) { minNorm=diffs[tau];bestTau=tau; }
  }
  let tau=-1;
  const threshold=0.16;
  for(let t=minTau;t<maxTau;t++) {
    if(diffs[t]<threshold) {
      while(t+1<=maxTau && diffs[t+1]<diffs[t]) t++;
      tau=t;break;
    }
  }
  if(tau<0) tau=bestTau;
  if(tau<=1 || tau>=maxTau || diffs[tau]>0.23) return null;
  const left=diffs[tau-1],center=diffs[tau],right=diffs[tau+1];
  const denom=left-2*center+right;
  const shift=Math.abs(denom)>1e-9?clamp(0.5*(left-right)/denom,-1,1):0;
  const hz=sampleRate/(tau+shift);
  if(hz<65 || hz>2100 || !Number.isFinite(hz)) return null;
  return {hz, confidence:1-diffs[tau], rms};
}


  const dialog=$song('songDialog');
  const audio = $song('songPlayer');
  const canvas = $song('songCanvas');
  if (!audio || !canvas) return;
  const ctx = canvas.getContext('2d');
  const bridge=()=>window.VoiceLineSongBridge;
  let ownedMic=false;
  function close(){
    if(dialog.hidden)return false;
    dialog.hidden=true;
    audio.pause();
    if(ownedMic&&bridge()?.isMicOn()){bridge().stopMic();ownedMic=false;}
    $song('songOpen')?.focus();
    return true;
  }
  window.VoiceLineSongPractice={closeIfOpen:close};
  $song('songOpen').addEventListener('click',()=>{
    $song('menuClose').click();
    dialog.hidden=false;
    $song('songClose').focus();
  });
  $song('songClose').addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!dialog.hidden){e.preventDefault();e.stopPropagation();close();}
  });
  $song('songYoutube').addEventListener('click',()=>{
    if(window.VoiceLinePublicLinks?.openYouTubeChannel)window.VoiceLinePublicLinks.openYouTubeChannel();
    else window.open('https://www.youtube.com/@naruvium-studio','_blank','noopener,noreferrer');
  });

  const songTranslations={
    ko:{songTitle:'원곡 따라 부르기',songSubtitle:'내 음악 파일의 음정과 실시간 비교',youtubeTitle:'Naruvium 유튜브',youtubeSubtitle:'Naruvium Studio 채널 보기',
      dialogTitle:'원곡 따라 부르기',dialogIntro:'피아노·녹음·기존 연습은 그대로 유지됩니다. 이 화면에서만 음악 파일을 분석합니다.',
      songFileTitle:'원곡 파일 · 필수',vocalFileTitle:'분리된 보컬 파일 · 선택',analyseButton:'피치 분석 시작',
      transposition:'기준 그래프 이동 (반음)',offset:'동기화 보정 (ms)',loopStart:'반복 시작 지정',
      loopEnd:'반복 끝 지정',loopEnable:'구간 반복',reset:'연습 초기화',
      referenceLegend:'━ 기준 피치 (추정)',micLegend:'━ 내 목소리',target:'기준 음정',
      actual:'내 음정',difference:'음정 차이',match:'참고 일치율',
      warning:'반주가 섞인 원곡에서는 보컬 멜로디를 정확히 추출할 수 없습니다. 보컬 분리 AI는 포함하지 않습니다. 분석 데이터만 이 기기에 저장되고 음원은 업로드하지 않습니다. 이어폰을 권장합니다.'},
    en:{songTitle:'Sing with a Song',songSubtitle:'Compare your pitch with a local audio file',youtubeTitle:'Naruvium YouTube',youtubeSubtitle:'Visit Naruvium Studio',
      dialogTitle:'Sing with a Song',dialogIntro:'The original piano, recording and training screens remain unchanged. Only this panel analyzes local music.',
      songFileTitle:'Song file · required',vocalFileTitle:'Isolated vocal file · optional',analyseButton:'Analyze Pitch',
      transposition:'Shift reference graph (semitones)',offset:'Timing offset (ms)',loopStart:'Set loop start',
      loopEnd:'Set loop end',loopEnable:'Loop section',reset:'Reset practice',
      referenceLegend:'━ Reference pitch (estimated)',micLegend:'━ My voice',target:'Reference',
      actual:'My pitch',difference:'Pitch difference',match:'Approx. match',
      warning:'A mixed original song cannot provide a reliably isolated vocal melody. Vocal separation AI is not included. Only computed pitch data stays on the device; audio files are never uploaded. Use headphones.'}
  };
  function updateLanguage(){
    const lang=window.VoiceLineI18n?.language==='en'?'en':'ko';
    const translated=songTranslations[lang];
    document.querySelectorAll('[data-song-text]').forEach(el=>{
      const value=translated[el.dataset.songText];
      if(value)el.textContent=value;
    });
    $song('songClose').setAttribute('aria-label',lang==='en'?'Close':'닫기');
  }
  window.addEventListener('voiceline-language-change',updateLanguage);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateLanguage,{once:true});
  else updateLanguage();


  const originalInput = $song('songOriginal');
  const vocalInput = $song('songVocal');
  const originalName = $song('songOriginalName');
  const vocalName = $song('songVocalName');
  const status = $song('songStatus');
  const analyseButton = $song('songAnalyse');
  const micButton = $song('songMic');
  const progress = $song('songProgress');
  const result = $song('songResult');
  const song = {
    url:null, file:null, stem:null, reference:[], duration:0, token:0, analysing:false,
    points:[], lastCapture:0, played:false, recorded:false, comparisons:0, hits:0,
    loopStart:null,loopEnd:null,loopEnabled:false, lastFrame:0, lastMicStatus:null
  };
  const say = (message) => {status.textContent=message;};
  const fmt = (s) => seconds(s*1000);
  const signature = file => file ? [file.name,file.size,file.lastModified].join(':') : '-';
  const key = () => 'reference-1:' + signature(song.file) + ':' + signature(song.stem);
  let dbPromise = null;
  function database(){
    if(!('indexedDB' in window))return Promise.resolve(null);
    if(!dbPromise)dbPromise=new Promise(resolve=>{
      try{
        const request=indexedDB.open('voiceline-song-references',1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('analyses'))request.result.createObjectStore('analyses');};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>resolve(null);
        request.onblocked=()=>resolve(null);
      }catch(_){resolve(null);}
    });
    return dbPromise;
  }
  async function readCache(cacheKey){
    const db=await database();if(!db)return null;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction('analyses','readonly');
        const req=tx.objectStore('analyses').get(cacheKey);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>resolve(null);
      }catch(_){resolve(null);}
    });
  }
  async function writeCache(cacheKey,value){
    const db=await database();if(!db)return;
    try{const tx=db.transaction('analyses','readwrite');tx.objectStore('analyses').put(value,cacheKey);}catch(_){}
  }
  function resetScore(){
    song.points=[];song.lastCapture=0;song.comparisons=0;song.hits=0;song.recorded=false;
    $song('songScore').textContent='--';
    $song('songTarget').textContent='--';
    $song('songActual').textContent='--';
    $song('songDifference').textContent='--';
    result.textContent='원곡을 분석하고 마이크를 켜면 음정 비교가 시작됩니다.';
  }
  function resetReference(){
    song.reference=[];song.duration=0;song.token++;song.analysing=false;analyseButton.disabled=!song.file;
    progress.value=0;resetScore();
  }
  async function filesChanged(){
    const token=++song.token;
    if(song.url){URL.revokeObjectURL(song.url);song.url=null;}
    audio.pause();audio.removeAttribute('src');audio.load();
    song.file=originalInput.files&&originalInput.files[0]||null;
    song.stem=vocalInput.files&&vocalInput.files[0]||null;
    originalName.textContent=song.file?song.file.name:'선택된 파일 없음';
    vocalName.textContent=song.stem?song.stem.name:'보컬 파일 미선택 · 원곡에서 추정';
    resetReference();
    const activeToken=song.token;
    if(!song.file){say('기기에 저장된 원곡 파일을 선택하세요.');return;}
    if(song.file.size>100*1024*1024){say('파일이 100MB를 초과합니다. 더 작은 파일을 선택해 주세요.');return;}
    song.url=URL.createObjectURL(song.file);audio.src=song.url;audio.load();
    say('파일을 읽었습니다. 피치 분석을 눌러 기준선을 만드세요.');
    const cached=await readCache(key());
    if(song.token!==activeToken||token>song.token)return;
    if(cached&&Array.isArray(cached.reference)&&cached.reference.length>0){
      song.reference=cached.reference;song.duration=cached.duration||0;
      progress.value=100;
      say((song.stem?'분리된 보컬':'원곡의 혼합 음원')+' 기준 피치 그래프를 이 기기에서 불러왔습니다.');
    }
  }
  originalInput.addEventListener('change',filesChanged);
  vocalInput.addEventListener('change',filesChanged);
  function pitchAt(milliseconds){
    const ref=song.reference;
    if(!ref.length)return null;
    const ms=milliseconds+Number($song('songOffset').value||0);
    if(ms<0||ms>song.duration*1000)return null;
    let l=0,r=ref.length-1;
    while(l<r){const m=(l+r)>>1;if(ref[m].t<ms)l=m+1;else r=m;}
    const a=ref[l],b=l>0?ref[l-1]:a;
    const p=Math.abs(a.t-ms)<Math.abs(b.t-ms)?a:b;
    return Math.abs(p.t-ms)>160||p.midi===null?null:p.midi+Number($song('songTranspose').value||0);
  }
  async function runAnalysis(){
    if(song.analysing||!song.file)return;
    const file=song.stem||song.file;
    if(file.size>100*1024*1024){say('분석할 파일은 100MB 이하로 선택해 주세요.');return;}
    const token=++song.token;
    song.analysing=true;analyseButton.disabled=true;progress.value=0;
    say('파일을 기기에서 디코딩하고 있습니다. 서버에 업로드하지 않습니다.');
    let audioContext=null;
    try{
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      const buffer=await audioContext.decodeAudioData(await file.arrayBuffer());
      if(token!==song.token)return;
      if(buffer.duration>900)throw new Error('15분 이하 파일만 분석할 수 있습니다.');
      const rate=buffer.sampleRate;
      const channels=[buffer.getChannelData(0)];
      if(buffer.numberOfChannels>1)channels.push(buffer.getChannelData(1));
      const desiredRate=11025,windowLength=2048,step=rate/desiredRate;
      const frame=new Float32Array(windowLength);
      const total=Math.max(0,Math.floor((buffer.duration-0.21)/0.12));
      const points=[];
      const voicedThreshold=song.stem?0.77:0.89;
      for(let k=0;k<=total;k++){
        if(token!==song.token)return;
        const time=0.11+k*0.12;
        const origin=(time-0.093)*rate;
        for(let i=0;i<windowLength;i++){
          const pos=origin+i*step,index=Math.max(0,Math.floor(pos)),mix=channels.length;
          const fraction=pos-index;
          let sample=0;
          for(let ch=0;ch<mix;ch++){
            const values=channels[ch];
            const a=values[index]||0,b=values[index+1]||0;
            sample+=a+(b-a)*fraction;
          }
          frame[i]=sample/mix;
        }
        const detected=detectPitchYIN(frame,desiredRate);
        const accepted=detected&&detected.confidence>=voicedThreshold&&detected.hz>=85&&detected.hz<=1050;
        points.push({t:Math.round(time*1000),midi:accepted?Math.round(hzToMidi(detected.hz)*100)/100:null});
        if(k%12===0){
          progress.value=total?Math.round(k/total*100):100;
          say('기기에서 피치를 분석하고 있습니다 · '+progress.value+'%');
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
      // Remove very short spikes in either source. Leave uncertainty as gaps, not invented notes.
      for(let i=1;i<points.length-1;i++){
        const p=points[i],before=points[i-1],after=points[i+1];
        if(p.midi!==null && before.midi!==null && after.midi!==null &&
          Math.abs(p.midi-before.midi)>7 && Math.abs(p.midi-after.midi)>7)p.midi=null;
      }
      if(token!==song.token)return;
      song.reference=points;song.duration=buffer.duration;
      progress.value=100;resetScore();
      const valid=points.filter(p=>p.midi!==null).length;
      if(valid===0)say('안정적으로 검출된 음정이 없습니다. 보컬만 분리한 파일을 사용해 주세요.');
      else{
        say((song.stem?'보컬 기준 분석':'원곡 혼합 음원 추정 분석')+' 완료 · 유효 구간 '+Math.round(valid/points.length*100)+'%. '+(song.stem?'기준 음정을 확인하며 연습하세요.':'반주 음정을 보컬로 잘못 판단할 수 있습니다.'));
        await writeCache(key(),{reference:points,duration:buffer.duration});
      }
    }catch(e){
      if(token===song.token)say('분석 실패: '+(e&&e.message?e.message:'이 형식의 음원을 읽지 못했습니다.'));
    }finally{
      if(audioContext)audioContext.close().catch(()=>{});
      if(token===song.token){song.analysing=false;analyseButton.disabled=false;}
    }
  }
  analyseButton.addEventListener('click',runAnalysis);
  micButton.addEventListener('click',async()=>{
    if(bridge()?.isMicOn()){bridge().stopMic();ownedMic=false;return;}
    const started=await bridge()?.startMic();
    if(started){ownedMic=true;say('마이크가 켜졌습니다. 이어폰을 착용하고 원곡을 재생해 주세요.');}
    else say('마이크를 시작하지 못했습니다. 다른 연습을 중단하고 마이크 권한을 확인하세요.');
  });
  $song('songLoopA').addEventListener('click',()=>{
    song.loopStart=audio.currentTime;say('반복 시작 지점: '+fmt(song.loopStart));
    $song('songLoopLabel').textContent='시작 '+fmt(song.loopStart);
  });
  $song('songLoopB').addEventListener('click',()=>{
    if(song.loopStart===null){say('먼저 반복 시작 지점을 지정하세요.');return;}
    if(audio.currentTime<=song.loopStart+0.2){say('종료 지점은 시작 지점보다 뒤에 있어야 합니다.');return;}
    song.loopEnd=audio.currentTime;
    $song('songLoopLabel').textContent=fmt(song.loopStart)+' ~ '+fmt(song.loopEnd);
    say('반복 구간을 지정했습니다. 반복 사용 버튼을 켜세요.');
  });
  $song('songLoopEnabled').addEventListener('change',e=>{
    song.loopEnabled=e.target.checked;
    if(song.loopEnabled&&(song.loopStart===null||song.loopEnd===null)){
      song.loopEnabled=false;e.target.checked=false;say('시작·종료 지점을 먼저 지정하세요.');
    }
  });
  $song('songReset').addEventListener('click',()=>{
    audio.pause();audio.currentTime=0;song.loopStart=null;song.loopEnd=null;song.loopEnabled=false;
    $song('songLoopEnabled').checked=false;$song('songLoopLabel').textContent='구간 미지정';
    resetScore();say('연습 위치와 비교 기록을 초기화했습니다.');
  });
  audio.addEventListener('seeked',()=>{song.points=[];song.lastCapture=0;});
  audio.addEventListener('play',()=>{
    if(audio.currentTime<0.3)resetScore();
    song.played=true;
  });
  audio.addEventListener('ended',()=>{
    if(!song.recorded&&song.comparisons>=5){
      const percent=Math.round(song.hits/song.comparisons*100);
      result.textContent='연습 완료 · 참고 일치율 '+percent+'%';song.recorded=true;
    }
  });
  function draw(){
    const rect=canvas.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const now=audio.currentTime*1000;
    const left=w<400?50:65,right=12,top=18,bottom=27,pw=w-left-right,ph=h-top-bottom;
    const win=12000,begin=now-win*0.68;
    const x=t=>left+(t-begin)/win*pw;
    const referenceMidis=song.reference.filter(p=>Math.abs(p.t-now)<6000&&p.midi!==null).map(p=>p.midi+Number($song('songTranspose').value||0));
    const actualMidis=song.points.filter(p=>Math.abs(p.t-now)<6000&&p.midi!==null).map(p=>p.midi);
    const notes=referenceMidis.concat(actualMidis);
    const center=notes.length?median(notes):64,span=24,lo=center-span/2,hi=center+span/2;
    const y=m=>top+(hi-m)/(hi-lo)*ph;
    ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
    for(let n=Math.ceil(lo);n<=hi;n+=2){
      ctx.strokeStyle='#514962';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(left,y(n));ctx.lineTo(w-right,y(n));ctx.stroke();
    }
    function line(points,color,width){
      ctx.beginPath();let connected=false,prev=-Infinity;
      points.forEach(p=>{
        if(p.t<begin-150||p.t>begin+win+150)return;
        const m=p.midi;
        if(m===null||p.t-prev>270){connected=false;prev=p.t;return;}
        const px=x(p.t),py=y(m);
        if(!connected){ctx.moveTo(px,py);connected=true;}else ctx.lineTo(px,py);
        prev=p.t;
      });
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    }
    const transpose=Number($song('songTranspose').value||0);
    const offset=Number($song('songOffset').value||0);
    line(song.reference.map(p=>({t:p.t-offset,midi:p.midi===null?null:p.midi+transpose})),'#74e0e2',3);
    line(song.points,'#c198ff',3);
    ctx.strokeStyle='#e5d4ff';ctx.setLineDash([3,5]);ctx.beginPath();
    ctx.moveTo(x(now),top);ctx.lineTo(x(now),h-bottom);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle='#d7c9e7';ctx.font='11px system-ui';ctx.textAlign='right';
    for(let n=Math.ceil(lo/4)*4;n<=hi;n+=4){const yy=y(n);if(yy>top+10&&yy<h-bottom-8)ctx.fillText(noteLabel(n),left-7,yy+4);}
    ctx.textAlign='center';ctx.fillStyle='#bfb3d2';
    [-8,-4,0,4].forEach(s=>{const xx=x(now+s*1000);if(xx>left+15&&xx<w-right-15)ctx.fillText(s===0?'현재':s+'s',xx,h-7);});
  }
  function animate(now){
    if(song.loopEnabled&&song.loopEnd!==null&&!audio.paused&&audio.currentTime>=song.loopEnd){
      audio.currentTime=song.loopStart;song.points=[];resetScore();
    }
    const currentTime=audio.currentTime*1000;
    if(!dialog.hidden&&bridge()?.isMicOn()&&!audio.paused&&song.reference.length&&now-song.lastCapture>=110){
      song.lastCapture=now;
      const actual=bridge()?.currentMidi()??null;
      song.points.push({t:currentTime,midi:actual});
      if(song.points.length>1200)song.points.shift();
      const target=pitchAt(currentTime);
      $song('songTarget').textContent=target===null?'--':noteLabel(target);
      $song('songActual').textContent=actual===null?'--':noteLabel(actual);
      if(target!==null&&actual!==null){
        const difference=Math.round((actual-target)*100);
        $song('songDifference').textContent=(difference>0?'+':'')+difference+' ¢';
        song.comparisons++;if(Math.abs(difference)<=50)song.hits++;
        $song('songScore').textContent=Math.round(song.hits/song.comparisons*100)+'%';
        result.textContent=(song.stem?'분리 보컬 기준':'원곡 추정 기준')+' · ±50센트 이내 음정 일치 비율 (박자·발성 평가 아님)';
      }else $song('songDifference').textContent='--';
    }
    const microphoneOn=Boolean(bridge()?.isMicOn());
    if(song.lastMicStatus!==microphoneOn){
      song.lastMicStatus=microphoneOn;
      micButton.textContent=microphoneOn?'마이크 끄기':'마이크 켜기';
      micButton.setAttribute('aria-pressed',microphoneOn?'true':'false');
    }
    if(!dialog.hidden&&now-song.lastFrame>=45){draw();song.lastFrame=now;}
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.addEventListener('pagehide',()=>{
    audio.pause();if(ownedMic&&bridge()?.isMicOn())bridge().stopMic();song.token++;
    if(song.url)URL.revokeObjectURL(song.url);
  });

  say('원곡을 선택하세요. 모든 피치 분석은 기기에서만 진행됩니다.');
})();