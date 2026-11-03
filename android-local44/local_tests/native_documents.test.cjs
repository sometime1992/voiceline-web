'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const compiler=spawnSync('javac',['-version'],{encoding:'utf8'}).status===0?['javac']:spawnSync('java',['com.sun.tools.javac.Main','-version'],{encoding:'utf8'}).status===0?['java','com.sun.tools.javac.Main']:null;
let directory;
before(()=>{
 if(!compiler)return;directory=fs.mkdtempSync(path.join(os.tmpdir(),'voiceline-documents-'));
 const files={...require('./native_java_fixture.cjs'),
 'android/app/Activity.java':String.raw`package android.app;
 import android.content.*;import java.io.*;
 public class Activity {
  public static final int RESULT_OK=-1,RESULT_CANCELED=0;
  public boolean allowed=true,failLaunch;public int prompts,requestCode;public Intent launched;
  private final File root=new File(System.getProperty("java.io.tmpdir"),"vl-doc-"+System.nanoTime());
  public final ContentResolver resolver=new ContentResolver();
  public File getFilesDir(){return new File(root,"files");}public File getCacheDir(){return new File(root,"cache");}
  public String getPackageName(){return "com.voiceline.app.local18";}public ContentResolver getContentResolver(){return resolver;}
  public int checkSelfPermission(String permission){return allowed?0:-1;}public void requestPermissions(String[] permissions,int code){prompts++;}
  public boolean isFinishing(){return false;}public boolean isDestroyed(){return false;}
  public void startActivity(Intent intent){if(failLaunch)throw new IllegalStateException("no application");launched=intent;}
  public void startActivityForResult(Intent intent,int code){startActivity(intent);requestCode=code;}
  public void runOnUiThread(Runnable action){action.run();}
 }`,
 'android/net/Uri.java':'package android.net;public class Uri{private final String value;private Uri(String value){this.value=value;}public static Uri parse(String value){return new Uri(value);}public String getScheme(){return value.split(":")[0];}public String toString(){return value;}}',
 'android/content/Intent.java':String.raw`package android.content;
 import android.net.Uri;import java.util.*;
 public class Intent {
  public static final String ACTION_SEND="send",ACTION_CREATE_DOCUMENT="create",CATEGORY_OPENABLE="openable",EXTRA_STREAM="stream",EXTRA_TITLE="title";
  public static final int FLAG_GRANT_READ_URI_PERMISSION=1;
  public String action,type;public int flags;public ClipData clip;public Uri data;public final Map<String,Object> extras=new HashMap<>();
  public Intent(){}public Intent(String action){this.action=action;}public Intent setType(String type){this.type=type;return this;}
  public Intent putExtra(String key,Object value){extras.put(key,value);return this;}public Intent addCategory(String category){return this;}
  public Intent addFlags(int flags){this.flags|=flags;return this;}public void setClipData(ClipData data){clip=data;}
  public Uri getData(){return data;}public Intent setData(Uri uri){data=uri;return this;}
  public static Intent createChooser(Intent target,CharSequence label){return new Intent("chooser").putExtra("target",target);}
 }`,
 'android/content/ClipData.java':'package android.content;import android.net.Uri;public class ClipData {public final Uri uri;private ClipData(Uri uri){this.uri=uri;}public static ClipData newUri(ContentResolver resolver,CharSequence label,Uri uri){return new ClipData(uri);}}',
 'android/content/ContentResolver.java':String.raw`package android.content;
 import android.net.Uri;import java.io.*;
 public class ContentResolver {
  public final ByteArrayOutputStream bytes=new ByteArrayOutputStream();public boolean deleted,closed,nullStream;public int failAfter=-1;
  public OutputStream openOutputStream(Uri uri,String mode)throws IOException {
   if(nullStream)return null;return new OutputStream(){public void write(int value)throws IOException{if(failAfter>=0&&bytes.size()>=failAfter)throw new IOException("simulated full disk");bytes.write(value);}
    public void write(byte[] data,int offset,int count)throws IOException{for(int i=0;i<count;i++)write(data[offset+i]);}public void close(){closed=true;}};
  }
 }`,
 'android/provider/DocumentsContract.java':'package android.provider;import android.content.ContentResolver;import android.net.Uri;public class DocumentsContract{public static boolean deleteDocument(ContentResolver resolver,Uri uri){resolver.deleted=true;return true;}}',
 'androidx/core/content/FileProvider.java':'package androidx.core.content;import android.app.Activity;import android.net.Uri;import java.io.File;public class FileProvider{public static File lastFile;public static String lastName,lastAuthority;public static Uri getUriForFile(Activity activity,String authority,File file,String name){lastFile=file;lastName=name;lastAuthority=authority;return Uri.parse("content://"+authority+"/"+file.getName());}}',
 'com/voiceline/app/DocumentsTest.java':String.raw`package com.voiceline.app;
 import android.app.Activity;import android.content.*;import android.net.Uri;import android.webkit.WebView;import android.media.AudioRecord;
 import androidx.core.content.FileProvider;import java.io.*;import java.nio.file.*;import java.util.*;import java.util.concurrent.CopyOnWriteArrayList;import java.util.function.BooleanSupplier;
 public class DocumentsTest{
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  static void waitFor(BooleanSupplier condition)throws Exception{long end=System.currentTimeMillis()+4000;while(!condition.getAsBoolean()&&System.currentTimeMillis()<end)Thread.sleep(2);check(condition.getAsBoolean(),"operation did not complete");}
  interface Work{void run()throws Exception;}static void fails(Work work)throws Exception{try{work.run();throw new AssertionError("invalid operation accepted");}catch(IOException expected){}}
  static byte[] audio(NativeWavStore store,String id)throws Exception{NativeWavStore.Writer writer=store.begin(id,16000,0);byte[] data=new byte[32768];for(int i=0;i<data.length;i++)data[i]=(byte)(i%127);for(int i=0;i<8;i++)writer.append(data);writer.close();return Files.readAllBytes(store.readableFile(id).toPath());}
  public static void main(String[] args)throws Exception{
   Activity a=new Activity();NativeWavStore store=new NativeWavStore(a.getFilesDir());
   List<String> results=new CopyOnWriteArrayList<>();RecordingDocuments docs=new RecordingDocuments(a,store,(job,status,detail)->results.add(job+":"+status));
   try{
    if(args[0].equals("recovery")){
     byte[] original=audio(store,"recover");File metadata=new File(a.getFilesDir(),"voiceline-recordings/recover.properties");
     Properties properties=new Properties();try(InputStream in=new FileInputStream(metadata)){properties.load(in);}properties.setProperty("rate","bad");properties.setProperty("timestamp","bad");
     try(OutputStream out=new FileOutputStream(metadata)){properties.store(out,"");}
     check(store.pending().contains("recover"),"damaged metadata hid WAV");check(store.info("recover",false).contains("\"sampleRate\":16000"),"rate not rebuilt from WAV");
     check(Arrays.equals(original,Files.readAllBytes(store.readableFile("recover").toPath())),"repair altered audio bytes");
     check(metadata.delete(),"cannot remove metadata");check(store.pending().contains("recover"),"orphan WAV not recovered");
     store.commit("recover");check(store.pending().equals("[]"),"saved WAV offered twice");
     audio(store,"broken");File broken=store.readableFile("broken");try(RandomAccessFile out=new RandomAccessFile(broken,"rw")){out.write('X');}
     byte[] damaged=Files.readAllBytes(broken.toPath());String pending=store.pending();check(pending.contains("broken")&&pending.contains("recoveryError"),"unrecoverable WAV silently omitted");
     check(Arrays.equals(damaged,Files.readAllBytes(broken.toPath())),"invalid header was rewritten");
    }else if(args[0].equals("transfers")){
     RecordingTransfers transfers=new RecordingTransfers(a.getCacheDir());byte[] data=new byte[150000];for(int i=0;i<data.length;i++)data[i]=(byte)i;
     fails(()->transfers.begin("../bad","audio/wav",1));transfers.begin("blob","audio/webm",data.length);fails(()->transfers.ready("blob"));
     for(int i=0;i<data.length;i+=65536)transfers.append("blob",Base64.getEncoder().encodeToString(Arrays.copyOfRange(data,i,Math.min(i+65536,data.length))));
     transfers.complete("blob");File file=transfers.ready("blob");check(Arrays.equals(data,Files.readAllBytes(file.toPath())),"Blob transfer bytes changed");
     transfers.forget("blob",false);transfers.dispose();check(file.isFile(),"shared temporary file removed immediately");
     transfers.begin("cancel","audio/wav",100);transfers.append("cancel",Base64.getEncoder().encodeToString(new byte[20]));transfers.forget("cancel",true);
     check(!new File(a.getCacheDir(),"recording-exports/cancel.part").exists(),"partial transfer remains");
     transfers.begin("oversized","audio/wav",1);fails(()->transfers.append("oversized","AAAA"));transfers.dispose();
    }else if(args[0].equals("save")){
     byte[] original=audio(store,"saved");docs.open("save","saved","허밍/원본","audio/wav","job");
     check(docs.isBusy()&&a.requestCode==169,"system picker not pending");check(a.launched.type.equals("audio/wav"),"wrong MIME");
     check(!a.launched.extras.get("title").toString().contains("/"),"unsafe filename");
     docs.onActivityResult(169,Activity.RESULT_OK,new Intent().setData(Uri.parse("content://documents/new")));
     waitFor(()->results.contains("job:saved"));check(a.resolver.closed&&!docs.isBusy(),"saved before stream closed");
     check(Arrays.equals(original,a.resolver.bytes.toByteArray()),"external copy incomplete");check(store.readableFile("saved").isFile(),"original deleted");
    }else if(args[0].equals("cancel")){
     audio(store,"saved");docs.open("save","saved","test","audio/wav","job");
     docs.open("share","saved","other","audio/wav","second");check(results.contains("second:error")&&docs.isBusy(),"second action changed pending picker");
     docs.onActivityResult(169,Activity.RESULT_CANCELED,null);check(results.contains("job:cancelled"),"cancel reported success");
     check(a.resolver.bytes.size()==0&&!docs.isBusy()&&store.readableFile("saved").isFile(),"cancel touched original");
    }else if(args[0].equals("failure")){
     byte[] original=audio(store,"saved");a.resolver.failAfter=10000;docs.open("save","saved","test","audio/wav","job");
     docs.onActivityResult(169,Activity.RESULT_OK,new Intent().setData(Uri.parse("content://documents/fail")));
     waitFor(()->results.contains("job:error"));check(a.resolver.deleted,"failed external copy not removed");
     check(Arrays.equals(original,Files.readAllBytes(store.readableFile("saved").toPath())),"failed save damaged original");
    }else if(args[0].equals("share")){
     audio(store,"saved");docs.open("share","saved","허밍","audio/wav","job");
     check(results.contains("job:shared")&&!results.contains("job:saved"),"chooser claimed a completed save");
     Intent target=(Intent)a.launched.extras.get("target");check(target.action.equals(Intent.ACTION_SEND)&&target.clip!=null,"share intent lacks stream/ClipData");
     check((target.flags&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0,"read permission not granted");check(target.extras.get(Intent.EXTRA_STREAM).toString().startsWith("content://"),"raw path shared");
     check(FileProvider.lastName.equals("허밍.wav")&&FileProvider.lastAuthority.equals(a.getPackageName()+".recordings"),"provider identity/name mismatch");
    }else if(args[0].equals("legacy")){
     check(docs.begin("job","audio/webm",3).isEmpty(),"legacy begin failed");check(docs.append("job","AQID").isEmpty(),"legacy append failed");check(docs.complete("job").isEmpty(),"legacy complete failed");
     docs.open("share","transfer:job","옛 녹음","audio/webm","job");check(results.contains("job:shared"),"legacy share failed");
     check(FileProvider.lastName.endsWith(".webm")&&Arrays.equals(Files.readAllBytes(FileProvider.lastFile.toPath()),new byte[]{1,2,3}),"legacy format changed");
     docs.dispose();check(FileProvider.lastFile.isFile(),"share grant outlived temporary file");
    }else if(args[0].equals("backpressure")){
     WebView web=new WebView();web.holdCallbacks=true;NativeMicBridge bridge=new NativeMicBridge(a,web);bridge.start("70");bridge.beginRecording("70","queued");
     File wav=new File(a.getFilesDir(),"voiceline-recordings/queued.wav");
     for(int i=0;i<20;i++)AudioRecord.chunks.add(new short[1024]);waitFor(()->wav.length()==44+20*2048);
     check(web.scripts.stream().filter(x->x.contains("onAudioChunk")).count()==3,"JS execution backlog exceeds three");
     web.drain();AudioRecord.chunks.add(new short[1024]);waitFor(()->web.scripts.stream().filter(x->x.contains("onAudioChunk")).count()==4);
     bridge.finishRecording("70","queued");waitFor(()->!bridge.getRecordingInfo("queued").contains("error"));
     check(wav.length()==44+21*2048,"analysis backpressure lost audio samples");web.drain();bridge.dispose();
    }
    if(args[0].equals("selection")){
     PracticeWebView view=new PracticeWebView(new android.content.Context());
     check(view.startActionMode(null)==null,"primary copy toolbar opened");
     check(view.startActionMode(null,1)==null,"floating translation toolbar opened");
     check(new WebView().startActionMode(null,1)!=null,"fixture did not distinguish default selection behavior");
    }
    System.out.println(args[0]+" passed");
   }finally{docs.dispose();}
  }
 }`
 };
 files['android/content/Context.java']='package android.content;public class Context{}';
 files['android/view/ActionMode.java']='package android.view;public class ActionMode{public interface Callback{}}';
 files['android/webkit/WebView.java']=files['android/webkit/WebView.java'].replace('public class WebView {',
  'public class WebView {public WebView(){}public WebView(android.content.Context context){}public android.view.ActionMode startActionMode(android.view.ActionMode.Callback callback){return new android.view.ActionMode();}public android.view.ActionMode startActionMode(android.view.ActionMode.Callback callback,int type){return new android.view.ActionMode();}');
 delete files['com/voiceline/app/BridgeTest.java'];
 for(const [name,text]of Object.entries(files)){const p=path.join(directory,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);}
 const source=path.join(__dirname,'../app/src/main/java/com/voiceline/app');
 const actual=['NativeMicBridge.java','NativeWavStore.java','RecordingTransfers.java','RecordingDocuments.java','RecordingFileProvider.java','PracticeWebView.java'].map(n=>path.join(source,n));
 const compile=spawnSync(compiler[0],[...compiler.slice(1),'-encoding','UTF-8','-d',path.join(directory,'classes'),...actual,...Object.keys(files).map(n=>path.join(directory,n))],{encoding:'utf8',timeout:30000});
 assert.equal(compile.status,0,compile.stdout+compile.stderr);
});
after(()=>{if(directory)fs.rmSync(directory,{recursive:true,force:true});});
for(const name of ['recovery','transfers','save','cancel','failure','share','legacy','backpressure','selection']){
 test('Local39 native documents: '+name,{skip:!compiler},()=>{
  const run=spawnSync('java',['-cp',path.join(directory,'classes'),'com.voiceline.app.DocumentsTest',name],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/passed/);
 });
}
