(function(){
let client,orderId;
const labels={payment_pending:'Menunggu pembayaran',paid:'Pembayaran diterima',in_fulfillment:'Sedang diproses',ready_for_pickup:'Siap diambil driver',out_for_delivery:'Sedang diantar',completed:'Selesai',cancelled:'Dibatalkan',expired:'Kedaluwarsa'};
const paymentLabels={pending:'Menunggu pembayaran',paid:'Lunas',failed:'Gagal',expired:'Kedaluwarsa'};
const deliveryLabels={waiting_assignment:'Menunggu driver',assigned:'Driver ditugaskan',picked_up:'Sudah diambil driver',out_for_delivery:'Dalam pengantaran',delivered:'Terkirim',failed:'Pengantaran gagal'};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const rupiah=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
function msg(t,type='error'){document.getElementById('msg').innerHTML=t?'<div class="'+type+'">'+esc(t)+'</div>':'';}
function fmtDate(v){return v?new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'-';}
async function init(){
 try{
  const cfg=await (await fetch('/api/v1/config')).json(); if(!cfg.url||!cfg.anon_key)throw Error('Supabase V1 belum dikonfigurasi.');
  client=supabase.createClient(cfg.url,cfg.anon_key);
  const {data:{session}}=await client.auth.getSession();if(!session){location='/v1/login';return;}
  document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
  orderId=new URLSearchParams(location.search).get('id');if(!orderId)throw Error('Order ID tidak ditemukan.');
  await load(session.user.id);
  client.channel('customer-order-'+orderId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'id=eq.'+orderId},()=>load(session.user.id)).subscribe();
  client.channel('customer-delivery-'+orderId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'delivery_orders',filter:'order_id=eq.'+orderId},()=>load(session.user.id)).subscribe();
 }catch(e){msg(e.message||'Tracking gagal dimuat.');}
}
async function load(uid){
 const {data:o,error}=await client.from('orders').select('id,order_number,order_status,subtotal,discount_total,delivery_fee,total_amount,delivery_address,estimated_delivery_minutes,created_at').eq('id',orderId).eq('customer_id',uid).single();if(error)throw error;
 const {data:p}=await client.from('payments').select('status,method,provider_reference,paid_at,expired_at').eq('order_id',orderId).maybeSingle();
 const {data:d}=await client.from('delivery_orders').select('status,driver_id,estimated_minutes,assigned_at,picked_up_at,delivered_at,proof_photo').eq('order_id',orderId).maybeSingle();
 document.getElementById('orderNumber').textContent=o.order_number;document.getElementById('orderMeta').textContent=new Date(o.created_at).toLocaleString('id-ID');
 const orderStates=['payment_pending','paid','in_fulfillment','ready_for_pickup','out_for_delivery','completed'];
 const terminal=['cancelled','expired'];
 if(terminal.includes(o.order_status)){
   document.getElementById('statusTimeline').innerHTML='<div class="cartrow"><b>⚠ '+esc(labels[o.order_status]||o.order_status)+'</b><small>Order berhenti</small></div>';
 }
 const current=orderStates.indexOf(o.order_status);
 if(!terminal.includes(o.order_status)) document.getElementById('statusTimeline').innerHTML=orderStates.map((s,i)=>'<div class="cartrow"><span>'+(i<=current?'✓':'○')+' '+labels[s]+'</span><small>'+((i===current)?'Saat ini':'')+'</small></div>').join('');
 document.getElementById('summary').innerHTML='<div class="totals"><div><span>Subtotal</span><b>'+rupiah(o.subtotal)+'</b></div><div><span>Ongkir</span><b>'+rupiah(o.delivery_fee)+'</b></div><div class="grand"><span>Total</span><b>'+rupiah(o.total_amount)+'</b></div></div><p><b>Pembayaran:</b> '+esc(paymentLabels[p?.status]||'Belum tersedia')+'</p>';
 document.getElementById('delivery').innerHTML=d?'<p><b>Status:</b> '+esc(deliveryLabels[d.status]||d.status)+'</p><p><b>Alamat:</b> '+esc(o.delivery_address)+'</p><p><b>Estimasi:</b> '+Number(d.estimated_minutes||o.estimated_delivery_minutes||0)+' menit</p>':'<p>Data delivery belum dibuat. Delivery dibuat setelah pembayaran terverifikasi.</p>';
}
document.addEventListener('DOMContentLoaded',init);
})();