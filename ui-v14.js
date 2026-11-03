'use strict';
// Minimal one-tap start: keeps the measurement engine and stored records unchanged.
(()=>{
 const el=id=>document.getElementById(id);
 const quickStart=el('quickStart');
 const label=el('quickStartLabel');
 const pattern=el('quickPattern');
 const vibrato=el('quickVibrato');
 const pathJump=el('settingsShortcut');
 let busy=false;
 function fillCopy(source,target){
   for(const item of source.options){const option=document.createElement('option');option.value=item.value;option.textContent=item.textContent;target.append(option);}
   target.value=source.value;
 }
 fillCopy(el('patternSelect'),pattern);fillCopy(el('vibratoMode'),vibrato);
 pattern.addEventListener('change',()=>{el('patternSelect').value=pattern.value;el('patternSelect').dispatchEvent(new Event('change',{bubbles:true}));});
 vibrato.addEventListener('change',()=>{el('vibratoMode').value=vibrato.value;el('vibratoMode').dispatchEvent(new Event('change',{bubbles:true}));});
 el('patternSelect').addEventListener('change',()=>{pattern.value=el('patternSelect').value;});
 el('vibratoMode').addEventListener('change',()=>{vibrato.value=el('vibratoMode').value;});
 function sync(){
   const mode=state.mode;
   document.body.dataset.mode=mode;
   el('quickControls').hidden=mode!=='practice' && mode!=='vibrato';
   el('quickPatternWrap').hidden=mode!=='practice';
   el('quickVibratoWrap').hidden=mode!=='vibrato';
   const running=state.running;
   let title='마이크 켜기';
   if(mode==='breath')title=el('breathStart').textContent;
   else if(mode==='free'||mode==='range')title=running?'마이크 끄기':'마이크 켜기';
   else if(mode==='practice')title=state.exercise&&!state.exercise.done?'연습 중단':running?'음정 연습 시작':'마이크 켜고 연습';
   else if(mode==='vibrato')title=el('vibratoButton').textContent.includes('중단')?'비브라토 중단':running?'비브라토 시작':'마이크 켜고 연습';
   if(label.textContent!==title)label.textContent=title;
   quickStart.disabled=busy;
   quickStart.setAttribute('aria-label',title);
 }
 // React to changes made by the existing start / pause / stop buttons.
 for(const id of ['startText','practiceButton','vibratoButton','breathStart']){
   const observed=el(id);if(!observed)continue;
   new MutationObserver(sync).observe(observed,{childList:true,subtree:true,characterData:true});
 }
 document.querySelectorAll('.mode-tab').forEach(button=>button.addEventListener('click',sync));
 quickStart.addEventListener('click',async()=>{
   if(busy)return;
   busy=true;sync();
   try{
     const mode=state.mode;
     if(mode==='breath'){el('breathStart').click();document.getElementById('modeSettings').scrollIntoView({block:'start',behavior:'smooth'});return;}
     if(mode==='free'||mode==='range'){
       if(state.running)stopMicrophone();else await startMicrophone();
       return;
     }
     if(!state.running){await startMicrophone();if(!state.running)return;}
     if(mode==='practice')startPractice();
     else if(mode==='vibrato')el('vibratoButton').click();
     document.querySelector('.live-card').scrollIntoView({block:'start',behavior:'smooth'});
   }catch(e){setNotice('연습 시작 중 오류가 발생했습니다. 아래 앱 상태 확인에서 오류를 확인해 주세요.');window.VoiceLineDiagnostics?.setError?.(String(e));}
   finally{busy=false;sync();}
 });
 // Explain in accessible Korean without duplicating the long manual.
 const summary={
  free:['소리를 내면 음정이 표시돼요','버튼을 누르고 편안하게 한 음을 불러보세요.'],
  practice:['목표 음정과 내 선을 맞춰요','패턴을 고른 뒤 시작하면 3초 후 연습이 진행돼요.'],
  vibrato:['한 음을 길게 유지해요','목소리의 움직임이 얼마나 규칙적인지 확인해요.'],
  breath:['원하는 호흡 시간을 설정해요','아래에서 들숨·날숨 시간을 바꾸고 시작하세요.'],
  range:['편안한 음역을 찾아요','낮은 음과 높은 음을 무리하지 않고 유지해 보세요.']
 };
 function updateHelp(mode){const s=summary[mode]||summary.free;el('quickPathTitle').textContent=s[0];el('quickPathCaption').textContent=s[1];pathJump.textContent=mode==='breath'?'호흡 시간 바꾸기':mode==='free'?'사용법 보기':'상세 설정 바꾸기';pathJump.hidden=false;pathJump.href=mode==='free'?'#userGuide':'#modeSettings';sync();}
 document.querySelectorAll('.mode-tab[data-mode]').forEach(b=>b.addEventListener('click',()=>updateHelp(b.dataset.mode)));
 updateHelp(state.mode);
})();
