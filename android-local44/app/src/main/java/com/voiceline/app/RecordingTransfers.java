package com.voiceline.app;

import java.io.*;
import java.util.*;

/** Bounded chunks for exporting recordings made by older browser/PCM versions. */
public final class RecordingTransfers {
    public static final int CHUNK_BYTES=65536;
    private final File directory;
    private final Map<String,Item> items=new HashMap<>();
    private static final class Item {
        final File part,file;final String mime;final long expected;long bytes;FileOutputStream output;
        Item(File directory,String id,String mime,long expected) throws IOException {
            this.mime=mime;this.expected=expected;part=new File(directory,id+".part");file=new File(directory,id+"."+extension(mime));
            if(part.exists()||file.exists())throw new IOException("파일 작업이 이미 존재합니다");
            output=new FileOutputStream(part);
        }
    }
    public RecordingTransfers(File cache) throws IOException {
        directory=new File(cache,"recording-exports");
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("임시 저장 공간을 열 수 없습니다");
        File[] stale=directory.listFiles();long cutoff=System.currentTimeMillis()-86400000L;
        if(stale!=null)for(File file:stale)if(file.isFile()&&file.lastModified()<cutoff)file.delete();
    }
    public static String extension(String mime) throws IOException {
        if("audio/wav".equals(mime)||"audio/x-wav".equals(mime))return "wav";
        if(mime!=null&&mime.startsWith("audio/webm"))return "webm";
        if(mime!=null&&mime.startsWith("audio/mp4"))return "m4a";
        if(mime!=null&&mime.startsWith("audio/ogg"))return "ogg";
        if("audio/mpeg".equals(mime))return "mp3";
        throw new IOException("지원하지 않는 녹음 형식입니다");
    }
    private Item item(String id) throws IOException {
        if(!NativeWavStore.validId(id)||!items.containsKey(id))throw new IOException("파일 준비 작업을 찾을 수 없습니다");return items.get(id);
    }
    public synchronized void begin(String id,String mime,long bytes) throws IOException {
        if(!NativeWavStore.validId(id)||bytes<1||bytes>0xffffffffL)throw new IOException("파일 정보가 올바르지 않습니다");
        extension(mime);
        if(items.containsKey(id)||items.values().stream().anyMatch(i->i.output!=null))throw new IOException("다른 파일을 준비 중입니다");
        if(bytes>Math.max(0,directory.getUsableSpace()-4L*1024*1024))throw new IOException("파일을 준비할 저장 공간이 부족합니다");
        items.put(id,new Item(directory,id,mime,bytes));
    }
    public synchronized void append(String id,String encoded) throws IOException {
        Item item=item(id);
        if(item.output==null||encoded==null||encoded.length()>((CHUNK_BYTES+2)/3)*4)throw new IOException("파일 조각이 올바르지 않습니다");
        byte[] data;try{data=Base64.getDecoder().decode(encoded);}catch(IllegalArgumentException e){throw new IOException("파일 조각을 읽을 수 없습니다",e);}
        if(data.length>CHUNK_BYTES||item.bytes+data.length>item.expected)throw new IOException("파일 크기가 일치하지 않습니다");
        item.output.write(data);item.bytes+=data.length;
    }
    public synchronized void complete(String id) throws IOException {
        Item item=item(id);
        if(item.output==null||item.bytes!=item.expected)throw new IOException("파일 준비가 완료되지 않았습니다");
        item.output.getFD().sync();item.output.close();item.output=null;
        if(!item.part.renameTo(item.file))throw new IOException("임시 파일을 완성할 수 없습니다");
    }
    public synchronized File ready(String id) throws IOException {
        Item item=item(id);if(item.output!=null||!item.file.isFile()||item.file.length()!=item.expected)throw new IOException("파일 준비가 완료되지 않았습니다");return item.file;
    }
    public synchronized String mime(String id) throws IOException {return item(id).mime;}
    public synchronized void forget(String id,boolean removeFile) {
        Item item=items.remove(id);if(item==null)return;
        try{if(item.output!=null)item.output.close();}catch(IOException ignored){}
        item.part.delete();if(removeFile)item.file.delete();
    }
    public synchronized void dispose() {for(String id:new ArrayList<>(items.keySet()))forget(id,true);}
}
