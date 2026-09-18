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
 document.getElementById('orderNumber').textContent=o.order_number;document.getElementById('orderMeta').textContent=new Date(o.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
 const states=['payment_pending','paid','in_fulfillment','ready_for_pickup','out_for_delivery','completed'];
 const current=states.indexOf(o.order_status), terminal=['cancelled','expired'].includes(o.order_status);
 if(terminal){document.getElementById('statusTimeline').innerHTML='<div class="timeline-row current"><div class="timeline-dot">!</div><div><strong>'+esc(labels[o.order_status]||o.order_status)+'</strong><small>Pesanan berhenti pada status ini.</small></div></div>';}
 else document.getElementById('statusTimeline').innerHTML='<div class="timeline">'+states.map((s,i)=>'<div class="timeline-row '+(i<current?'done ':'')+(i===current?'current':'')+'"><div class="timeline-dot">'+(i<current?'✓':i===current?'•':'○')+'</div><div><strong>'+labels[s]+'</strong><small>'+(i===current?'Status saat ini':i<current?'Sudah dilewati':'Menunggu')+'</small></div><div class="timeline-line"></div></div>').join('')+'</div>';
 document.getElementById('summary').innerHTML='<div class="tracking-info"><div><small>Total</small><strong>'+rupiah(o.total_amount)+'</strong></div><div><small>Subtotal</small><strong>'+rupiah(o.subtotal)+'</strong></div><div><small>Ongkir</small><strong>'+rupiah(o.delivery_fee)+'</strong></div><div><small>Pembayaran</small><strong>'+esc(paymentLabels[p?.status]||'Belum tersedia')+'</strong></div></div>';
 document.getElementById('delivery').innerHTML='<div class="tracking-info"><div><small>Status delivery</small><strong>'+esc(d?deliveryLabels[d.status]||d.status:'Menunggu pembayaran terverifikasi')+'</strong></div><div><small>Alamat</small><strong>📍 '+esc(o.delivery_address)+'</strong></div><div><small>Estimasi</small><strong>'+Number(d?.estimated_minutes||o.estimated_delivery_minutes||0)+' menit</strong></div>'+(d?.driver_id?'<div><small>Driver</small><strong>Driver sedang menangani pesananmu.</strong></div>':'')+'</div>';
}
document.addEventListener('DOMContentLoaded',init);
})();