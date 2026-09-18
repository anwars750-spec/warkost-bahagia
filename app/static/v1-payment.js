(function(){
let client,orderId;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const rupiah=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const show=(t,type='error')=>document.getElementById('msg').innerHTML=t?'<div class="'+type+'">'+esc(t)+'</div>':'';
async function init(){try{
 const cfg=await (await fetch('/api/v1/config')).json();if(!cfg.url||!cfg.anon_key)throw Error('Supabase V1 belum dikonfigurasi.');
 client=supabase.createClient(cfg.url,cfg.anon_key);const {data:{session}}=await client.auth.getSession();if(!session){location='/v1/login';return;}
 document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
 orderId=new URLSearchParams(location.search).get('id');if(!orderId)throw Error('Order ID tidak ditemukan.');
 await load(session.user.id);
 client.channel('payment-'+orderId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'payments',filter:'order_id=eq.'+orderId},()=>load(session.user.id)).subscribe();
}catch(e){show(e.message||'Gagal memuat pembayaran.');}}
async function load(uid){
 const {data:o,error:oe}=await client.from('orders').select('id,order_number,total_amount,order_status').eq('id',orderId).eq('customer_id',uid).single();if(oe)throw oe;
 const {data:p,error:pe}=await client.from('payments').select('status,method,provider,amount,provider_reference,paid_at,expired_at,created_at').eq('order_id',orderId).single();if(pe)throw pe;
 document.getElementById('orderNumber').textContent=o.order_number;document.getElementById('summary').innerHTML='<div class="totals"><div class="grand"><span>Total</span><b>'+rupiah(o.total_amount)+'</b></div></div>';
 const box=document.getElementById('paymentBox');
 if(p.status==='pending'){
  box.innerHTML='<h2>QRIS</h2><p>Nominal: <b>'+rupiah(p.amount)+'</b></p><p>Status: <b>Menunggu pembayaran</b></p><button id="createPaymentBtn" class="primary">Siapkan Pembayaran</button><div id="paymentResult"></div><div class="card"><p>Payment provider akan mengembalikan instruksi pembayaran. Status PAID tetap hanya ditentukan oleh server.</p><a href="/v1/customer/order?id='+encodeURIComponent(orderId)+'">Lihat tracking</a></div>';
  document.getElementById('createPaymentBtn').onclick=createPayment;
 }else{
  const labels={paid:'Pembayaran terverifikasi',failed:'Pembayaran gagal',expired:'Pembayaran kedaluwarsa'};
  box.innerHTML='<h2>'+esc(labels[p.status]||p.status)+'</h2><p>Status pembayaran: <b>'+esc(p.status)+'</b></p><a href="/v1/customer/order?id='+encodeURIComponent(orderId)+'">Lihat tracking order</a>';
 }}
async function createPayment(){
 const btn=document.getElementById('createPaymentBtn'),result=document.getElementById('paymentResult');btn.disabled=true;btn.textContent='Menyiapkan...';
 try{const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Sesi login berakhir.');
 const res=await fetch('/api/payment/create',{method:'POST',headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId})});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Payment provider belum terhubung.');
 result.innerHTML='<div class="success"><b>Pembayaran siap.</b><p>Reference: '+esc(data.instruction?.reference||'-')+'</p></div>';
 }catch(e){result.innerHTML='<div class="error">'+esc(e.message||'Gagal menyiapkan pembayaran.')+'</div>';}
 finally{btn.disabled=false;btn.textContent='Siapkan Pembayaran';}}
document.addEventListener('DOMContentLoaded',init);
})();