package com.warkost.printbridge;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted, fsynced atomic records in Android no-backup storage. */
public final class Vault {
    private final Context context;
    public Vault(Context c) { context=c; }
    private javax.crypto.SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if(!ks.containsAlias("print-bridge")) {
            KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("print-bridge",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        return (javax.crypto.SecretKey)ks.getKey("print-bridge",null);
    }
    private android.util.AtomicFile file(String name) {
        if(!name.matches("(config|journal)-(ADMIN|KITCHEN)")) throw new IllegalArgumentException();
        return new android.util.AtomicFile(new java.io.File(context.getNoBackupFilesDir(),name));
    }
    private String raw(String name) throws Exception {
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        try(java.io.FileInputStream in=file(name).openRead()) {
            byte[] bytes=new byte[1024]; int n;
            while((n=in.read(bytes))!=-1) { if(out.size()+n>16384) throw new java.io.IOException("Vault size"); out.write(bytes,0,n); }
        } catch(java.io.FileNotFoundException e) { return null; }
        return out.toString("UTF-8");
    }
    public synchronized String read(String name) throws Exception {
        String raw=raw(name); if(raw==null) return "{}";
        String[] a=raw.split(":"); Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(a[0],Base64.NO_WRAP)));
        c.updateAAD(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return new String(c.doFinal(Base64.decode(a[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);
    }
    public synchronized void write(String name,String value) throws Exception {
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE,key());
        c.updateAAD(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String raw=Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(c.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);
        android.util.AtomicFile f=file(name);java.io.FileOutputStream out=null;
        try {
            out=f.startWrite();out.write(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.getFD().sync();f.finishWrite(out);out=null;
            if(!raw.equals(raw(name))) throw new java.io.IOException("Journal commit failed");
        } catch(Exception e) { if(out!=null) f.failWrite(out); throw e; }
    }
}
