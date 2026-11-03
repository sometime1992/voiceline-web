package com.voiceline.app;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

/** One sequential WAV per take. Drafts survive a WebView/process restart. */
public final class NativeWavStore {
    private static final Set<String> OPEN = new HashSet<>();
    private static final long MAX_PCM = 0xffffffffL - 36L;
    private final File directory;

    public NativeWavStore(File filesDirectory) {
        directory = new File(filesDirectory, "voiceline-recordings");
    }
    public static boolean validId(String id) { return id != null && id.matches("[A-Za-z0-9_-]{1,80}"); }
    private File file(String id, String suffix) throws IOException {
        if (!validId(id)) throw new IOException("잘못된 녹음 ID");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) throw new IOException("녹음 폴더 생성 실패");
        return new File(directory, id + suffix);
    }
    private String key(String id) throws IOException { return file(id,".wav").getAbsolutePath(); }
    private Properties read(String id) throws IOException {
        Properties p = new Properties();
        File descriptor=file(id,".properties");if(!descriptor.isFile())descriptor=file(id,".saved");
        try (InputStream in = new FileInputStream(descriptor)) { p.load(in); }
        return p;
    }
    private void save(String id, Properties p) throws IOException {
        File pending = file(id,".properties.tmp"), target = file(id,".saved").isFile()?file(id,".saved"):file(id,".properties");
        try (FileOutputStream out = new FileOutputStream(pending)) { p.store(out,"VoiceLine local recording"); out.getFD().sync(); }
        if (!pending.renameTo(target)) throw new IOException("녹음 정보 저장 실패");
    }
    public Writer begin(String id, int rate, long startFrame) throws IOException {
        if (rate < 8000 || rate > 96000) throw new IOException("잘못된 입력 속도");
        synchronized (OPEN) {
            String key = key(id);
            if (OPEN.contains(key) || file(id,".wav").exists() || (file(id,".properties").exists()||file(id,".saved").exists())) throw new IOException("녹음 ID가 이미 존재합니다");
            OPEN.add(key);
            try { return new Writer(id,rate,startFrame); }
            catch (IOException e) { OPEN.remove(key);file(id,".wav").delete();file(id,".properties").delete();file(id,".properties.tmp").delete();throw e; }
        }
    }
    public final class Writer implements Closeable {
        public final String id;
        public final int rate;
        public final long startFrame;
        private final RandomAccessFile output;
        private final Properties metadata = new Properties();
        private long bytes;
        private boolean closed;
        private long lastSync;
        private Writer(String id,int rate,long startFrame) throws IOException {
            this.id=id;this.rate=rate;this.startFrame=startFrame;
            output=new RandomAccessFile(file(id,".wav"),"rw");
            try {
                header(output,0,rate);output.seek(44);output.getFD().sync();
                metadata.setProperty("id",id);metadata.setProperty("rate",String.valueOf(rate));
                metadata.setProperty("startFrame",String.valueOf(startFrame));metadata.setProperty("timestamp",String.valueOf(System.currentTimeMillis()));
                metadata.setProperty("committed","false");metadata.setProperty("complete","false");save(id,metadata);
            } catch (IOException e) { output.close();throw e; }
        }
        public synchronized void append(byte[] data) throws IOException {
            if (closed || data.length % 2 != 0) throw new IOException("녹음 파일이 닫혔습니다");
            if (bytes + data.length > MAX_PCM) throw new IOException("WAV 최대 파일 크기에 도달했습니다");
            output.write(data);bytes+=data.length;
            // Fixed memory use; sync at most once per two seconds of captured audio.
            if (bytes-lastSync >= rate*4L) { output.getFD().sync();lastSync=bytes; }
        }
        public synchronized long bytes() { return bytes; }
        @Override public synchronized void close() throws IOException {
            if (closed) return;
            closed=true;
            IOException failure=null;
            try { bytes=Math.max(0,output.length()-44)&~1L;output.setLength(44+bytes);header(output,bytes,rate);output.getFD().sync(); }
            catch (IOException e) { failure=e; }
            finally { try { output.close(); } catch(IOException e) { if(failure==null)failure=e; } }
            try { metadata.setProperty("complete",failure==null?"true":"false");save(id,metadata); }
            catch(IOException e) { if(failure==null)failure=e; }
            finally { synchronized(OPEN) { OPEN.remove(key(id)); } }
            if(failure!=null)throw failure;
        }
    }
    private static void little(RandomAccessFile f,long value,int count) throws IOException { for(int i=0;i<count;i++)f.write((int)(value>>(8*i))&255); }
    private static void header(RandomAccessFile f,long bytes,int rate) throws IOException {
        f.seek(0);f.writeBytes("RIFF");little(f,36+bytes,4);f.writeBytes("WAVEfmt ");little(f,16,4);
        little(f,1,2);little(f,1,2);little(f,rate,4);little(f,rate*2L,4);little(f,2,2);little(f,16,2);
        f.writeBytes("data");little(f,bytes,4);
    }
    public synchronized void appendPitch(String id,String lines) throws IOException {
        if(lines==null || lines.length()>65536 || (!file(id,".properties").isFile()&&!file(id,".saved").isFile()))throw new IOException("잘못된 음정 자료");
        StringBuilder checked=new StringBuilder();
        for(String line:lines.split("\n")) {
            String[] parts=line.split(",",-1);if(parts.length!=2)continue;
            try {
                long ms=Long.parseLong(parts[0]);double midi="null".equals(parts[1])?Double.NaN:Double.parseDouble(parts[1]);
                if(ms<0 || ms>1000000000L || (!Double.isNaN(midi)&&(!Double.isFinite(midi)||midi<0||midi>127)))continue;
                checked.append(ms).append(',').append(Double.isNaN(midi)?"null":String.valueOf(midi)).append('\n');
            } catch(NumberFormatException ignored) {}
        }
        try(FileOutputStream out=new FileOutputStream(file(id,".pitch"),true)) {out.write(checked.toString().getBytes(StandardCharsets.UTF_8));}
    }
    private String pitchJson(String id) throws IOException {
        File pitch=file(id,".pitch");if(!pitch.isFile())return "[]";
        StringBuilder json=new StringBuilder("[");boolean comma=false;
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(new FileInputStream(pitch),StandardCharsets.UTF_8))) {
            String line;while((line=reader.readLine())!=null) {
                if(!line.matches("[0-9]{1,10},(?:null|[0-9]+(?:\\.[0-9]+)?)"))continue;
                if(comma)json.append(',');json.append('[').append(line).append(']');comma=true;
            }
        }
        return json.append(']').toString();
    }
    private static long nonnegative(String value,long fallback) {
        try {long n=Long.parseLong(value);return n>=0?n:fallback;}catch(Exception e){return fallback;}
    }
    private static long unsigned(RandomAccessFile in,int count) throws IOException {
        long value=0;for(int i=0;i<count;i++)value|=(long)in.readUnsignedByte()<<(8*i);return value;
    }
    private static void expect(RandomAccessFile in,String text) throws IOException {
        for(int i=0;i<text.length();i++)if(in.read()!=text.charAt(i))throw new IOException("WAV 헤더를 읽을 수 없습니다. 원본 파일을 저장해 주세요.");
    }
    private static final class WavHeader {
        final int rate;final long riffBytes,dataBytes;
        WavHeader(int rate,long riffBytes,long dataBytes){this.rate=rate;this.riffBytes=riffBytes;this.dataBytes=dataBytes;}
    }
    private static WavHeader wavHeader(File wav) throws IOException {
        try(RandomAccessFile in=new RandomAccessFile(wav,"r")) {
            expect(in,"RIFF");long riffBytes=unsigned(in,4);expect(in,"WAVEfmt ");
            if(unsigned(in,4)!=16||unsigned(in,2)!=1||unsigned(in,2)!=1)throw new IOException("지원하지 않는 WAV 형식입니다");
            long rate=unsigned(in,4),bytesPerSecond=unsigned(in,4);
            if(rate<8000||rate>96000||bytesPerSecond!=rate*2||unsigned(in,2)!=2||unsigned(in,2)!=16)throw new IOException("WAV 입력 속도 정보가 올바르지 않습니다");
            expect(in,"data");return new WavHeader((int)rate,riffBytes,unsigned(in,4));
        }
    }
    public String info(String id,boolean withPitch) throws IOException {
        synchronized(OPEN) {
            if(OPEN.contains(key(id)))throw new IOException("녹음을 저장하는 중입니다");
            File wav=file(id,".wav");if(!wav.isFile()||wav.length()<44)throw new FileNotFoundException("녹음 파일이 없습니다");long bytes=Math.max(0,wav.length()-44)&~1L;
            if(bytes>MAX_PCM)throw new IOException("잘못된 WAV 크기");
            WavHeader format=wavHeader(wav);int rate=format.rate;Properties p;boolean repaired=false;
            try {p=read(id);}catch(Exception e){p=new Properties();repaired=true;}
            long startFrame=nonnegative(p.getProperty("startFrame"),0);
            long timestamp=nonnegative(p.getProperty("timestamp"),wav.lastModified());
            if(!String.valueOf(rate).equals(p.getProperty("rate"))||!String.valueOf(startFrame).equals(p.getProperty("startFrame"))||!String.valueOf(timestamp).equals(p.getProperty("timestamp")))repaired=true;
            p.setProperty("id",id);p.setProperty("rate",String.valueOf(rate));
            p.setProperty("startFrame",String.valueOf(startFrame));p.setProperty("timestamp",String.valueOf(timestamp));
            // Trust persisted PCM, not a stale completion marker or header length.
            if(!"true".equals(p.getProperty("complete"))||wav.length()!=bytes+44||format.riffBytes!=bytes+36||format.dataBytes!=bytes) {
                try(RandomAccessFile out=new RandomAccessFile(wav,"rw")) {out.setLength(bytes+44);header(out,bytes,rate);out.getFD().sync();}
                p.setProperty("complete","true");repaired=true;
            }
            if(repaired)save(id,p);
            return "{\"id\":"+JSONObject.quote(id)+",\"nativeFileId\":"+JSONObject.quote(id)+",\"sourceType\":\"native-file\",\"sampleRate\":"+rate
                +",\"startFrame\":"+startFrame+",\"timestamp\":"+timestamp+",\"recoveredMetadata\":"+repaired
                +",\"bytes\":"+bytes+",\"frames\":"+(bytes/2)+",\"committed\":"+Boolean.parseBoolean(p.getProperty("committed","false"))
                +(withPitch?",\"pitchTrack\":"+pitchJson(id):"")+"}";
        }
    }
    public synchronized String pending() {
        File[] all=directory.listFiles((dir,name)->name.endsWith(".properties")||name.endsWith(".wav"));if(all==null)return "[]";
        Set<String> ids=new TreeSet<>();
        for(File f:all){String name=f.getName(),id=name.substring(0,name.length()-(name.endsWith(".wav")?4:11));if(validId(id))ids.add(id);}
        StringBuilder json=new StringBuilder("[");boolean comma=false;
        for(String id:ids) {
            String entry;
            try {
                synchronized(OPEN){if(OPEN.contains(key(id)))continue;}
                if(file(id,".saved").isFile())continue;
                try {if("true".equals(read(id).getProperty("committed"))){commit(id);continue;}}catch(IOException|IllegalArgumentException ignored){}
                entry=info(id,false);
            } catch(Exception e) {
                File wav=new File(directory,id+".wav");
                entry="{\"id\":"+JSONObject.quote(id)+",\"nativeFileId\":"+JSONObject.quote(id)+",\"sourceType\":\"native-file\",\"timestamp\":"+wav.lastModified()
                    +",\"bytes\":"+wav.length()+",\"recoveryError\":"+JSONObject.quote(e.getMessage()==null?"복구 정보를 읽을 수 없습니다":e.getMessage())+"}";
            }
            if(comma)json.append(',');json.append(entry);comma=true;
        }
        return json.append(']').toString();
    }
    public synchronized void commit(String id) throws IOException {
        Properties p=read(id);p.setProperty("committed","true");save(id,p);
        // Recovery scans visit only drafts, independent of the number of saved recordings.
        File draft=file(id,".properties");if(draft.exists()&&!draft.renameTo(file(id,".saved")))throw new IOException("녹음 완료 정보 갱신 실패");
    }
    public synchronized void delete(String id) throws IOException {
        synchronized(OPEN) {
            if(OPEN.contains(key(id)))throw new IOException("녹음 중인 파일은 삭제할 수 없습니다");
            for(String suffix:new String[]{".wav",".pitch",".properties",".saved",".properties.tmp"}) {
                File f=file(id,suffix);if(f.exists()&&!f.delete())throw new IOException("녹음 파일 삭제 실패");
            }
        }
    }
    public File readableFile(String id) throws IOException {
        synchronized(OPEN) {
            File f=file(id,".wav");if(OPEN.contains(key(id))||!f.isFile())throw new FileNotFoundException();return f;
        }
    }
}
