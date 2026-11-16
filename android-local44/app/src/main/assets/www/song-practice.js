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


  const dialog=$song('songGraphOverlay');
  const audio=$song('songPlayer');
  const canvas=$song('songCanvas');
  if(!dialog||!audio||!canvas)return;
  const ctx=canvas.getContext('2d');
  const bridge=()=>window.VoiceLineSongBridge;
  const native=()=>window.VoiceLineSongPlayer;
  const settings=$song('songSettingsDialog');
  const statusBadge=$song('songSourceBadge');
  const startButton=$song('songStart');
  const playButton=$song('songPlayPause');
  const seekInput=$song('songSeek');
  const timeLabel=$song('songTime');
  const stage=$song('songEmptyStage');
  const heading=$song('songGraphHeading');
  const lang=()=>window.VoiceLineI18n?.language==='en'?'en':'ko';
  const tx=(ko,en)=>lang()==='en'?en:ko;
  const clock=secs=>seconds(secs*1000);
  let ownedMic=false,active=false,playing=false,current=0,stamp=0;
  let controls=null,lastClock=0,lastDrawing=0,lastMeasured=0,lastPlaying=false,dragging=false,sourceFile=null;
  function playPos(){
    if(native())return Math.max(0,current+(playing?(performance.now()-stamp)/1000:0));
    return audio.currentTime||0;
  }
  function pause(){
    if(native())native().pause();else audio.pause();
    playing=false;refreshButtons();
  }
  function seek(sec){
    sec=Math.max(0,Number(sec)||0);
    if(native())native().seek(Math.round(sec*1000));else audio.currentTime=sec;
    current=sec;stamp=performance.now();song.points=[];song.lastCapture=0;
  }
  async function play(){
    if(!song.file)return false;
    if(native()){
      if(!native().isReady()){say(tx('선택한 음원을 준비하는 중입니다. 다시 눌러 주세요.','Preparing audio. Tap Play again.'));return false;}
      if(!native().play()){say(tx('재생할 수 없습니다. 오디오 설정을 확인하세요.','Cannot play the selected audio.')+' '+native().error());return false;}
      playing=true;stamp=performance.now();refreshButtons();return true;
    }
    try{await audio.play();playing=true;refreshButtons();return true;}
    catch(_){say(tx('재생 버튼을 다시 눌러주세요.','Tap play again.'));return false;}
  }
  function stopPractice(){
    pause();
    if(ownedMic&&bridge()?.isMicOn())bridge().stopMic();
    ownedMic=false;song.points=[];refreshButtons();
  }
  function leave(){
    stopPractice();active=false;dialog.hidden=true;
    if(!settings.hidden)settings.hidden=true;
    // End the session: revoke sources and clear extracted pitches from RAM.
    song.token++;song.analysing=false;song.reference=[];song.points=[];
    song.duration=0;song.file=null;song.stem=null;song.mr=null;
    song.loopStart=null;song.loopEnd=null;song.loopEnabled=false;
    originalInput.value='';vocalInput.value='';mrInput.value='';
    $song('songLoopEnabled').checked=false;
    audio.pause();audio.removeAttribute('src');audio.load();
    if(song.url){URL.revokeObjectURL(song.url);song.url=null;}
    native()?.clearSession?.();
    progress.value=0;analyseButton.disabled=true;
    resetScore();refreshPickers();
  }
  function refreshBadge(){
    statusBadge.textContent=song.stem?tx('분리 보컬 기준','Isolated vocal'):
      song.file?tx('혼합 원곡 추정 · 정확도 채점 없음','Mixed song · no score'):tx('원곡 선택 전','No song');
    statusBadge.dataset.source=song.stem?'vocal':'mixed';
    stage.hidden=Boolean(song.reference.length&&song.reference.some(p=>p.midi!==null));
    heading.textContent=!song.file?tx('① 원곡 선택 → ② 분석 → ③ 노래 시작','① Select song → ② Analyze → ③ Sing'):
      song.reference.length?tx('③ 이어폰 착용 → 마이크+노래 시작','③ Headphones → Start singing'):
      tx('② 피치 분석 → ③ 노래 시작','② Analyze → ③ Sing');
  }
  function refreshButtons(){
    const micOn=Boolean(bridge()?.isMicOn());
    $song('songMic').textContent=micOn?tx('마이크 끄기','Mic off'):tx('마이크 켜기','Mic on');
    startButton.disabled=!song.file||!song.reference.length||song.analysing;
    startButton.textContent=playing&&micOn?tx('■ 노래 연습 중지','■ Stop practice'):tx('③ 마이크+노래 시작','③ Mic + Start singing');
    playButton.disabled=!song.file;
    playButton.textContent=playing?tx('Ⅱ 일시정지','Ⅱ Pause'):tx('▶ 재생','▶ Play');
    const main=$song('mainButton');
    if(main&&active)main.textContent=playing&&micOn?tx('연습 중지','Stop practice'):tx('마이크+노래 시작','Start singing');
  }
  function mountControls(container){
    controls=container;
    container.innerHTML='<button type="button" id="songChooseOriginal">'+tx('① 원곡 선택','① Select audio')+'</button>'+
      '<strong id="songTrackName" class="song-track-name">선택된 원곡 없음</strong>'+
      '<button type="button" id="songAnalyzeTop">'+tx('② 피치 분석','② Analyze pitch')+'</button>'+
      '<progress id="songProgressTop" max="100" value="0" aria-label="분석 진행률"></progress>'+
      '<span class="song-rights-note">'+tx('권리 확인 음원만 · 피치는 종료 시 폐기','Authorized audio only · notes discarded on exit')+'</span>';
    $song('songChooseOriginal').addEventListener('click',()=>originalInput.click());
    $song('songAnalyzeTop').addEventListener('click',()=>analyseButton.click());
    $song('songTrackName').textContent=song.file?song.file.name:tx('선택된 원곡 없음','No song selected');
    $song('songAnalyzeTop').disabled=!song.file;
    $song('songProgressTop').value=progress.value;
    refreshBadge();refreshButtons();
  }
  function closeIfOpen(){
    if(!active)return false;
    leave();void bridge()?.switchMode('piano');return true;
  }
  async function enter(){
    $song('menuClose').click();
    await bridge()?.switchMode('song');
    if(!song.file){
      say(tx('① 상단 원곡 선택 → ② 피치 분석 → ③ 마이크+노래 시작.','① Choose song → ② Analyze → ③ Start singing.'));
      try{
        if(sessionStorage.getItem('voiceline-song-help')!=='1'){
          sessionStorage.setItem('voiceline-song-help','1');bridge()?.help();
        }
      }catch(_){bridge()?.help();}
    }
  }
  function onModeChange(mode){active=mode==='song';dialog.hidden=!active;if(active){refreshBadge();refreshButtons();draw();}else leave();}
  window.VoiceLineSongPractice={mountControls,closeIfOpen,onModeChange,leave,
    togglePractice:async()=>{
      if(playing&&bridge()?.isMicOn()){stopPractice();return;}
      if(!song.file||!song.reference.length){say(tx('먼저 원곡을 선택하고 분석하세요.','Choose and analyze a song first.'));return;}
      const mic=bridge()?.isMicOn()||await bridge()?.startMic();
      if(!mic){say(tx('마이크 연결에 실패했습니다. 권한을 확인하세요.','Microphone failed. Check permission.'));return;}
      ownedMic=true;
      if(await play())say(song.stem?tx('분리 보컬 기준선에 맞춰 따라 부르세요.','Sing along to the vocal reference.'):
       tx('혼합 원곡의 음정은 보컬 정확도 기준이 아닙니다.','Mixed-song pitch is not a reliable vocal reference.'));
      refreshButtons();
    }
  };
  $song('songOpen').addEventListener('click',enter);
  $song('songHelpOpen').addEventListener('click',()=>bridge()?.help());
  $song('songSettingsOpen').addEventListener('click',()=>{settings.hidden=false;$song('songSettingsClose').focus();});
  $song('songSettingsClose').addEventListener('click',()=>{settings.hidden=true;$song('songSettingsOpen').focus();});
  settings.addEventListener('click',e=>{if(e.target===settings)settings.hidden=true;});
  $song('songYoutube').addEventListener('click',e=>{
    if(window.VoiceLinePublicLinks?.openYouTubeChannel){e.preventDefault();window.VoiceLinePublicLinks.openYouTubeChannel();}
  });
  const songTranslations={
    ko:{songTitle:'원곡 따라 부르기',songSubtitle:'건반 위 그래프를 보며 따라 부르기',
      youtubeSubtitle:'유튜브 채널 바로가기',settingsTitle:'곡 설정 · 구간 반복',
      settingsIntro:'분리 보컬 또는 MR을 선택하고 구간을 반복합니다.',
      vocalFileTitle:'분리된 보컬 파일 (선택)',mrFileTitle:'MR 파일 (선택 · 보컬 없는 반주)',
      mrClear:'MR 선택 해제',transposition:'기준 그래프 이동 (반음)',offset:'동기화 보정 (ms)',
      loopStart:'반복 시작',loopEnd:'반복 끝',loopEnable:'구간 반복',reset:'연습 초기화',
      helpButton:'ⓘ 사용법',settingsButton:'⚙ 설정·반복',
      referenceLegend:'━ 민트: 분리 보컬 기준 (회색: 혼합음 추정)',micLegend:'━ 보라: 내 목소리',
      target:'기준 음정',actual:'내 음정',difference:'음정 차이',match:'참고 일치율',
      warning:'혼합 원곡은 정확한 보컬 피치를 제공하지 못합니다. AI 보컬 분리와 MR 자동 생성은 포함되지 않습니다. 권리가 확인된 로컬 음원만 사용하세요. 추출된 피치는 이 연습을 종료하면 폐기합니다.'},
    en:{songTitle:'Sing with a Song',songSubtitle:'Compare pitch over the piano',
      youtubeSubtitle:'Open YouTube channel',settingsTitle:'Song settings · Loops',
      settingsIntro:'Select isolated vocals or MR; set the loop.',
      vocalFileTitle:'Isolated vocal (optional)',mrFileTitle:'Instrumental MR (optional)',
      mrClear:'Remove MR',transposition:'Shift reference (semitones)',offset:'Sync offset (ms)',
      loopStart:'Loop start',loopEnd:'Loop end',loopEnable:'Loop',reset:'Reset',
      helpButton:'ⓘ Guide',settingsButton:'⚙ Settings',
      referenceLegend:'━ Mint: isolated vocal (grey: mixed estimate)',micLegend:'━ Purple: my voice',
      target:'Reference',actual:'My pitch',difference:'Pitch difference',match:'Approx. match',
      warning:'Mixed songs do not reliably reveal vocal pitch. AI vocal separation and automatic MR generation are not included. Use authorized local files only. Extracted pitch is discarded when you exit song practice.'}
  };
  function updateLanguage(){
    const words=songTranslations[window.VoiceLineI18n?.language==='en'?'en':'ko'];
    document.querySelectorAll('[data-song-text]').forEach(el=>{if(words[el.dataset.songText])el.textContent=words[el.dataset.songText];});
    refreshBadge();refreshButtons();
  }
  window.addEventListener('voiceline-language-change',updateLanguage);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateLanguage,{once:true});else queueMicrotask(updateLanguage);
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
  // Privacy-first: never persist reconstructed song melodies or voice reference notes.
  // Best-effort migration of caches written by Local87/Local88, without touching
  // the distinct VoiceLine recordings/history database.
  try { if ('indexedDB' in window) indexedDB.deleteDatabase('voiceline-song-references'); }
  catch (_) { /* Storage may be unavailable; no new persistent data is created. */ }
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
  const mrInput=$song('songMR'),mrName=$song('songMRName');
  song.mr=null;
  function updateFallbackAudio(){
    if(song.url){URL.revokeObjectURL(song.url);song.url=null;}
    audio.pause();audio.removeAttribute('src');
    const file=song.mr||song.file;
    if(file){song.url=URL.createObjectURL(file);audio.src=song.url;}
    audio.load();
  }
  function refreshPickers(){
    originalName.textContent=song.file?song.file.name:tx('원곡 없음','No song');
    vocalName.textContent=song.stem?song.stem.name:tx('분리 보컬 없음','No isolated vocal');
    mrName.textContent=song.mr?song.mr.name:tx('MR 없음 · 원곡이 재생됩니다','No MR · plays original');
    if(controls){
      $song('songTrackName').textContent=song.file?song.file.name:tx('선택된 원곡 없음','No song selected');
      $song('songAnalyzeTop').disabled=!song.file;
      $song('songProgressTop').value=progress.value;
    }
    refreshBadge();refreshButtons();
  }
  async function filesChanged(){
    const oldFile=song.file;
    const fresh=originalInput.files?.[0]||null;
    if(!fresh||fresh.size>100*1024*1024){say(tx('100MB 이하 원곡을 선택하세요.','Select a song under 100 MB.'));return;}
    stopPractice();
    song.file=fresh;song.stem=null;song.mr=null;vocalInput.value='';mrInput.value='';
    updateFallbackAudio();resetReference();current=0;playing=false;
    await refreshAfterSelection();
  }
  async function vocalChanged(){
    if(!song.file){say(tx('원곡을 먼저 선택하세요.','Choose original first.'));return;}
    song.stem=vocalInput.files?.[0]||null;
    resetReference();await refreshAfterSelection();
  }
  async function refreshAfterSelection(){
    refreshPickers();
    if(!song.file)return;
    say(tx('② 피치 분석을 누르세요. 음정 데이터는 이번 연습 중에만 보관됩니다.','② Analyze pitch. Notes are kept only during this practice session.'));
  }
  originalInput.addEventListener('click',()=>native()?.selectRole('original'));
  vocalInput.addEventListener('click',()=>native()?.selectRole('vocal'));
  mrInput.addEventListener('click',()=>native()?.selectRole('mr'));
  originalInput.addEventListener('change',filesChanged);
  vocalInput.addEventListener('change',vocalChanged);
  mrInput.addEventListener('change',()=>{
    const file=mrInput.files?.[0];if(!file||file.size>100*1024*1024)return;
    stopPractice();song.mr=file;updateFallbackAudio();refreshPickers();
    say(tx('선택한 MR을 재생합니다. 정확한 기준 피치는 분리 보컬 파일에서 분석하세요.','Playing selected MR. Use isolated vocals for reference pitch.'));
  });
  $song('songClearMR').addEventListener('click',()=>{
    stopPractice();song.mr=null;mrInput.value='';
    native()?.clearMR();updateFallbackAudio();refreshPickers();
  });
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
      const voicedThreshold=song.stem?0.77:0.93;
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
        // Reference points remain only in JavaScript memory until leaving song mode.
      }
    }catch(e){
      if(token===song.token)say('분석 실패: '+(e&&e.message?e.message:'이 형식의 음원을 읽지 못했습니다.'));
    }finally{
      if(audioContext)audioContext.close().catch(()=>{});
      if(token===song.token){song.analysing=false;analyseButton.disabled=false;}
    }
  }
  analyseButton.addEventListener('click',runAnalysis);
  async function toggleMic(){
    if(bridge()?.isMicOn()){
      if(ownedMic)bridge().stopMic();
      ownedMic=false;say(tx('마이크를 껐습니다. 음악 재생은 유지됩니다.','Microphone off; music continues.'));
    }else{
      const okay=await bridge()?.startMic();ownedMic=Boolean(okay);
      say(okay?tx('마이크를 켰습니다. 음악을 재생하고 따라 부르세요.','Microphone on. Play music to sing along.'):
        tx('마이크 연결 실패. 권한을 확인하세요.','Microphone failed. Check permissions.'));
    }
    refreshButtons();
  }
  micButton.addEventListener('click',toggleMic);
  startButton.addEventListener('click',()=>window.VoiceLineSongPractice.togglePractice());
  playButton.addEventListener('click',async()=>{if(playing)pause();else await play();refreshButtons();});
  seekInput.addEventListener('input',()=>{dragging=true;const total=native()?.duration()/1000||audio.duration||song.duration||0;timeLabel.textContent=clock(total*Number(seekInput.value)/1000)+' / '+clock(total);});
  seekInput.addEventListener('change',()=>{
    const total=native()?.duration()/1000||audio.duration||song.duration||0;
    seek(total*Number(seekInput.value)/1000);dragging=false;
  });
  $song('songLoopA').addEventListener('click',()=>{song.loopStart=playPos();$song('songLoopLabel').textContent=tx('시작 ','Start ')+fmt(song.loopStart);});
  $song('songLoopB').addEventListener('click',()=>{
    if(song.loopStart===null){say(tx('먼저 반복 시작을 지정하세요.','Set loop start first.'));return;}
    if(playPos()<=song.loopStart+.3){say(tx('시작점 이후에서 반복 끝을 지정하세요.','Set the end after the start.'));return;}
    song.loopEnd=playPos();$song('songLoopLabel').textContent=fmt(song.loopStart)+' – '+fmt(song.loopEnd);
  });
  $song('songLoopEnabled').addEventListener('change',e=>{
    song.loopEnabled=e.target.checked;
    if(song.loopEnabled&&(song.loopStart===null||song.loopEnd===null)){
      song.loopEnabled=false;e.target.checked=false;say(tx('먼저 시작과 끝을 지정하세요.','Set loop points first.'));
    }
  });
  $song('songReset').addEventListener('click',()=>{
    stopPractice();seek(0);song.loopStart=song.loopEnd=null;song.loopEnabled=false;
    $song('songLoopEnabled').checked=false;$song('songLoopLabel').textContent=tx('구간 미지정','No loop');
    resetScore();say(tx('연습을 초기화했습니다.','Practice reset.'));
  });
  audio.addEventListener('ended',()=>{playing=false;refreshButtons();});
  function draw(){
    const rect=canvas.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const now=playPos()*1000;
    const left=w<400?50:65,right=12,top=18,bottom=27,pw=w-left-right,ph=h-top-bottom;
    const win=8000,begin=now-win*0.64;
    const x=t=>left+(t-begin)/win*pw;
    const referenceMidis=song.reference.filter(p=>Math.abs(p.t-now)<6000&&p.midi!==null).map(p=>p.midi+Number($song('songTranspose').value||0));
    const actualMidis=song.points.filter(p=>Math.abs(p.t-now)<6000&&p.midi!==null).map(p=>p.midi);
    const notes=referenceMidis.concat(actualMidis);
    const center=notes.length?median(notes):64,span=18,lo=center-span/2,hi=center+span/2;
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
    line(song.reference.map(p=>({t:p.t-offset,midi:p.midi===null?null:p.midi+transpose})),song.stem?'#65F5DF':'#9AAFC6',song.stem?3.5:2.1);
    line(song.points,'#E4A3FF',3.5);
    ctx.strokeStyle='#FFD782';ctx.setLineDash([3,5]);ctx.beginPath();
    ctx.moveTo(x(now),top);ctx.lineTo(x(now),h-bottom);ctx.stroke();ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle='#d7c9e7';ctx.font='12px system-ui';ctx.textAlign='right';
    for(let n=Math.ceil(lo/4)*4;n<=hi;n+=4){const yy=y(n);if(yy>top+10&&yy<h-bottom-8)ctx.fillText(noteLabel(n),left-7,yy+4);}
    ctx.textAlign='center';ctx.fillStyle='#bfb3d2';
    [-8,-4,0,4].forEach(s=>{const xx=x(now+s*1000);if(xx>left+15&&xx<w-right-15)ctx.fillText(s===0?'현재':s+'s',xx,h-7);});
  }
  function animate(now){
    if(active){
      if(native()&&now-lastClock>140){
        current=native().position()/1000;stamp=now;playing=native().isPlaying();lastClock=now;
        const p=$song('songProgressTop');if(p)p.value=progress.value;
        const err=native().error();
        if(err&&song.file&&!playing)say(tx('음원 재생 오류: ','Playback error: ')+err);
      }else if(!native()){
        current=audio.currentTime;playing=!audio.paused;
      }
      const pos=playPos();
      if(song.loopEnabled&&song.loopEnd!==null&&playing&&pos>=song.loopEnd){
        seek(song.loopStart);song.points=[];resetScore();
      }
      const total=native()?.duration()/1000||audio.duration||song.duration||0;
      timeLabel.textContent=clock(pos)+' / '+clock(total);
      if(!dragging)seekInput.value=total>0?String(Math.round(clamp(pos/total,0,1)*1000)):'0';
      if(playing&&bridge()?.isMicOn()&&song.reference.length&&now-lastMeasured>=110){
        lastMeasured=now;
        const actual=bridge()?.currentMidi()??null;
        const milliseconds=pos*1000;
        song.points.push({t:milliseconds,midi:actual});
        if(song.points.length>1200)song.points.shift();
        const target=pitchAt(milliseconds);
        $song('songTarget').textContent=target===null?'—':noteLabel(target);
        $song('songActual').textContent=actual===null?'—':noteLabel(actual);
        $song('songDifference').textContent=target!==null&&actual!==null?Math.round((actual-target)*100)+' ¢':'—';
        if(song.stem&&target!==null&&actual!==null){
          song.comparisons++;if(Math.abs(actual-target)*100<=50)song.hits++;
          $song('songScore').textContent=Math.round(song.hits/song.comparisons*100)+'%';
          result.textContent=tx('분리 보컬 기준 · 참고 일치율 (±50센트)','Isolated vocals · approx. match (±50 cents)');
        }else{
          $song('songScore').textContent=tx('채점 안 함','No score');
          if(!song.stem)result.textContent=tx('혼합 원곡의 음정은 보컬 채점 기준으로 사용할 수 없습니다.','Mixed music cannot be scored as vocal pitch.');
        }
      }
      if(lastPlaying!==playing){lastPlaying=playing;refreshButtons();}
      if(now-lastDrawing>45){draw();lastDrawing=now;}
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.addEventListener('pagehide',()=>{stopPractice();song.token++;song.reference=[];song.points=[];song.file=null;song.stem=null;song.mr=null;if(song.url)URL.revokeObjectURL(song.url);native()?.clearSession?.();});
  refreshBadge();refreshButtons();
  say(tx('① 원곡 선택 → ② 음정 분석 → ③ 마이크+노래 시작','① Select song → ② Analyze pitch → ③ Sing'));
})();
