'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const compiler=spawnSync('javac',['-version'],{encoding:'utf8'}).status===0?{cmd:'javac',args:[]}:
 spawnSync('java',['com.sun.tools.javac.Main','-version'],{encoding:'utf8'}).status===0?{cmd:'java',args:['com.sun.tools.javac.Main']}:null;
let dir;
before(()=>{
 if(!compiler)return;
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'voiceline-files-'));
 const files={
 'org/json/JSONObject.java':String.raw`package org.json;public class JSONObject{public static String quote(String s){return "\""+s.replace("\\","\\\\").replace("\"","\\\"")+"\"";}}`,
 'com/voiceline/app/FilesTest.java':String.raw`package com.voiceline.app;
import java.io.*;import java.nio.*;import java.nio.file.*;import java.util.*;
public class FilesTest {
 static void check(boolean value,String text){if(!value)throw new AssertionError(text);}
 static void fails(Work work)throws Exception{try{work.run();throw new AssertionError("operation accepted invalid input");}catch(IOException expected){}}
 interface Work{void run()throws Exception;}
 static long uint(byte[] a,int offset){return Integer.toUnsignedLong(ByteBuffer.wrap(a,offset,4).order(ByteOrder.LITTLE_ENDIAN).getInt());}
 public static void main(String[] args)throws Exception{
  File root=new File(args[1]);NativeWavStore store=new NativeWavStore(root);
  if(args[0].equals("continuous")){
   NativeWavStore.Writer writer=store.begin("long-take",44100,2048);
   byte[] first={1,2,3,4},silence=new byte[4096],last={5,6,7,8};
   writer.append(first);for(int i=0;i<1000;i++)writer.append(silence);writer.append(last);
   check(store.pending().equals("[]"),"active take offered for recovery");fails(()->store.info("long-take",false));fails(()->store.delete("long-take"));
   writer.close();writer.close();
   File file=store.readableFile("long-take");check(file.length()==4096052,"audio length not exact");
   try(RandomAccessFile in=new RandomAccessFile(file,"r")){byte[] header=new byte[44];in.readFully(header);check(uint(header,24)==44100,"wrong sample rate");check(uint(header,40)==4096008,"wrong data length");check(uint(header,4)==4096044,"wrong RIFF length");in.seek(44);check(in.read()==1,"missing beginning");in.seek(file.length()-4);check(in.read()==5,"missing end");}
   check(store.info("long-take",false).contains("\"frames\":2048004"),"wrong sample count");check(store.pending().contains("long-take"),"closed take not recoverable");
   store.commit("long-take");check(store.pending().equals("[]"),"duplicate committed draft");store.delete("long-take");check(!file.exists(),"audio remains after delete");
  }else if(args[0].equals("recovery")){
   NativeWavStore.Writer writer=store.begin("crash-take",16000,123);writer.append(new byte[]{1,2,0,0,3,4});writer.close();
   File audio=store.readableFile("crash-take"),metadata=new File(root,"voiceline-recordings/crash-take.properties");
   Properties p=new Properties();try(InputStream in=new FileInputStream(metadata)){p.load(in);}p.setProperty("complete","false");try(OutputStream out=new FileOutputStream(metadata)){p.store(out,"");}
   try(RandomAccessFile out=new RandomAccessFile(audio,"rw")){out.seek(40);out.write(new byte[]{0,0,0,0});out.seek(out.length());out.write(99);}
   NativeWavStore restarted=new NativeWavStore(root);String info=restarted.info("crash-take",true);check(info.contains("\"bytes\":6"),"partial sample not truncated");check(info.contains("\"startFrame\":123"),"capture origin lost");
   byte[] result=Files.readAllBytes(audio.toPath());check(result.length==50&&uint(result,40)==6,"crash header not repaired");check(result[48]==3&&result[49]==4,"recovery lost last persisted complete sample");
   restarted.appendPitch("crash-take","0,60.25\n100,null\n200,NaN\n<script>\n-1,60\n");
   check(restarted.info("crash-take",true).contains("\"pitchTrack\":[[0,60.25],[100,null],[200,null]]"),"pitch journal not recovered or validated");
   restarted.delete("crash-take");
  }else if(args[0].equals("header-lengths")){
   byte[] pcm=new byte[256];for(int i=0;i<pcm.length;i++)pcm[i]=(byte)(i%127);
   for(String kind:new String[]{"data","riff","odd","truncated"}){
    NativeWavStore.Writer writer=store.begin(kind,16000,0);writer.append(pcm);writer.close();
    File audio=store.readableFile(kind);
    try(RandomAccessFile out=new RandomAccessFile(audio,"rw")){
     if(kind.equals("data")){out.seek(40);out.writeInt(0);}
     else if(kind.equals("riff")){out.seek(4);out.writeInt(0);}
     else if(kind.equals("odd")){out.seek(out.length());out.write(99);}
     else out.setLength(out.length()-2);
    }
    byte[] before=Files.readAllBytes(audio.toPath());int expected=(before.length-44)&~1;
    String info=store.info(kind,false);byte[] repaired=Files.readAllBytes(audio.toPath());
    check(repaired.length==44+expected,"partial sample left in completed take: "+kind);
    check(uint(repaired,4)==expected+36&&uint(repaired,40)==expected,"completed marker hid invalid header lengths: "+kind);
    check(Arrays.equals(Arrays.copyOfRange(repaired,44,repaired.length),Arrays.copyOfRange(before,44,44+expected)),"header repair changed PCM: "+kind);
    check(info.contains("\"bytes\":"+expected)&&info.contains("\"recoveredMetadata\":true"),"repair metadata not reported: "+kind);
    store.delete(kind);
   }
  }else if(args[0].equals("range")){
   File file=new File(root,"range.wav");file.getParentFile().mkdirs();byte[] data=new byte[10000];for(int i=0;i<data.length;i++)data[i]=(byte)(i%251);Files.write(file.toPath(),data);
   String[] headers={null,"bytes=0-43","bytes=44-","bytes=-16","bytes=9990-99999","bytes=0-0"};
   long[][] expected={{0,9999},{0,43},{44,9999},{9984,9999},{9990,9999},{0,0}};
   for(int i=0;i<headers.length;i++){RecordingRange r=RecordingRange.parse(headers[i],10000);check(r.start==expected[i][0]&&r.end==expected[i][1],"wrong range "+headers[i]);try(InputStream in=r.open(file)){byte[] got=in.readAllBytes();check(got.length==r.length,"range loaded wrong length");check(Arrays.equals(got,Arrays.copyOfRange(data,(int)r.start,(int)r.end+1)),"range data mismatch");}}
   for(String bad:new String[]{"bytes=10000-","bytes=50-2","bytes=-0","bytes=-","bytes=1-3,5-8","bytes=99999999999999999999999-","nonsense"})fails(()->RecordingRange.parse(bad,10000));
   fails(()->RecordingRange.parse(null,0));
  }else if(args[0].equals("validation")){
   for(String id:new String[]{"../x","x/../y","x.wav","","a b","%2e%2e","x\\y"})fails(()->store.begin(id,16000,0));
   fails(()->store.begin("bad-rate",0,0));
   NativeWavStore.Writer writer=store.begin("safe",16000,0);fails(()->writer.append(new byte[3]));writer.append(new byte[4]);writer.close();fails(()->writer.append(new byte[4]));fails(()->store.begin("safe",16000,0));store.delete("safe");
  }else throw new AssertionError("unknown test");
  System.out.println(args[0]+" passed");
 }
}`};
 for(const [name,content] of Object.entries(files)){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content)}
 const native=['NativeWavStore.java','RecordingRange.java'].map(name=>path.resolve(__dirname,'../app/src/main/java/com/voiceline/app',name));
 const result=spawnSync(compiler.cmd,[...compiler.args,'-encoding','UTF-8','-d',path.join(dir,'classes'),...native,...Object.keys(files).map(p=>path.join(dir,p))],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
after(()=>{if(dir)fs.rmSync(dir,{recursive:true,force:true})});
for(const [name,description] of [['continuous','one sequential WAV preserves silence, beginning and end without JS audio buffering'],['recovery','persisted native draft repairs its header and restores the incremental pitch journal'],['header-lengths','WAV recovery checks actual header lengths even when metadata says complete'],['range','local WAV playback seeks with validated bounded byte ranges'],['validation','native recording paths and malformed data are rejected']]){
 test('Local34 '+description,{skip:!compiler},()=>{
  const result=spawnSync('java',['-cp',path.join(dir,'classes'),'com.voiceline.app.FilesTest',name,path.join(dir,name)],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/passed/);
 });
}
