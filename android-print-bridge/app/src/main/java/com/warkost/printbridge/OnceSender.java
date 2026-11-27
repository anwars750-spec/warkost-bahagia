package com.warkost.printbridge;

import java.io.IOException;
import java.net.Socket;
import java.net.InetSocketAddress;
import java.security.MessageDigest;
import java.util.concurrent.*;

/** Write-ahead intent, not exactly-once paper delivery. Ambiguity never auto-reprints. */
public final class OnceSender {
    public static final class Job {
        public long id; public String lease, digest; public byte[] bytes;
        public Job(long i, String l, byte[] b, String h) { id=i; lease=l; bytes=b; digest=h; }
        public String key() { return id + ":" + lease; }
    }
    public static final class Pending {
        public Job job; public String outcome;
        public Pending(Job j, String o) { job=j; outcome=o; }
    }
    public interface Journal {
        Pending pending() throws Exception;
        String completed() throws Exception;
        void save(Pending p) throws Exception;
        void finish(String key) throws Exception;
    }
    public interface Backend {
        Job claim() throws Exception;
        void begin(Job j) throws Exception;
        void ack(Job j, String outcome) throws Exception;
    }
    public interface Connection extends AutoCloseable { void write(byte[] b) throws Exception; void close() throws IOException; }
    public interface Printer { Connection connect() throws Exception; }
    public static String sha(byte[] b) throws Exception {
        StringBuilder out=new StringBuilder();
        for(byte x:MessageDigest.getInstance("SHA-256").digest(b)) out.append(String.format("%02x", x & 255));
        return out.toString();
    }
    public static boolean privateIPv4(String ip) {
        if(ip == null || !ip.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+")) return false;
        String[] x=ip.split("\\."); int[] n=new int[4];
        try { for(int k=0;k<4;k++) { n[k]=Integer.parseInt(x[k]); if(n[k]>255 || !x[k].equals(Integer.toString(n[k]))) return false; } } catch(Exception e) { return false; }
        return n[0]==10 || (n[0]==172 && n[1]>=16 && n[1]<=31) || (n[0]==192 && n[1]==168);
    }
    public static void verifyPrinter(String expected,String actual) throws IOException {
        if(!privateIPv4(expected) || !expected.equals(actual)) throw new IOException("Station printer mapping mismatch");
    }
    public static Printer tcp(String ip, int port) {
        if(!privateIPv4(ip) || port!=9100) throw new IllegalArgumentException("Printer harus IP LAN privat:9100");
        return () -> {
            Socket s=new Socket();
            try { s.connect(new InetSocketAddress(ip,port),5000); }
            catch(Exception e) { s.close(); throw e; }
            return new Connection() {
                public void write(byte[] b) throws Exception {
                    ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
                    ScheduledFuture<?> timeout=timer.schedule(() -> { try { s.close(); } catch(IOException ignored) {} },10,TimeUnit.SECONDS);
                    try { s.getOutputStream().write(b); s.getOutputStream().flush(); }
                    finally { timeout.cancel(false); timer.shutdownNow(); }
                }
                public void close() throws IOException { s.close(); }
            };
        };
    }
    private final Journal journal; private final Backend backend; private final Printer printer;
    public OnceSender(Journal j, Backend b, Printer p) { journal=j; backend=b; printer=p; }
    public void tick() throws Exception {
        Pending p=journal.pending();
        // After any restart, pending intent is ACK-only, never another socket write.
        if(p!=null) { backend.ack(p.job,p.outcome); journal.finish(p.job.key()); return; }
        Job job=backend.claim(); if(job==null) return;
        if(job.key().equals(journal.completed())) return;
        if(job.bytes.length>65536 || !sha(job.bytes).equals(job.digest)) throw new IOException("Payload integrity");
        Connection c;
        try { c=printer.connect(); }
        catch(Exception e) {
            journal.save(new Pending(job,"OFFLINE"));
            backend.ack(job,"OFFLINE"); journal.finish(job.key()); return;
        }
        try(c) {
            // Persist BEFORE begin HTTP call. Crash/network loss after begin cannot replay bytes.
            p=new Pending(job,"UNKNOWN"); journal.save(p);
            try { backend.begin(job); c.write(job.bytes); p=new Pending(job,"SENT"); journal.save(p); }
            catch(Exception e) { /* Keep UNKNOWN. TCP success is never paper confirmation. */ }
        }
        backend.ack(p.job,p.outcome); journal.finish(p.job.key());
    }
}
