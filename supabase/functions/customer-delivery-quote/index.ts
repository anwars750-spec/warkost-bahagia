import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// JWT verification is enforced at the Edge Function gateway; application-level role validation remains below.
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) throw new Error("Authentication required");
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:u,error:ue}=await db.auth.getUser(auth.slice(7));
    if(ue||!u.user) throw new Error("Invalid authentication token");
    const {data:p,error:pe}=await db.from("profiles").select("role,is_active").eq("id",u.user.id).single();
    if(pe||!p||p.role!=="customer"||!p.is_active) throw new Error("Active customer profile required");
    const b=await req.json(),lat=Number(b?.latitude),lon=Number(b?.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) throw new Error("Valid delivery coordinates are required");
    const {data,error}=await db.rpc("server_customer_delivery_quote",{p_customer:u.user.id,p_latitude:lat,p_longitude:lon});
    if(error) throw error;
    return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json",...cors}});
  }catch(e){return new Response(JSON.stringify({error:e?.message||"Delivery quote failed"}),{status:400,headers:{"Content-Type":"application/json",...cors}});}
});