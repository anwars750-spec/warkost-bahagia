package com.warkost.printbridge;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.widget.*;
import android.text.InputType;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final java.util.concurrent.atomic.AtomicBoolean pairing=new java.util.concurrent.atomic.AtomicBoolean(false);
    private TextView status;
    private EditText field(LinearLayout box,String hint,boolean secret) {
        EditText f=new EditText(this); f.setHint(hint); f.setSingleLine(true);
        f.setInputType(secret?InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_CLASS_TEXT);
        f.setSaveEnabled(false); box.addView(f); return f;
    }
    private void message(String s) { runOnUiThread(() -> status.setText(s)); }
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE,android.view.WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll=new ScrollView(this); LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(24,24,24,24); scroll.addView(box); setContentView(scroll);
        TextView title=new TextView(this); title.setText("Warkost Print Bridge UAT\nESC/POS LAN • Admin + Kitchen\nPengiriman bukan bukti kertas tercetak."); box.addView(title);
        status=new TextView(this); box.addView(status); status.setText(BridgeService.status);
        for(String station:new String[]{"ADMIN","KITCHEN"}) {
            TextView label=new TextView(this); label.setText(station); box.addView(label);
            EditText origin=field(box,"HTTPS origin aplikasi yang disetujui",false);
            EditText ip=field(box,"IP LAN printer "+station+" (port dari profil Owner)",false);
            EditText code=field(box,"Kode pairing Owner (5 menit)",true);
            Button pair=new Button(this); pair.setText("Pasangkan "+station); box.addView(pair);
            try {
                JSONObject saved=new JSONObject(new Vault(this).read("config-"+station));
                origin.setText(saved.optString("origin","")); ip.setText(saved.optString("ip",""));
                if(saved.has("deviceId")) { TextView device=new TextView(this); device.setText(station+" Device ID: "+saved.getString("deviceId")); device.setTextIsSelectable(true); box.addView(device); }
            } catch(Exception e) { message("Vault perlu diperiksa; jangan hapus data saat job belum selesai."); }
            pair.setOnClickListener(v -> {
                if(!pairing.compareAndSet(false,true)) { message("Pairing lain sedang berjalan"); return; }
                String host=origin.getText().toString().trim(), printer=ip.getText().toString().trim(), enrollment=code.getText().toString().trim();
                code.setText(""); pair.setEnabled(false);
                new Thread(() -> {
                    try {
                        if(BridgeService.running) throw new IllegalStateException("Stop bridge dahulu dan tunggu jurnal");
                        Vault vault=new Vault(this);
                        JSONObject pending=new JSONObject(vault.read("journal-"+station));
                        if(pending.has("id")) throw new IllegalStateException("Selesaikan jurnal lama dahulu");
                        if(!OnceSender.privateIPv4(printer)) throw new IllegalArgumentException();


                        JSONObject response=new AgentClient(host,null,station).call("enroll",new JSONObject().put("code",enrollment));
                        if(!station.equals(response.getString("station"))) throw new IllegalArgumentException();
                        response.put("origin",host).put("ip",printer);
                        vault.write("config-"+station,response.toString());
                        message(station+" dipasangkan. Device ID: "+response.getString("deviceId")+"\nBerlaku 7 hari; mulai bridge secara manual.");
                    } catch(Exception e) { message("Pairing gagal. Periksa origin HTTPS, kode/stasiun, profil Owner, dan jurnal lama. Tidak ada cetak."); }
                    finally { pairing.set(false); runOnUiThread(() -> pair.setEnabled(true)); }
                }).start();
            });
        }
        Button start=new Button(this); start.setText("Mulai bridge (foreground)"); box.addView(start);
        start.setOnClickListener(v -> {
            if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},80); message("Izinkan notifikasi, lalu tekan Mulai lagi."); return;
            }
            startForegroundService(new Intent(this,BridgeService.class)); message("Bridge dimulai. Buka Printer Center untuk status tiket.");
        });
        Button stop=new Button(this); stop.setText("Hentikan bridge"); box.addView(stop);
        stop.setOnClickListener(v -> { stopService(new Intent(this,BridgeService.class)); message("Bridge dihentikan; jurnal tetap tersimpan."); });
    }
}
