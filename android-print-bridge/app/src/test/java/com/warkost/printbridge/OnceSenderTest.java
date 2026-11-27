package com.warkost.printbridge;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class OnceSenderTest {
    static class Journal implements OnceSender.Journal {
        OnceSender.Pending p; String done=""; boolean diskFailure=false;
        public OnceSender.Pending pending() { return p; }
        public String completed() { return done; }
        public void save(OnceSender.Pending v) throws Exception { if(diskFailure) throw new IOException(); p=v; }
        public void finish(String key) { p=null; done=key; }
    }
    static class API implements OnceSender.Backend {
        OnceSender.Job job; int begins=0,acks=0; String outcome; boolean lostAck=false,lostBegin=false;
        API() throws Exception { byte[] b=new byte[]{27,64,65,10,29,86,0};job=new OnceSender.Job(1,"lease",b,OnceSender.sha(b)); }
        public OnceSender.Job claim() { return job; }
        public void begin(OnceSender.Job j) throws Exception { begins++; if(lostBegin) throw new IOException(); }
        public void ack(OnceSender.Job j,String o) throws Exception { acks++; outcome=o;if(lostAck) throw new IOException(); }
    }
    static class Printer implements OnceSender.Printer {
        int writes=0; boolean offline=false,partial=false;
        public OnceSender.Connection connect(OnceSender.Job job) throws Exception {
            if(offline) throw new IOException();
            return new OnceSender.Connection() {
                public void write(byte[] b) throws Exception { writes++; if(partial) throw new IOException(); }
                public void close() {}
            };
        }
    }
    @Test public void duplicateTickNeverSendsSameLeaseAgain() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();OnceSender s=new OnceSender(j,api,p);
        s.tick();s.tick();assertEquals(1,p.writes);assertEquals(1,api.begins);assertEquals("SENT",api.outcome);
    }
    @Test public void offlineDoesNotBeginAndReportsNoPhysicalPrint() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();p.offline=true;
        new OnceSender(j,api,p).tick();assertEquals(0,p.writes);assertEquals(0,api.begins);assertEquals("OFFLINE",api.outcome);
    }
    @Test public void crashAfterIntentNeverReplaysBytes() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();j.p=new OnceSender.Pending(api.job,"UNKNOWN");
        new OnceSender(j,api,p).tick();assertEquals(0,p.writes);assertEquals(0,api.begins);assertEquals("UNKNOWN",api.outcome);
    }
    @Test public void lostAckAndRestartOnlyResendsAck() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();api.lostAck=true;
        try {new OnceSender(j,api,p).tick();fail();}catch(IOException expected){}
        assertEquals("SENT",j.p.outcome);api.lostAck=false;
        new OnceSender(j,api,p).tick();assertEquals(1,p.writes);assertEquals(1,api.begins);assertEquals(2,api.acks);
    }
    @Test public void partialWriteOrLostBeginIsUncertain() throws Exception {
        for(boolean lostBegin:new boolean[]{false,true}) {
            Journal j=new Journal();API api=new API();Printer p=new Printer();p.partial=true;api.lostBegin=lostBegin;
            new OnceSender(j,api,p).tick();assertEquals("UNKNOWN",api.outcome);assertEquals(lostBegin?0:1,p.writes);
        }
    }
    @Test public void storageFailureBeforeBeginCannotPrint() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();j.diskFailure=true;
        try { new OnceSender(j,api,p).tick();fail(); } catch(IOException expected){}
        assertEquals(0,p.writes);assertEquals(0,api.begins);
    }
    @Test public void integrityAndPrivateAddressValidationFailClosed() throws Exception {
        Journal j=new Journal();API api=new API();Printer p=new Printer();api.job.digest="bad";
        try {new OnceSender(j,api,p).tick();fail();}catch(IOException expected){} assertEquals(0,p.writes);
        for(String ip:new String[]{"127.0.0.1","8.8.8.8","localhost","192.168.1.999","192.168.01.1","169.254.169.254"}) assertFalse(OnceSender.privateIPv4(ip));
        assertTrue(OnceSender.privateIPv4("192.168.1.10"));assertTrue(OnceSender.privateIPv4("172.16.0.2"));
    }
    @Test public void realSenderWritesEscPosToFakeTcpPrinterOnce() throws Exception {
        try(ServerSocket server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())) {
            ExecutorService worker=Executors.newSingleThreadExecutor();
            Future<byte[]> received=worker.submit(() -> {try(Socket s=server.accept()) {return s.getInputStream().readAllBytes();}});
            Journal j=new Journal();API api=new API();
            OnceSender.Printer printer=job -> {
                Socket s=new Socket(InetAddress.getLoopbackAddress(),server.getLocalPort());
                return new OnceSender.Connection() { public void write(byte[] b)throws Exception{s.getOutputStream().write(b);}public void close()throws IOException{s.close();}};
            };
            new OnceSender(j,api,printer).tick();new OnceSender(j,api,printer).tick();
            assertArrayEquals(api.job.bytes,received.get(5,TimeUnit.SECONDS));assertEquals(1,api.begins);worker.shutdownNow();
        }
    }
    @Test public void stationsUseIndependentJournalsAndDevices() throws Exception {
        Journal a=new Journal(),k=new Journal();API aa=new API(),ka=new API();Printer ap=new Printer(),kp=new Printer();
        new OnceSender(a,aa,ap).tick();new OnceSender(k,ka,kp).tick();assertEquals(1,ap.writes);assertEquals(1,kp.writes);
    }
    @Test public void stationMappingMustMatchOwnerPrivateAddress() throws Exception {
        OnceSender.verifyPrinter("192.168.1.10","192.168.1.10");
        for(String ip:new String[]{"192.168.1.11","8.8.8.8","localhost"}) {
            try { OnceSender.verifyPrinter("192.168.1.10",ip);fail(); }catch(IOException expected){}
        }
        try { OnceSender.verifyPrinter(null,"192.168.1.10");fail(); }catch(IOException expected){}
    }
    @Test public void configuredPortAndTimeoutReachRealTcpAdapterWithoutReplay() throws Exception {
        try(ServerSocket server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())) {
            ExecutorService worker=Executors.newSingleThreadExecutor();
            Future<byte[]> got=worker.submit(()->{try(Socket s=server.accept()){return s.getInputStream().readAllBytes();}});
            Journal journal=new Journal();API api=new API();
            api.job.endpoint=new OnceSender.Endpoint("ESC_POS_NETWORK","192.168.2.50",server.getLocalPort(),3000);
            OnceSender.Printer printer=OnceSender.tcp((host,port,timeout)->{
                assertEquals("192.168.2.50",host);assertEquals(server.getLocalPort(),port);assertEquals(3000,timeout);
                return new Socket(InetAddress.getLoopbackAddress(),port);
            });
            new OnceSender(journal,api,printer).tick();new OnceSender(journal,api,printer).tick();
            assertArrayEquals(api.job.bytes,got.get(5,TimeUnit.SECONDS));assertEquals(1,api.begins);worker.shutdownNow();
        }
    }
    @Test public void capabilityProfilesAreExplicitAndUnsupportedFeaturesAreRejected() throws Exception {
        OnceSender.verifyProfile(58,32,"A","CP437",0,"NONE","GS_V",3,2);
        OnceSender.verifyProfile(80,64,"B","CP858",19,"PARTIAL","GS_V_FEED",0,5);
        for(int port:new int[]{1,515,9200,65535}) assertEquals(port,new OnceSender.Endpoint("ESC_POS_NETWORK","10.0.0.2",port,5000).port);
        for(int port:new int[]{0,-1,65536}) {try{new OnceSender.Endpoint("ESC_POS_NETWORK","10.0.0.2",port,5000);fail();}catch(IllegalArgumentException expected){}}
        try{new OnceSender.Endpoint("USB","10.0.0.2",1234,5000);fail();}catch(IllegalArgumentException expected){}
        try{OnceSender.verifyProfile(58,64,"B","UTF8",-1,"FULL","RAW",4,1);fail();}catch(IOException expected){}
    }
    @Test public void copyBundleAndLostAckNeverResendTheConfiguredCopies() throws Exception {
        Journal journal=new Journal();API api=new API();Printer printer=new Printer();
        api.job.bytes="SALINAN 1/2\nSALINAN 2/2\n".getBytes(java.nio.charset.StandardCharsets.US_ASCII);api.job.digest=OnceSender.sha(api.job.bytes);
        api.lostAck=true;try{new OnceSender(journal,api,printer).tick();fail();}catch(IOException expected){}
        api.lostAck=false;new OnceSender(journal,api,printer).tick();assertEquals(1,printer.writes);assertEquals(1,api.begins);
    }
}
