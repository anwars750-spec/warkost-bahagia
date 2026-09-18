(function(){
let client,products=[],categories=[],cart=new Map(),activeCategory='all',mapState={map:null,marker:null,ready:false,autocomplete:null};

const rupiah=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
function showConfirm({subtotal,deliveryFee,total,items}){
 return new Promise(resolve=>{
  const old=document.getElementById('orderConfirmModal');if(old)old.remove();
  const itemHtml=items.map(x=>'<div class="confirm-item"><span>'+esc(x.product.name)+' × '+x.quantity+'</span><b>'+rupiah(Number(x.product.selling_price)*x.quantity)+'</b></div>').join('');
  const modal=document.createElement('div');modal.id='orderConfirmModal';modal.className='order-confirm-backdrop';
  modal.innerHTML='<div class="order-confirm" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"><div class="confirm-head"><div><small>KONFIRMASI PESANAN</small><h2 id="confirmTitle">Pesanan sudah benar?</h2></div><button type="button" id="confirmClose" aria-label="Tutup">×</button></div><div class="confirm-items">'+itemHtml+'</div><div class="confirm-total"><span>Subtotal</span><b>'+rupiah(subtotal)+'</b></div><div class="confirm-total"><span>Delivery</span><b>'+rupiah(deliveryFee)+'</b></div><div class="confirm-total grand"><span>Total</span><b>'+rupiah(total)+'</b></div><div class="confirm-actions"><button type="button" id="confirmCancel">Kembali</button><button type="button" id="confirmSubmit" class="primary">Ya, Lanjutkan / Buat Pesanan</button></div></div>';
  document.body.appendChild(modal);
  const close=v=>{modal.remove();resolve(v);};
  document.getElementById('confirmClose').onclick=()=>close(false);
  document.getElementById('confirmCancel').onclick=()=>close(false);
  document.getElementById('confirmSubmit').onclick=()=>close(true);
  modal.addEventListener('click',e=>{if(e.target===modal)close(false);});
 });
}
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function message(t,type='error'){document.getElementById('pageMsg').innerHTML=t?'<div class="'+type+'">'+esc(t)+'</div>':'';}
function getItems(){return [...cart.values()].map(x=>({product_id:x.product.id,quantity:x.quantity}));}
function totals(){let subtotal=0;cart.forEach(x=>subtotal+=Number(x.product.selling_price)*x.quantity);return {subtotal};}
async function edgeInvoke(path,payload){
 const {data:{session}}=await client.auth.getSession();
 if(!session?.access_token) throw new Error('Sesi login sudah berakhir. Silakan login kembali.');
 const res=await fetch('/api/v1/edge/'+path,{
  method:'POST',
  headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},
  body:JSON.stringify(payload||{})
 });
 let body={}; try{body=await res.json();}catch(_){}
 if(!res.ok) throw new Error(body.error||'Layanan server gagal.');
 return body;
}
async function quoteDelivery(lat,lon){
 return await edgeInvoke('delivery-quote',{latitude:lat,longitude:lon});
}
async function refreshQuote(){
 const feeEl=document.getElementById('deliveryFee');
 const t=totals(); feeEl.textContent='Menghitung...';
 const lat=Number(document.getElementById('lat').value),lon=Number(document.getElementById('lon').value);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)){feeEl.textContent='Pilih alamat';document.getElementById('total').textContent=rupiah(t.subtotal);return;}
 try{
  const q=await quoteDelivery(lat,lon);
  if(!q?.available) throw new Error(q?.message||'Lokasi di luar radius delivery.');
  feeEl.textContent=rupiah(q.delivery_fee);
  document.getElementById('total').textContent=rupiah(t.subtotal+Number(q.delivery_fee||0));
  document.getElementById('locationStatus').textContent='✓ Alamat valid • '+Number(q.distance_km||0).toFixed(2)+' km • '+(Number(q.delivery_fee||0)===0?'Gratis ongkir':rupiah(q.delivery_fee));
 }catch(e){feeEl.textContent='Tidak tersedia';document.getElementById('total').textContent=rupiah(t.subtotal);message(e.message||'Gagal menghitung ongkir.');}
}

async function init(){
 try{
  const cfg=await (await fetch('/api/v1/config')).json();
  if(!cfg.url||!cfg.anon_key)throw new Error('Supabase V1 belum dikonfigurasi di environment.');
  client=supabase.createClient(cfg.url,cfg.anon_key);
  const {data:{session}}=await client.auth.getSession();
  if(!session){location='/v1/login';return;}
  const {data:profile,error:pe}=await client.from('profiles').select('full_name,phone,role,is_active').eq('id',session.user.id).single();
  if(pe)throw pe;
  if(profile.role!=='customer'||!profile.is_active){await client.auth.signOut();throw new Error('Workspace ini hanya untuk customer aktif.');}
  document.getElementById('userEmail').textContent=session.user.email||'';
  document.getElementById('name').value=profile.full_name||'';
  document.getElementById('phone').value=profile.phone||'';
  document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
  await loadMenu();
  bindCustomerUI();
  await initMaps();
 }catch(e){message(e.message||'Gagal memuat Customer V1.');}
}

async function loadMenu(){
 const [{data:productData,error:productError},{data:categoryData,error:categoryError}]=await Promise.all([
  client.from('products').select('id,category_id,name,description,normal_price,selling_price,stock,image_url').eq('active',true).order('name'),
  client.from('categories').select('id,name,station,active').eq('active',true).order('name')
 ]);
 if(productError)throw productError;
 if(categoryError)throw categoryError;
 products=productData||[];categories=categoryData||[];
 renderCategories();renderMenu();renderCart();
}
function renderCategories(){
 const el=document.getElementById('categoryChips');if(!el)return;
 const counts=new Map(products.map(p=>[p.category_id,(products.find(x=>x.category_id===p.category_id)?products.filter(x=>x.category_id===p.category_id).length:0)]));
 const chips=[{id:'all',name:'Semua',count:products.length},...categories.map(c=>({id:c.id,name:c.name,count:counts.get(c.id)||0}))];
 el.innerHTML=chips.filter(c=>c.id==='all'||c.count>0).map(c=>'<button class="category-chip '+(activeCategory===String(c.id)?'active':'')+'" data-category="'+esc(c.id)+'">'+esc(c.name)+'</button>').join('');
 el.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.category;renderCategories();renderMenu();});
}
function renderMenu(){
 const query=(document.getElementById('menuSearch')?.value||'').trim().toLowerCase();
 const filtered=products.filter(p=>(activeCategory==='all'||String(p.category_id)===activeCategory)&&(!query||String(p.name+' '+(p.description||'')).toLowerCase().includes(query)));
 document.getElementById('productCount').textContent=filtered.length+' produk';
 document.getElementById('menu').innerHTML=filtered.map(p=>'<article class="customer-product">'+
 (p.image_url?'<img class="customer-product-image" src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'">':'<div class="customer-product-image product-placeholder">☕</div>')+
 '<div class="customer-product-body"><small>'+esc(categories.find(c=>c.id===p.category_id)?.name||'Menu')+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'')+'</p><div class="customer-product-foot"><b>'+rupiah(p.selling_price)+'</b><button '+(p.stock<1?'disabled':'')+' data-add="'+p.id+'">'+(p.stock<1?'Habis':'+')+'</button></div></div></article>').join('')||'<div class="customer-empty">Menu tidak ditemukan.</div>';
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
}
function add(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 const x=cart.get(id);const next=(x?.quantity||0)+1;
 if(next>p.stock){message('Jumlah '+p.name+' melebihi stock.');return;}
 cart.set(id,{product:p,quantity:next});renderCart();
}
function change(id,delta){
 const x=cart.get(id);if(!x)return;
 const next=x.quantity+delta;
 if(next<=0)cart.delete(id);
 else if(next<=x.product.stock)x.quantity=next;
 renderCart();
}
function renderCart(){
 const el=document.getElementById('cartItems');
 el.innerHTML=cart.size?[...cart.values()].map(x=>'<div class="cartrow"><div><b>'+esc(x.product.name)+'</b><br><small>'+rupiah(x.product.selling_price)+' × '+x.quantity+'</small></div><div class="qty"><button data-minus="'+x.product.id+'">−</button><b>'+x.quantity+'</b><button data-plus="'+x.product.id+'">+</button></div></div>').join(''):'<p>Keranjang kosong.</p>';
 document.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>change(b.dataset.minus,-1));
 document.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>change(b.dataset.plus,1));
 const t=totals();document.getElementById('subtotal').textContent=rupiah(t.subtotal);document.getElementById('total').textContent=rupiah(t.subtotal);
 const badge=document.getElementById('cartBadge');if(badge)badge.textContent=[...cart.values()].reduce((n,x)=>n+x.quantity,0);
 document.getElementById('deliveryFee').textContent='Dihitung saat checkout';
}
async function initMaps(){
 const cfg=await (await fetch('/api/maps/config')).json();
 const status=document.getElementById('locationStatus');
 if(!cfg.api_key){status.textContent='Google Maps belum dikonfigurasi. Checkout V1 membutuhkan alamat dari map.';return;}
 const script=document.createElement('script');script.async=true;script.defer=true;script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(cfg.api_key)+'&v=weekly&libraries=places,marker&loading=async';
 script.onload=()=>setupMaps(cfg);script.onerror=()=>status.textContent='Google Maps gagal dimuat.';
 document.head.appendChild(script);
}
async function setupMaps(cfg){
 const {Map}=await google.maps.importLibrary('maps');
 const {PlaceAutocompleteElement}=await google.maps.importLibrary('places');
 const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
 const center={lat:Number(cfg.cafe_latitude)||-6.9218,lng:Number(cfg.cafe_longitude)||106.9270};
 mapState.map=new Map(document.getElementById('map'),{center,zoom:14,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,mapId:'DEMO_MAP_ID'});
 mapState.autocomplete=new PlaceAutocompleteElement({includedRegionCodes:['id']});
 mapState.autocomplete.placeholder='Ketik alamat tujuan lalu pilih rekomendasi...';
 document.getElementById('addressSearch').appendChild(mapState.autocomplete);
 mapState.autocomplete.addEventListener('gmp-select',async({placePrediction})=>{
  const place=placePrediction.toPlace();await place.fetchFields({fields:['displayName','formattedAddress','location','viewport']});
  if(!place.location){message('Lokasi alamat tidak tersedia. Pilih rekomendasi lain.');return;}
  const lat=Number(place.location.lat()),lon=Number(place.location.lng());
  document.getElementById('address').value=place.formattedAddress||place.displayName||'';
  document.getElementById('lat').value=lat;document.getElementById('lon').value=lon;
  if(mapState.marker)mapState.marker.map=null;
  mapState.marker=new AdvancedMarkerElement({map:mapState.map,position:{lat,lng:lon},title:place.displayName||'Tujuan'});
  if(place.viewport)mapState.map.fitBounds(place.viewport);else{mapState.map.setCenter({lat,lng:lon});mapState.map.setZoom(17);}
  document.getElementById('locationStatus').textContent='Memvalidasi alamat...'; await refreshQuote();
 });
 mapState.ready=true;document.getElementById('locationStatus').textContent='Ketik alamat lalu pilih rekomendasi peta.';
}
async function createOrder(){
 message('');
 if(!cart.size){message('Keranjang masih kosong.');return;}
 const address=document.getElementById('address').value.trim(),lat=Number(document.getElementById('lat').value),lon=Number(document.getElementById('lon').value);
 if(!address||!Number.isFinite(lat)||!Number.isFinite(lon)){message('Pilih alamat dari rekomendasi peta terlebih dahulu.');return;}
 const items=getItems();
 const t=totals();
 let q;
 try{q=await quoteDelivery(lat,lon);if(!q?.available)throw new Error(q?.message||'Lokasi di luar radius delivery.');}
 catch(e){message(e.message||'Alamat tidak tersedia untuk delivery.');return;}
 const deliveryFee=Number(q.delivery_fee||0);
 const btn=document.getElementById('placeOrderBtn');
 const confirmed=await showConfirm({subtotal:t.subtotal,deliveryFee,total:t.subtotal+deliveryFee,items:[...cart.values()]});
 if(!confirmed)return;
 btn.disabled=true;btn.textContent='Membuat pesanan...';
 try{
  const created=await edgeInvoke('order-create',{items,address,latitude:lat,longitude:lon,notes:document.getElementById('notes').value.trim()||null});
  const data=created.order_id;
  const {data:order,error:oe}=await client.from('orders').select('order_number,subtotal,delivery_fee,total_amount,order_status').eq('id',data).single();
  if(oe)throw oe;
  cart.clear();renderCart();
  message('Pesanan '+order.order_number+' berhasil dibuat. Status pembayaran: PENDING. Total '+rupiah(order.total_amount)+'.','success');
  setTimeout(()=>{location='/v1/payment?id='+encodeURIComponent(data);},900);
 }catch(e){message(e.message||'Pesanan gagal dibuat.');}
 finally{btn.disabled=false;btn.textContent='Buat Pesanan';}
}
function bindCustomerUI(){
 document.getElementById('clearCartBtn').onclick=()=>{cart.clear();renderCart();};
 document.getElementById('placeOrderBtn').onclick=createOrder;
 document.getElementById('menuSearch').addEventListener('input',renderMenu);
 document.getElementById('cartNav').onclick=e=>{e.preventDefault();document.getElementById('cartSection').scrollIntoView({behavior:'smooth'});};
 document.getElementById('accountNav').onclick=()=>{document.getElementById('userEmail').scrollIntoView({behavior:'smooth',block:'center'});};
}
document.addEventListener('DOMContentLoaded',init);
})();