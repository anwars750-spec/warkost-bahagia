(function(){
let client;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const rupiah=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const labels={payment_pending:'Menunggu pembayaran',paid:'Dibayar',in_fulfillment:'Diproses',ready_for_pickup:'Siap diambil driver',out_for_delivery:'Dalam pengantaran',completed:'Selesai',cancelled:'Dibatalkan',expired:'Kedaluwarsa'};
async function init(){
 try{
  const cfg=await (await fetch('/api/v1/config')).json(); if(!cfg.url||!cfg.anon_key)throw Error('Supabase V1 belum dikonfigurasi.');
  client=supabase.createClient(cfg.url,cfg.anon_key);
  const {data:{session}}=await client.auth.getSession(); if(!session){location='/v1/login';return;}
  const userEmailEl=document.getElementById('userEmail');
  if(userEmailEl) userEmailEl.textContent=session.user.email||'';
  document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
  await load(session.user.id);
 }catch(e){document.getElementById('ordersMsg').innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}
async function load(uid){
 const {data,error}=await client.from('orders').select('id,order_number,order_status,subtotal,discount_total,delivery_fee,total_amount,delivery_address,estimated_delivery_minutes,created_at').eq('customer_id',uid).order('created_at',{ascending:false});
 if(error)throw error;
 const el=document.getElementById('orders');
 const statusClass=s=>['completed'].includes(s)?'done':['cancelled','expired','payment_pending'].includes(s)?'alert':'';
 el.innerHTML=data?.length?data.map(o=>'<article class="customer-order-card"><div class="order-card-top"><h2>'+esc(o.order_number)+'</h2><span class="order-status '+statusClass(o.order_status)+'">'+esc(labels[o.order_status]||o.order_status)+'</span></div><div class="order-card-date">'+new Date(o.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})+'</div><div class="order-card-address">📍 '+esc(o.delivery_address)+'</div><div class="order-card-total"><small>Total pesanan</small><strong>'+rupiah(o.total_amount)+'</strong></div><a class="order-card-button" href="/v1/customer/order?id='+encodeURIComponent(o.id)+'">Lihat detail & tracking</a></article>').join(''):'<div class="orders-empty"><div style="font-size:40px">☕</div><h2>Belum ada pesanan</h2><p>Yuk pilih menu favoritmu dan mulai pesan.</p><a class="order-card-button" href="/v1/customer">Mulai pesan</a></div>';
}
document.addEventListener('DOMContentLoaded',init);
})();