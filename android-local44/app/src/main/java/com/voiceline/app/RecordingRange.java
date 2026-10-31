package com.voiceline.app;

import java.io.*;

/** Single HTTP byte range, used for seeking large local WAVs without a Blob copy. */
public final class RecordingRange {
    public final long start,end,length;
    public final boolean partial;
    private RecordingRange(long start,long end,boolean partial) {this.start=start;this.end=end;this.length=end-start+1;this.partial=partial;}
    public static RecordingRange parse(String header,long size) throws IOException {
        if(size<=0)throw new IOException("Empty file");
        if(header==null||header.isEmpty())return new RecordingRange(0,size-1,false);
        if(!header.matches("bytes=[0-9]*-[0-9]*"))throw new IOException("Unsupported range");
        String[] bounds=header.substring(6).split("-",-1);
        try {
            long start,end;
            if(bounds[0].isEmpty()) {
                long suffix=Long.parseLong(bounds[1]);if(suffix<=0)throw new IOException("Invalid suffix");
                start=Math.max(0,size-suffix);end=size-1;
            } else {
                start=Long.parseLong(bounds[0]);end=bounds[1].isEmpty()?size-1:Math.min(size-1,Long.parseLong(bounds[1]));
            }
            if(start<0||start>=size||end<start)throw new IOException("Unsatisfiable range");
            return new RecordingRange(start,end,true);
        } catch(NumberFormatException e) {throw new IOException("Invalid range",e);}
    }
    public InputStream open(File file) throws IOException {
        FileInputStream input=new FileInputStream(file);
        try {input.getChannel().position(start);}catch(IOException e){input.close();throw e;}
        return new FilterInputStream(input) {
            private long remaining=length;
            @Override public int read() throws IOException {if(remaining==0)return -1;int value=super.read();if(value>=0)remaining--;return value;}
            @Override public int read(byte[] bytes,int offset,int count) throws IOException {
                if(offset<0||count<0||offset>bytes.length-count)throw new IndexOutOfBoundsException();if(count==0)return 0;
                if(remaining==0)return -1;int read=in.read(bytes,offset,(int)Math.min(count,remaining));if(read>0)remaining-=read;return read;
            }
            @Override public long skip(long count) throws IOException {if(count<=0)return 0;long skipped=in.skip(Math.min(count,remaining));remaining-=skipped;return skipped;}
            @Override public int available() throws IOException {return (int)Math.min(remaining,in.available());}
        };
    }
}
