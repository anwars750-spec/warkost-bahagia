package com.warkost.printbridge;

import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class AgentClient implements OnceSender.Backend {
    private final String origin, token, station, expectedPrinter;
    public AgentClient(String base,String bearer,String s) throws Exception { this(base,bearer,s,null); }
    public AgentClient(String base,String bearer,String s,String ip) throws Exception {
        URI u=new URI(base);
        if(!"https".equals(u.getScheme()) || u.getHost()==null || u.getUserInfo()!=null || u.getQuery()!=null || u.getFragment()!=null || !(u.getPath().isEmpty() || u.getPath().equals("/"))) throw new IllegalArgumentException("HTTPS origin required");
        origin=base.replaceAll("/$",""); token=bearer; station=s; expectedPrinter=ip;
    }
    public static class StaleLease extends java.io.IOException {}
    public JSONObject call(String action,JSONObject body) throws Exception {
        HttpsURLConnection c=(HttpsURLConnection)new URI(origin+"/api/print-bridge/"+action).toURL().openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(5000); c.setReadTimeout(5000);
        c.setRequestMethod("POST"); c.setDoOutput(true); c.setRequestProperty("Content-Type","application/json");
        if(token!=null) c.setRequestProperty("Authorization","Bearer "+token);
        try {
            try(java.io.OutputStream out=c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status=c.getResponseCode(); if(status==409) throw new StaleLease();
            if(status!=200) throw new java.io.IOException("Bridge HTTP "+status);
            try(java.io.InputStream in=c.getInputStream()) {
                java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream(); byte[] b=new byte[4096]; int n;
                while((n=in.read(b))!=-1) { if(out.size()+n>131072) throw new java.io.IOException("Response limit"); out.write(b,0,n); }
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally { c.disconnect(); }
    }
    public OnceSender.Job claim() throws Exception {
        JSONObject r=call("claim",new JSONObject()); if(r.isNull("job")) return null;
        JSONObject j=r.getJSONObject("job");
        if(!station.equals(j.getString("station")) || !("printer_"+station.toLowerCase(java.util.Locale.ROOT)).equals(j.getString("printerKey"))) throw new java.io.IOException("Station mismatch");
        OnceSender.verifyPrinter(expectedPrinter,j.getString("printerHost"));
        return new OnceSender.Job(j.getLong("id"),j.getString("lease"),Base64.getDecoder().decode(j.getString("bytes")),j.getString("sha256"));
    }
    private JSONObject request(OnceSender.Job j) throws Exception { return new JSONObject().put("id",j.id).put("lease",j.lease); }
    public void begin(OnceSender.Job j) throws Exception { call("begin",request(j)); }
    public void ack(OnceSender.Job j,String o) throws Exception { call("ack",request(j).put("outcome",o)); }
}
