package com.warkost.printbridge;

import android.app.*;
import android.content.Intent;
import android.os.IBinder;
import org.json.JSONObject;
import java.util.concurrent.*;

public class BridgeService extends Service {
    private ScheduledExecutorService worker;
    public static volatile String status="Berhenti";
    public static volatile boolean running=false;
    private static final java.util.concurrent.locks.ReentrantLock gate=new java.util.concurrent.locks.ReentrantLock();
    private int failures=0;
    private Notification notification(String text) {
        return new Notification.Builder(this,"bridge").setContentTitle("Warkost Print Bridge").setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync).setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE)).build();
    }
    @Override public void onCreate() {
        super.onCreate(); running=true;
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("bridge","Print bridge",NotificationManager.IMPORTANCE_LOW));
        startForeground(80,notification("Admin + Kitchen — belum ada konfirmasi kertas"));
        worker=Executors.newSingleThreadScheduledExecutor();
        worker.schedule(this::cycle,0,TimeUnit.SECONDS);
    }
    private void cycle() {
        if(!gate.tryLock()) { if(!worker.isShutdown()) worker.schedule(this::cycle,5,TimeUnit.SECONDS); return; }
        boolean ok=true;
        try {
        for(String station:new String[]{"ADMIN","KITCHEN"}) {
            try {
                Vault vault=new Vault(this);
                JSONObject config=new JSONObject(vault.read("config-"+station));
                if(!config.has("token")) continue;
                final String slot="journal-"+station;
                OnceSender.Journal journal=new OnceSender.Journal() {
                    public OnceSender.Pending pending() throws Exception {
                        JSONObject x=new JSONObject(vault.read(slot));
                        if(!x.has("id")) return null;
                        // Recovery needs only lease + outcome, never payload bytes again.
                        return new OnceSender.Pending(new OnceSender.Job(x.getLong("id"),x.getString("lease"),new byte[0],""),x.getString("outcome"));
                    }
                    public String completed() throws Exception { return new JSONObject(vault.read(slot)).optString("completed",""); }
                    public void save(OnceSender.Pending p) throws Exception {
                        vault.write(slot,new JSONObject().put("id",p.job.id).put("lease",p.job.lease).put("outcome",p.outcome).toString());
                    }
                    public void finish(String key) throws Exception { vault.write(slot,new JSONObject().put("completed",key).toString()); }
                };
                AgentClient api=new AgentClient(config.getString("origin"),config.getString("token"),station);
                try { new OnceSender(journal,api,OnceSender.tcp(config.getString("ip"),9100)).tick(); }
                catch(AgentClient.StaleLease e) {
                    // Server rejects retired lease after manual intervention; never resend it.
                    OnceSender.Pending p=journal.pending(); if(p!=null) journal.finish(p.job.key());
                }
                status=station+": polling aktif; cek Printer Center untuk kertas";
            } catch(Exception e) {
                ok=false; status=station+": koneksi/jurnal perlu diperiksa — tidak mencetak ulang";
                // Never log exception details, credentials, ticket or address.
            }
        }
        } finally { gate.unlock(); }
        failures=ok?0:Math.min(4,failures+1);
        if(android.os.Build.VERSION.SDK_INT<33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED) getSystemService(NotificationManager.class).notify(80,notification(status));
        if(!worker.isShutdown()) worker.schedule(this::cycle,Math.min(60,5L<<failures),TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent i,int flags,int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        if(worker!=null) { worker.shutdownNow(); new Thread(() -> { try { if(worker.awaitTermination(30,TimeUnit.SECONDS)) running=false; } catch(InterruptedException ignored) {} }).start(); } status="Berhenti; mulai kembali dari aplikasi";
        super.onDestroy();
    }
}
