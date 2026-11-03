'use strict';
(function(root){
 function formatBytes(value){
  let n=Number.isFinite(Number(value))?Math.max(0,Number(value)):0,unit=0;const units=['B','KB','MB','GB','TB'];
  while(n>=1024&&unit<units.length-1){n/=1024;unit++;}
  return (unit===0?Math.round(n):n>=100?n.toFixed(0):n.toFixed(1))+' '+units[unit];
 }
 function formatTime(seconds){
  const n=Number.isFinite(Number(seconds))?Math.max(0,Number(seconds)):0;
  if(n>0&&n<1)return n.toFixed(2)+'초';
  return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
 }
 const normalized=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
 function matches(record,query){const q=normalized(query);return !q||normalized((record.title||'')+' '+(record.date||'')).includes(q);}
 function filename(record){
  const date=new Date(record.timestamp||Date.now());
  const stamp=Number.isFinite(date.getTime())?date.getFullYear()+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0')+'_'+String(date.getHours()).padStart(2,'0')+String(date.getMinutes()).padStart(2,'0'):'';
  return String(record.title||'목소리 녹음').trim().slice(0,60)+(stamp?'_'+stamp:'');
 }
 function extension(mime){return String(mime).includes('webm')?'webm':String(mime).includes('mp4')?'m4a':String(mime).includes('ogg')?'ogg':String(mime).includes('mpeg')?'mp3':'wav';}
 // At most four extrema/endpoints per horizontal pixel. Nulls break the curve.
 function durationSeconds(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:.001;}
 function preparePitch(track,duration,width){
  const seconds=durationSeconds(duration),columns=Number.isFinite(Number(width))?Math.max(1,Math.min(8192,Math.ceil(Number(width)))):1;
  const bins=Array(columns+1);let low=Infinity,high=-Infinity,lastT=-Infinity;
  for(const p of track){
   if(!Array.isArray(p)||!Number.isFinite(p[0])||p[0]<0||p[0]>seconds*1000){lastT=-Infinity;continue;}
   const t=p[0],column=Math.min(bins.length-1,Math.floor(t/(seconds*1000)*(bins.length-1)));
   let bin=bins[column];if(!bin)bin=bins[column]={first:null,last:null,min:null,max:null,gap:false};
   const midi=p[1];
   if(!Number.isFinite(midi)||midi<0||midi>127){bin.gap=true;lastT=-Infinity;continue;}
   low=Math.min(low,midi);high=Math.max(high,midi);
   if(Number.isFinite(lastT)&&(t-lastT>340||t<lastT))bin.gap=true;
   const point={t,midi,breakBefore:t-lastT>340||t<lastT};lastT=t;
   if(!bin.first)bin.first=point;bin.last=point;
   if(!bin.min||midi<bin.min.midi)bin.min=point;if(!bin.max||midi>bin.max.midi)bin.max=point;
  }
  const points=[];
  for(const bin of bins){if(!bin)continue;
   if(!bin.first){points.push({midi:null});continue;}
   const selected=[...new Set([bin.first,bin.min,bin.max,bin.last])].sort((a,b)=>a.t-b.t);
   for(const point of selected)points.push({...point,breakBefore:point.breakBefore||bin.gap});
   if(bin.gap)points.push({midi:null});
  }
  return {points,low,high,seconds};
 }
 const pitchCache=new WeakMap();
 function drawPitch(canvas,track,duration,position,noteLabel=String){
  const box=canvas.getBoundingClientRect();if(box.width<80||box.height<30)return;
  const dpr=Math.min(root.devicePixelRatio||1,2),w=box.width,h=box.height,seconds=durationSeconds(duration);
  let cached=pitchCache.get(canvas);
  if(!cached||cached.track!==track||cached.count!==track.length||cached.seconds!==seconds||cached.w!==w||cached.h!==h||cached.dpr!==dpr){
   const doc=canvas.ownerDocument||root.document;if(!doc)return;
   const background=doc.createElement('canvas');background.width=Math.round(w*dpr);background.height=Math.round(h*dpr);
   const ctx=background.getContext('2d');if(!ctx)return;
   const left=69,right=w-8,top=9,bottom=h-20,data=preparePitch(track,seconds,right-left);
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#15162b';ctx.fillRect(0,0,w,h);
   const low=data.low-2,high=data.high+2,y=m=>bottom-(m-low)/Math.max(10,high-low)*(bottom-top);
   if(Number.isFinite(low)){
    ctx.font='10px system-ui';ctx.textAlign='right';
    for(let note=Math.ceil(low/12)*12;note<=high;note+=12){
     const v=y(note);ctx.strokeStyle='#8bdecc66';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(left,v);ctx.lineTo(right,v);ctx.stroke();ctx.setLineDash([]);
     ctx.fillStyle='#bdffe5';ctx.fillText(noteLabel(note),left-5,v+3,left-10);
    }
    ctx.beginPath();let previous=null;
    for(const p of data.points){
     if(!Number.isFinite(p.midi)){previous=null;continue;}
     const x=left+Math.min(1,p.t/(seconds*1000))*(right-left),v=y(p.midi);
     if(!previous||p.breakBefore){ctx.moveTo(x,v);ctx.fillStyle='#d6aaff';ctx.fillRect(x,v,1.5,1.5);}else ctx.lineTo(x,v);
     previous=p;
    }
    ctx.strokeStyle='#d6aaff';ctx.lineWidth=2;ctx.stroke();
   }
   ctx.font='10px system-ui';ctx.fillStyle='#c5cede';ctx.textAlign='left';ctx.fillText('0:00',left,h-5);ctx.textAlign='right';ctx.fillText(formatTime(seconds),right,h-5);
   cached={track,count:track.length,seconds,w,h,dpr,background,left,right,top,bottom};pitchCache.set(canvas,cached);
  }
  const width=Math.round(w*dpr),height=Math.round(h*dpr);if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(cached.background,0,0,w,h);
  const x=cached.left+Math.max(0,Math.min(1,(Number(position)||0)/seconds))*(cached.right-cached.left);
  ctx.strokeStyle='#ffe19a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,cached.top);ctx.lineTo(x,cached.bottom);ctx.stroke();
 }
 function createDocuments(host){
  const pending=new Map();let progress=null,preparing=false;
  return {
   get busy(){return preparing||pending.size>0;},
   onBusy(){progress?.('파일 저장 중입니다. 완료될 때까지 잠시 기다려 주세요.');},
   onResult(id,status,detail){const job=pending.get(id);if(!job)return;if(status==='progress'){progress?.(detail);return;}pending.delete(id);status==='error'?job.reject(new Error(detail)):job.resolve({status,detail});},
   async perform(record,operation,name,onProgress=()=>{}){
    if(preparing||pending.size)throw Error('다른 파일 작업이 끝난 뒤 다시 시도해 주세요.');
    const bridge=host.VoiceLineNative;progress=onProgress;
    const job='export-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);let staged=false;
    preparing=true;
    try{
     if(bridge?.openRecordingFile){
      let source=record.nativeFileId,mime=record.mime||record.blob?.type||'audio/wav';
      if(record.sourceType!=='native-file'){
       const blob=record.blob;if(!blob?.size)throw Error('녹음 파일이 없습니다.');
       const check=error=>{if(error)throw Error(error);};
       check(bridge.beginFileTransfer(job,mime,String(blob.size)));staged=true;
       for(let offset=0;offset<blob.size;offset+=65536){
        const bytes=new Uint8Array(await blob.slice(offset,offset+65536).arrayBuffer());let binary='';
        for(const byte of bytes)binary+=String.fromCharCode(byte);
        check(bridge.appendFileTransfer(job,host.btoa(binary)));
        onProgress('파일 준비 '+Math.min(100,Math.round((offset+bytes.length)/blob.size*100))+'%');
       }
       check(bridge.completeFileTransfer(job));source='transfer:'+job;
      }
      const result=new Promise((resolve,reject)=>pending.set(job,{resolve,reject}));
      try{bridge.openRecordingFile(operation,source,name,mime,job);}catch(e){pending.get(job)?.reject(e);pending.delete(job);}
      return await result;
     }
     if(!record.blob)throw Error('이 버전에서는 파일 내보내기를 지원하지 않습니다. 최신 앱으로 업데이트해 주세요.');
     const mime=record.mime||record.blob.type||'audio/wav',fileName=name+'.'+extension(mime);
     if(operation==='share'){
      if(typeof host.File!=='function'||typeof host.navigator?.share!=='function')throw Error('이 환경은 파일 공유를 지원하지 않습니다. 파일로 저장을 이용해 주세요.');
      const file=new host.File([record.blob],fileName,{type:mime});
      if(!host.navigator?.canShare?.({files:[file]}))throw Error('이 환경은 파일 공유를 지원하지 않습니다. 파일로 저장을 이용해 주세요.');
      await host.navigator.share({files:[file],title:record.title||'목소리 녹음'});return {status:'shared',detail:'공유 창을 사용했습니다.'};
     }
     const url=host.URL.createObjectURL(record.blob),a=host.document.createElement('a');a.href=url;a.download=fileName;a.click();
     host.setTimeout(()=>host.URL.revokeObjectURL(url),60000);return {status:'downloaded',detail:'브라우저 다운로드 목록을 확인하세요.'};
    }catch(error){
     if(staged)bridge.abortFileTransfer(job);
     if(error.name==='AbortError')return {status:'cancelled',detail:'공유를 취소했습니다.'};throw error;
    }finally{preparing=false;progress=null;}
   }
  };
 }
 const api={formatBytes,formatTime,matches,filename,extension,preparePitch,drawPitch,createDocuments};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else{root.VoiceLineRecordingTools=api;root.VoiceLineDocuments=createDocuments(root);}
})(typeof window!=='undefined'?window:globalThis);
