'use strict';
// Closed-test tester invite: shares the Google Group + Play opt-in links.
// Fill in both links below. While either is empty the invite card stays hidden.
(()=>{
 const INVITE={
   groupUrl:'https://groups.google.com/g/vocalrefit-testers',   // 예: https://groups.google.com/g/vocalrefit-testers
   optInUrl:'https://play.google.com/apps/testing/com.voiceline.app'    // Play Console > 비공개 테스트 > 테스터 탭 > "웹에서 참여" 링크
 };
 const card=document.getElementById('invitePanel');
 const button=document.getElementById('inviteButton');
 const status=document.getElementById('inviteStatus');
 if(!card||!button)return;
 const valid=u=>/^https:\/\/[^\s]+$/.test(u);
 if(!valid(INVITE.groupUrl)||!valid(INVITE.optInUrl)){card.hidden=true;return;}
 card.hidden=false;
 const message=[
   '🎤 VocalRefit 비공개 테스트에 함께해 주세요!',
   '내 목소리 음정을 건반·그래프로 바로 확인하는 보컬 연습 앱이에요.',
   '',
   '참여 방법 (1분)',
   '1) 그룹 가입: '+INVITE.groupUrl,
   '2) 테스트 참여: '+INVITE.optInUrl,
   '3) Play 스토어에서 설치 후 14일 동안 가끔 열어 주세요 🙏',
   '',
   '※ 그룹에 가입한 구글 계정과 폰의 Play 스토어 계정이 같아야 해요.'
 ].join('\n');
 function show(text){status.textContent=text;status.hidden=false;}
 async function copy(){
   try{await navigator.clipboard.writeText(message);show('초대 문구를 복사했어요. 메신저에 붙여 넣어 보내 주세요.');}
   catch(e){show('공유를 열 수 없어요. 아래 문구를 길게 눌러 복사해 주세요.\n\n'+message);}
 }
 button.addEventListener('click',async()=>{
   status.hidden=true;
   // Android app: native share sheet (KakaoTalk, 문자 등).
   if(window.VoiceLineShare&&typeof window.VoiceLineShare.share==='function'){
     try{window.VoiceLineShare.share(message);return;}catch(e){/* fall through */}
   }
   if(navigator.share){
     try{await navigator.share({title:'VocalRefit 테스터 초대',text:message});return;}
     catch(e){if(e&&e.name==='AbortError')return;}
   }
   copy();
 });
})();
