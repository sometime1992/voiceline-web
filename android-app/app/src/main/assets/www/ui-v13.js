'use strict';
/* Interface guidance only: measurements remain in app.js and vibrato-breath.js. */
(()=>{
  const hints={
    free:['내 목소리의 음을 확인해요','① 마이크 켜기 → ② 편안하게 소리 내기 → ③ 선 확인하기',false],
    practice:['목표 음정을 따라 불러요','① 아래에서 패턴 고르기 → ② 마이크 켜기 → ③ 연습 시작',true],
    vibrato:['한 음을 고르게 흔들어 봐요','① 연습 방법 선택 → ② 마이크 켜기 → ③ 비브라토 시작',true],
    breath:['내 호흡에 맞게 시간을 설정해요','① 들숨·날숨 시간 조절 → ② 호흡 훈련 시작 (마이크 불필요)',true],
    range:['편안한 최저음과 최고음을 찾아요','① 마이크 켜기 → ② 낮은 음부터 천천히 → ③ 결과 저장',true]
  };
  const title=document.getElementById('quickPathTitle');
  const caption=document.getElementById('quickPathCaption');
  const jump=document.getElementById('settingsShortcut');
  const live=document.querySelector('.live-card');
  const update=(mode)=>{
    const item=hints[mode]||hints.free;
    document.body.dataset.activeMode=mode;
    title.textContent=item[0];caption.textContent=item[1];jump.hidden=!item[2];
    live.hidden=mode==='breath';
    const chosen=document.querySelector(`.mode-tab[data-mode="${mode}"]`);
    if(chosen&&window.matchMedia('(max-width:600px)').matches){
      // Do not auto-jump on initial load; keep the selected tab comfortably visible.
      chosen.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'});
    }
  };
  document.querySelectorAll('.mode-tab[data-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      update(btn.dataset.mode);
      // A mode change is a deliberate action; keep the mode summary visible.
      if(window.matchMedia('(max-width:600px)').matches){
        document.querySelector('.quick-path')?.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    });
  });
  jump.addEventListener('click',e=>{
    e.preventDefault();
    document.getElementById(jump.getAttribute('href').slice(1))?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  update(document.querySelector('.mode-tab.active')?.dataset.mode||'free');
})();
