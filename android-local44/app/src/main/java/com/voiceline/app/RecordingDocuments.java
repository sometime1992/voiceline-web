package com.voiceline.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.core.content.FileProvider;
import java.io.*;
import java.util.concurrent.*;

/** User-selected external copies and read-only sharing; originals stay in app storage. */
public final class RecordingDocuments implements NativeMicBridge.DocumentActions {
    public interface Result {void complete(String job,String status,String detail);}
    private static final int CREATE_DOCUMENT=169;
    private final Activity activity;private final NativeWavStore files;private final Result result;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private RecordingTransfers transfers;private volatile boolean busy,disposed;
    private Pending pending;
    private static final class Pending {
        final String job,transfer;final File file;
        Pending(String job,String transfer,File file){this.job=job;this.transfer=transfer;this.file=file;}
    }
    public RecordingDocuments(Activity activity,NativeWavStore files,Result result) {
        this.activity=activity;this.files=files;this.result=result;
        try{transfers=new RecordingTransfers(activity.getCacheDir());}catch(IOException ignored){}
    }
    private String failure(Exception e){return e.getMessage()==null?"파일을 처리할 수 없습니다":e.getMessage();}
    @Override public String begin(String job,String mime,long bytes) {
        try{if(busy||disposed||transfers==null)throw new IOException("파일 준비를 시작할 수 없습니다");transfers.begin(job,mime,bytes);return "";}catch(Exception e){return failure(e);}
    }
    @Override public String append(String job,String encoded) {
        try{if(disposed||transfers==null)throw new IOException("파일 준비가 중단되었습니다");transfers.append(job,encoded);return "";}catch(Exception e){return failure(e);}
    }
    @Override public String complete(String job) {
        try{if(disposed||transfers==null)throw new IOException("파일 준비가 중단되었습니다");transfers.complete(job);return "";}catch(Exception e){return failure(e);}
    }
    @Override public void abort(String job){if(transfers!=null)transfers.forget(job,true);}
    private static String safeName(String name,String extension) {
        String safe=name==null?"목소리 녹음":name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").trim();
        safe=safe.replaceFirst("(?i)\\.(wav|webm|m4a|mp4|ogg|mp3)$","");
        if(safe.isEmpty())safe="목소리 녹음";
        return safe.substring(0,Math.min(80,safe.length()))+"."+extension;
    }
    @Override public void open(String operation,String source,String name,String suppliedMime,String job) {
        String transfer=null;
        try{
            if(disposed||busy)throw new IOException("다른 파일 작업이 끝난 뒤 다시 시도해 주세요");
            if(!NativeWavStore.validId(job)||(!"save".equals(operation)&&!"share".equals(operation)))throw new IOException("잘못된 파일 작업입니다");
            File file;String mime;
            if(source!=null&&source.startsWith("transfer:")){
                transfer=source.substring(9);
                if(transfers==null||!transfer.equals(job))throw new IOException("파일 준비 정보를 확인할 수 없습니다");
                file=transfers.ready(transfer);mime=transfers.mime(transfer).split(";")[0];
            }else{file=files.readableFile(source);mime="audio/wav";}
            String filename=safeName(name,RecordingTransfers.extension(mime));
            if("share".equals(operation)){
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".recordings",file,filename);
                Intent send=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri);
                send.setClipData(ClipData.newUri(activity.getContentResolver(),filename,uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(send,"녹음 공유").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
                if(transfer!=null)transfers.forget(transfer,false);
                result.complete(job,"shared","공유할 앱을 선택하세요.");return;
            }
            pending=new Pending(job,transfer,file);busy=true;
            activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,filename),CREATE_DOCUMENT);
            result.complete(job,"progress","녹음 파일을 저장할 위치와 이름을 선택하세요.");
        }catch(Exception e){
            if(pending!=null&&pending.job.equals(job)){pending=null;busy=false;}
            if(transfer!=null&&transfers!=null)transfers.forget(transfer,true);
            result.complete(job,"error",failure(e));
        }
    }
    public boolean onActivityResult(int request,int status,Intent data) {
        if(request!=CREATE_DOCUMENT)return false;
        Pending item=pending;pending=null;if(item==null)return true;
        Uri uri=data==null?null:data.getData();
        if(status!=Activity.RESULT_OK||uri==null||!"content".equals(uri.getScheme())){
            finish(item,"cancelled","저장을 취소했습니다.");return true;
        }
        result.complete(item.job,"progress","녹음 파일을 저장하는 중입니다…");
        try{worker.execute(()->{
            String state="saved",message="선택한 위치에 녹음 파일을 저장했습니다.";
            try(InputStream input=new FileInputStream(item.file);OutputStream output=activity.getContentResolver().openOutputStream(uri,"w")){
                if(output==null)throw new IOException("선택한 위치에 파일을 쓸 수 없습니다");
                byte[] buffer=new byte[65536];int read;long bytes=0,expected=item.file.length();
                while((read=input.read(buffer))!=-1){if(disposed||Thread.currentThread().isInterrupted())throw new IOException("파일 저장이 중단되었습니다");output.write(buffer,0,read);bytes+=read;}
                output.flush();if(bytes!=expected)throw new IOException("복사한 파일 크기가 일치하지 않습니다");
            }catch(Exception e){
                state="error";message="파일 저장에 실패했습니다. "+failure(e);
                try{if(!DocumentsContract.deleteDocument(activity.getContentResolver(),uri))message+=" 선택한 폴더의 불완전한 파일을 확인해 주세요.";}catch(Exception ignored){message+=" 선택한 폴더의 불완전한 파일을 확인해 주세요.";}
            }
            final String finalState=state,finalMessage=message;
            activity.runOnUiThread(()->finish(item,finalState,finalMessage));
        });}catch(RejectedExecutionException e){finish(item,"error","파일 저장이 중단되었습니다.");}
        return true;
    }
    private void finish(Pending item,String state,String message) {
        busy=false;if(item.transfer!=null&&transfers!=null)transfers.forget(item.transfer,true);
        if(!disposed)result.complete(item.job,state,message);
    }
    public boolean isBusy(){return busy;}
    public void dispose(){disposed=true;worker.shutdownNow();if(transfers!=null)transfers.dispose();pending=null;}
}
