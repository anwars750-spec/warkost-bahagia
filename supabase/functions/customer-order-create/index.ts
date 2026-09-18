import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const b=await req.json();
    if(!Array.isArray(b?.items)||b.items.length===0) throw new Error("Order must contain at least one item");
    const address=String(b?.address||"").trim(),lat=Number(b?.latitude),lon=Number(b?.longitude);
    if(!address||!Number.isFinite(lat)||!Number.isFinite(lon)) throw new Error("Alamat dan lokasi delivery wajib valid");
    const {data,error}=await db.rpc("server_customer_delivery_order",{p_customer:u.user.id,p_items:b.items,p_address:address,p_latitude:lat,p_longitude:lon,p_notes:b?.notes?String(b.notes).trim():null});
    if(error) throw error;
    return new Response(JSON.stringify({order_id:data}),{status:200,headers:{"Content-Type":"application/json",...cors}});
  }catch(e){return new Response(JSON.stringify({error:e?.message||"Order creation failed"}),{status:400,headers:{"Content-Type":"application/json",...cors}});}
});