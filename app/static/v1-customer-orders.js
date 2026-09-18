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
  document.getElementById('userEmail').textContent=session.user.email||'';
  document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
  await load(session.user.id);
 }catch(e){document.getElementById('ordersMsg').innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}
async function load(uid){
 const {data,error}=await client.from('orders').select('id,order_number,order_status,subtotal,discount_total,delivery_fee,total_amount,delivery_address,estimated_delivery_minutes,created_at').eq('customer_id',uid).order('created_at',{ascending:false});
 if(error)throw error;
 const el=document.getElementById('orders');
 el.innerHTML=data?.length?data.map(o=>'<article class="card"><div class="section-title"><h2>'+esc(o.order_number)+'</h2><span class="badge">'+esc(labels[o.order_status]||o.order_status)+'</span></div><p>'+new Date(o.created_at).toLocaleString('id-ID')+'</p><p>'+esc(o.delivery_address)+'</p><div class="totals"><div><span>Subtotal</span><b>'+rupiah(o.subtotal)+'</b></div><div><span>Ongkir</span><b>'+rupiah(o.delivery_fee)+'</b></div><div class="grand"><span>Total</span><b>'+rupiah(o.total_amount)+'</b></div></div><a class="primary" href="/v1/customer/order?id='+encodeURIComponent(o.id)+'">Lihat tracking</a></article>').join(''):'<div class="card"><p>Belum ada pesanan.</p><a href="/v1/customer">Mulai pesan →</a></div>';
}
document.addEventListener('DOMContentLoaded',init);
})();