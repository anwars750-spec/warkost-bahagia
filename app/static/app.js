const PROMOS=[
 {kicker:'PROMO COFFEE',title:'Diskon 10% untuk semua coffee.',text:'Nikmati kopi favoritmu lebih hemat hari ini.',image:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&fm=jpg&q=82&w=1200'},
 {kicker:'COMBO HARI INI',title:'Kopi + makanan, lebih hemat.',text:'Pasangkan kopi favorit dengan menu pilihan Warkost.',image:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&fm=jpg&q=82&w=1200'},
 {kicker:'HAPPY HOUR',title:'Teman ngopi, teman bahagia.',text:'Cek pilihan minuman dan menu favorit hari ini.',image:'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&fm=jpg&q=82&w=1200'}
];
let promoIndex=0,promoTimer=null;
function renderPromo(){
 const title=document.getElementById('promoTitle'),textEl=document.getElementById('promoText'),k=document.getElementById('promoKicker'),media=document.getElementById('promoMedia'),dots=document.getElementById('promoDots');
 if(!title||!textEl||!k||!media||!dots)return;
 const p=PROMOS[promoIndex]; k.textContent=p.kicker;title.textContent=p.title;textEl.textContent=p.text;media.style.backgroundImage="url('"+p.image+"')";
 dots.innerHTML=PROMOS.map((_,i)=>'<button type="button" class="'+(i===promoIndex?'active':'')+'" aria-label="Promo '+(i+1)+'" onclick="setPromo('+i+')"></button>').join('');
}
function setPromo(index){promoIndex=(index+PROMOS.length)%PROMOS.length;renderPromo();startPromoTimer();}
function startPromoTimer(){if(promoTimer)clearInterval(promoTimer);promoTimer=setInterval(()=>setPromo(promoIndex+1),6000);}

let products=[],cart=[],msgTimer=null,deliveryQuote=null,mapState={map:null,marker:null,autocomplete:null,ready:false};
const WHATSAPP_NUMBER='6281310358558';
function contactWhatsApp(){
 const message=encodeURIComponent('Halo Warkost Bahagia, saya ingin bertanya mengenai menu, pesanan, pembayaran, atau pengantaran.');
 window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+message,'_blank','noopener,noreferrer');
}
const rupiah=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
let activeCategory='Semua',menuQuery='';
async function loadCustomerLocation(){
 const textEl=document.getElementById('customerLocationText'),metaEl=document.getElementById('customerLocationMeta');
 if(!textEl)return;
 try{
  const r=await fetch('/api/customer/addresses'); const data=await r.json();
  if(!r.ok||!Array.isArray(data))throw new Error(data.error||'Gagal memuat alamat');
  if(data.length){
   const a=data[0];
   textEl.textContent=a.address||'Alamat pengantaran tersimpan';
   metaEl.textContent=(a.label||'Alamat customer')+' · tujuan pengantaran';
  }else{
   textEl.textContent='Belum ada alamat tersimpan';
   metaEl.textContent='Tambahkan alamat untuk pengantaran';
  }
 }catch(e){
  textEl.textContent='Belum ada alamat pengantaran';
  metaEl.textContent='Atur alamat di menu Akun';
 }
}
async function load(){
 try{
  const r=await fetch('/api/products');
  if(!r.ok)throw new Error('Menu API gagal dimuat');
  const data=await r.json();
  if(!Array.isArray(data))throw new Error('Format menu tidak valid');
  products=data;
  buildCategoryFilters();
  renderProducts();
  renderPromo();
  startPromoTimer();
  loadCustomerLocation();
 }catch(err){
  products=[];
  buildCategoryFilters();
  renderProducts();
  const empty=document.getElementById('emptyMenu');
  if(empty){empty.hidden=false;empty.innerHTML='<span>!</span><strong>Menu belum dapat dimuat</strong><small>Segarkan halaman dan coba lagi.</small>';}
  const mc=document.getElementById('menuCount');if(mc)mc.textContent='0 menu';
  console.error(err);
 }
}
const PRODUCT_IMAGES={
  "Nasi Goreng Warkost":"https://images.unsplash.com/photo-1707269714960-320c5d6f47b7?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=82&w=1200",
  "Ayam Geprek":"https://images.unsplash.com/photo-1696340034876-6245523babfa?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=82&w=1200",
  "Es Teh":"https://images.unsplash.com/photo-1741241858511-13978ec7a067?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=82&w=1200",
  "Kopi Susu":"https://images.unsplash.com/photo-1658042968025-a52811c3c606?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=82&w=1200"
};
function productImage(p){return PRODUCT_IMAGES[String(p?.name||'').trim()]||'';}
function buildCategoryFilters(){
  const el=document.getElementById('categoryFilters');if(!el)return;
  const cats=['Semua',...new Set(products.map(p=>String(p.category||'').trim()).filter(Boolean))];
  el.innerHTML=cats.map(c=>'<button type="button" class="'+(c===activeCategory?'active':'')+'" data-category="'+escapeHtml(c)+'" role="tab" aria-selected="'+(c===activeCategory)+'">'+escapeHtml(c)+'</button>').join('');
  el.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>setCategory(btn.dataset.category)));
}
function setCategory(category){activeCategory=String(category||'Semua').trim();buildCategoryFilters();renderProducts();}
function filterProducts(){const q=menuQuery.trim().toLowerCase(),active=activeCategory.toLowerCase();return products.filter(p=>(active==='semua'||String(p.category||'').trim().toLowerCase()===active)&&(!q||[p.name,p.description,p.category].some(v=>String(v||'').toLowerCase().includes(q))));}
function renderProducts(){
  const box=document.getElementById('products'),empty=document.getElementById('emptyMenu'),items=filterProducts();
  box.innerHTML=items.map(p=>{
    const image=productImage(p);
    const imageMarkup=image
      ? '<div class="product-art"><img src="'+image+'" alt="'+escapeHtml(p.name)+'" loading="lazy" decoding="async" onerror="this.closest(\'.product-art\').classList.add(\'image-fallback\');this.remove()"></div>'
      : '<div class="product-art image-fallback" aria-hidden="true"></div>';
    return '<article class="product">'+imageMarkup+
      '<span>'+escapeHtml(p.category||'Menu')+'</span>'+ 
      '<h3>'+escapeHtml(p.name)+'</h3>'+ 
      '<p>'+escapeHtml(p.description||'Pilihan menu Warkost Bahagia')+'</p>'+ 
      '<div class="product-bottom"><b>'+rupiah(p.price)+'</b><small>'+(p.stock<1?'Stok habis':'Tersedia')+'</small></div>'+ 
      '<button '+(p.stock<1?'disabled':'')+' onclick="add('+p.id+')">'+(p.stock<1?'Habis':'Tambah ke keranjang')+'</button>'+ 
      '</article>';
  }).join('');
  empty.hidden=items.length>0;const mc=document.getElementById('menuCount');if(mc)mc.textContent=items.length+' menu';
}
document.addEventListener('DOMContentLoaded',()=>{const s=document.getElementById('menuSearch');if(s)s.addEventListener('input',e=>{menuQuery=e.target.value;renderProducts();});});
function add(id){let x=cart.find(i=>i.product_id===id);let p=products.find(x=>x.id===id);if(!p)return;if(x){if(x.qty>=p.stock)return;x.qty++;}else cart.push({product_id:id,qty:1});render()}
function minus(id){let x=cart.find(i=>i.product_id===id);if(!x)return;x.qty--;if(x.qty<=0)cart=cart.filter(i=>i.product_id!==id);render()}
function plus(id){add(id)}
function totals(){let subtotal=cart.reduce((s,i)=>{let p=products.find(x=>x.id===i.product_id);return s+(p?p.price*i.qty:0)},0);let delivery=(deliveryQuote&&deliveryQuote.available)?Number(deliveryQuote.delivery_fee||0):0;return {subtotal,discount:0,delivery,total:subtotal+delivery}}
function render(){
  const cartCount=cart.reduce((a,b)=>a+b.qty,0);
  const legacyCount=document.getElementById('count'); if(legacyCount) legacyCount.textContent=cartCount;
  const hc=document.getElementById('headerCartCount'),sc=document.getElementById('shortcutCartCount'),mc=document.getElementById('mobileCartCount'),mt=document.getElementById('mobileCartTotal');
  if(hc) hc.textContent=cartCount; if(sc) sc.textContent=cartCount; if(mc) mc.textContent=cartCount;
  const box=document.getElementById('cartItems');
  if(box) box.innerHTML=cart.length ? cart.map(i=>{ const p=products.find(x=>x.id===i.product_id); if(!p)return ''; const sub=p.price*i.qty; return '<div class="cartrow"><div><b>'+escapeHtml(p.name)+'</b><br><small>'+rupiah(p.price)+' × '+i.qty+' = '+rupiah(sub)+'</small></div><div class="qty"><button type="button" onclick="minus('+i.product_id+')">−</button><b>'+i.qty+'</b><button type="button" onclick="plus('+i.product_id+')">+</button></div></div>'; }).join('') : '<p>Keranjang kosong.</p>';
  const t=totals();
  const sub=document.getElementById('subtotal'),disc=document.getElementById('discount'),del=document.getElementById('delivery'),total=document.getElementById('total');
  if(sub)sub.textContent=rupiah(t.subtotal); if(disc)disc.textContent='− '+rupiah(t.discount); if(del)del.textContent=rupiah(t.delivery); if(total)total.textContent=rupiah(t.total); if(mt)mt.textContent=rupiah(t.total);
}
function cartOpen(){document.getElementById('cart').classList.toggle('show');render()}

function openAccountPanel(){const p=document.getElementById('accountPanel');if(!p)return;p.classList.add('show');p.setAttribute('aria-hidden','false');}
function closeAccountPanel(){const p=document.getElementById('accountPanel');if(!p)return;p.classList.remove('show');p.setAttribute('aria-hidden','true');}
async function loadAccountSection(section){
 const box=document.getElementById('accountContent');if(!box)return;
 box.innerHTML='<p class="account-loading">Memuat...</p>';
 if(section==='orders'){
  const r=await fetch('/api/customer/orders');const data=await r.json();if(!r.ok){box.innerHTML='<div class="error">'+escapeHtml(data.error||'Gagal memuat riwayat.')+'</div>';return;}
  box.innerHTML='<span class="section-kicker">RIWAYAT TRANSAKSI</span><h3>Pesanan Kamu</h3>'+(data.length?data.map(o=>'<div class="account-order"><div><strong>'+escapeHtml(o.order_no)+'</strong><small>'+escapeHtml(o.created_at||'')+'</small></div><b>'+rupiah(o.total)+'</b><span class="order-status">'+escapeHtml(o.status||'')+'</span><button type="button" class="track-button" onclick="loadOrderTracking('+o.id+')">Lihat Status & Tracking →</button></div>').join(''):'<p>Belum ada transaksi.</p>');
 }else if(section==='addresses'){
  const r=await fetch('/api/customer/addresses');const data=await r.json();if(!r.ok){box.innerHTML='<div class="error">'+escapeHtml(data.error||'Gagal memuat alamat.')+'</div>';return;}
  box.innerHTML='<span class="section-kicker">ALAMAT</span><h3>Alamat Pengantaran</h3>'+(data.length?data.map(a=>'<div class="account-address"><strong>'+escapeHtml(a.label||'Alamat')+'</strong><p>'+escapeHtml(a.address)+'</p><button type="button" class="track-button" onclick="editCustomerAddress('+a.id+')">Gunakan alamat ini</button></div>').join(''):'<p>Belum ada alamat tersimpan.</p>')+'<form class="account-address-form" onsubmit="saveCustomerAddress(event)"><strong>Tambah alamat</strong><input id="addressLabel" placeholder="Label, contoh: Rumah" value="Rumah"><textarea id="addressValue" placeholder="Alamat lengkap" required></textarea><button class="primary" type="submit">Simpan Alamat</button><div id="addressMsg"></div></form>';
 }else if(section==='password'){
  box.innerHTML='<span class="section-kicker">KEAMANAN</span><h3>Ubah Password</h3><form class="account-password" onsubmit="changeAccountPassword(event)"><input id="currentPassword" type="password" placeholder="Password saat ini" required><input id="newPassword" type="password" placeholder="Password baru (min. 6 karakter)" minlength="6" required><input id="confirmPassword" type="password" placeholder="Ulangi password baru" minlength="6" required><button class="primary" type="submit">Simpan Password</button><div id="passwordMsg"></div></form>';
 }
}
async function saveCustomerAddress(e){
 e.preventDefault();const msg=document.getElementById('addressMsg'),address=document.getElementById('addressValue').value.trim(),label=document.getElementById('addressLabel').value.trim()||'Rumah';
 const r=await fetch('/api/customer/addresses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label,address})});const data=await r.json();
 msg.innerHTML='<div class="'+(r.ok?'success':'error')+'">'+escapeHtml(data.ok?'Alamat berhasil disimpan.':(data.error||'Gagal menyimpan alamat.'))+'</div>';
 if(r.ok){await loadCustomerLocation();await loadAccountSection('addresses');}
}
async function editCustomerAddress(id){
 const r=await fetch('/api/customer/addresses');const data=await r.json();const a=data.find(x=>x.id===id);if(!a)return;
 const v=document.getElementById('addressValue'),l=document.getElementById('addressLabel');if(v)v.value=a.address;if(l)l.value=a.label||'Rumah';v?.focus();
}
async function loadOrderTracking(id){
 const box=document.getElementById('accountContent');if(!box)return;
 const r=await fetch('/api/customer/orders/'+id+'/tracking');const data=await r.json();if(!r.ok){box.innerHTML='<div class="error">'+escapeHtml(data.error||'Tracking gagal dimuat.')+'</div>';return;}
 const t=data.tracking;box.innerHTML='<span class="section-kicker">STATUS PESANAN</span><h3>'+escapeHtml(t.label)+'</h3><div class="tracking-timeline">'+t.stages.map((s,i)=>'<div class="tracking-step '+(i<=t.stage_index?'done':'')+'"><span>'+(i<=t.stage_index?'✓':(i+1))+'</span><div><strong>'+escapeHtml(s.label)+'</strong><small>'+(i<t.stage_index?'Selesai':i===t.stage_index?'Status saat ini':'Menunggu')+'</small></div></div>').join('')+'</div><div class="tracking-address"><strong>'+escapeHtml(data.order.order_no)+'</strong><p>'+escapeHtml(data.order.address||'')+'</p><b>'+rupiah(data.order.total)+'</b></div><button type="button" class="track-button" onclick="loadAccountSection(&quot;orders&quot;)">← Kembali ke Riwayat</button>';
}
async function changeAccountPassword(e){e.preventDefault();const msg=document.getElementById('passwordMsg'),current=document.getElementById('currentPassword').value,newPass=document.getElementById('newPassword').value,confirm=document.getElementById('confirmPassword').value;if(newPass!==confirm){msg.innerHTML='<div class="error">Konfirmasi password tidak sama.</div>';return;}const r=await fetch('/api/customer/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:current,new_password:newPass})});const data=await r.json();msg.innerHTML='<div class="'+(r.ok?'success':'error')+'">'+escapeHtml(data.message||data.error||'Selesai.')+'</div>';if(r.ok)e.target.reset();}
function showMsg(html,ms=3000){const el=document.getElementById('msg');if(msgTimer)clearTimeout(msgTimer);el.innerHTML=html;if(ms>0)msgTimer=setTimeout(()=>{el.innerHTML=''},ms)}
function clearSelectedAddress(){document.getElementById('address').value='';document.getElementById('lat').value='';document.getElementById('lon').value='';deliveryQuote=null;document.getElementById('locationStatus').textContent='Alamat pengantaran belum dipilih.';render()}
async function initMaps(){
  const status=document.getElementById('locationStatus');
  try{
    const cfg=await (await fetch('/api/maps/config')).json();
    if(!cfg.api_key){initLocalTestMode(cfg);return;}
    const script=document.createElement('script');script.async=true;script.defer=true;script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(cfg.api_key)+'&v=weekly&libraries=places,marker&loading=async';
    script.onload=()=>setupGoogleMaps(cfg);script.onerror=()=>{status.textContent='Google Maps gagal dimuat. Periksa API key dan API yang diaktifkan.'};document.head.appendChild(script);
  }catch(e){status.textContent='Maps belum dapat dimuat.'}
}
function initLocalTestMode(cfg){
  const picker=document.getElementById('addressSearch');
  picker.innerHTML=`<div class="local-test-box"><b>MODE TEST LOKAL</b><small>Google Maps ditunda. Gunakan alamat manual + titik simulasi untuk menguji order, jarak, ongkir, radius, stok, dan alur pembayaran.</small><input id="manualTestAddress" placeholder="Contoh: Jl. Siliwangi, Sukabumi"><div class="test-distance-grid"><button type="button" onclick="setTestLocation(2)">Titik 2 km</button><button type="button" onclick="setTestLocation(5)">Titik 5 km</button><button type="button" onclick="setTestLocation(6)">Titik 6 km</button><button type="button" onclick="setTestLocation(8)">Titik 8 km</button><button type="button" onclick="setTestLocation(9)">Titik 9 km</button></div></div>`;
  const map=document.getElementById('map');map.innerHTML='<div class="local-map-placeholder">🗺️<br><b>Preview Map ditunda</b><br><small>Lokasi simulasi tetap dikirim sebagai koordinat order untuk pengujian backend.</small></div>';
  document.getElementById('locationStatus').textContent='Mode test lokal aktif. Masukkan alamat dan pilih titik simulasi.';
  window.testCafe={lat:Number(cfg.cafe_latitude),lon:Number(cfg.cafe_longitude)};
}
function destinationPoint(lat,lon,distanceKm,bearingDeg){const R=6371,br=bearingDeg*Math.PI/180,lat1=lat*Math.PI/180,lon1=lon*Math.PI/180,d=distanceKm/R;const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(br));const lon2=lon1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));return {lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}}
async function setTestLocation(distanceKm){
  const address=(document.getElementById('manualTestAddress')?.value||'').trim();
  if(!address){showMsg('<div class="error">Isi alamat manual terlebih dahulu.</div>');return}
  const p=destinationPoint(window.testCafe.lat,window.testCafe.lon,distanceKm,90);
  document.getElementById('address').value=address+' [TEST '+distanceKm.toFixed(1)+' km]';
  document.getElementById('lat').value=p.lat;document.getElementById('lon').value=p.lon;
  document.getElementById('locationStatus').textContent='Titik simulasi '+distanceKm.toFixed(1)+' km dipilih. Menghitung ongkir...';
  await refreshDeliveryQuote();
}
async function setupGoogleMaps(cfg){
  if(mapState.ready)return;
  try{
    const {Map}=await google.maps.importLibrary('maps');
    const {PlaceAutocompleteElement}=await google.maps.importLibrary('places');
    const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
    const center={lat:Number(cfg.cafe_latitude)||-6.9218,lng:Number(cfg.cafe_longitude)||106.9270};
    mapState.map=new Map(document.getElementById('map'),{center,zoom:14,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,mapId:'DEMO_MAP_ID'});
    mapState.autocomplete=new PlaceAutocompleteElement({includedRegionCodes:['id']});
    mapState.autocomplete.placeholder='Ketik alamat tujuan pengantaran...';
    if(cfg.cafe_location_verified){mapState.autocomplete.locationBias={radius:50000,center};}
    document.getElementById('addressSearch').appendChild(mapState.autocomplete);
    mapState.autocomplete.addEventListener('gmp-select',async({placePrediction})=>{
      try{
        const place=placePrediction.toPlace();
        await place.fetchFields({fields:['displayName','formattedAddress','location','viewport']});
        if(!place.location){showMsg('<div class="error">Lokasi alamat tidak tersedia. Pilih rekomendasi lain.</div>');return}
        const lat=Number(place.location.lat()),lon=Number(place.location.lng());
        document.getElementById('address').value=place.formattedAddress||place.displayName||'';
        document.getElementById('lat').value=lat;document.getElementById('lon').value=lon;
        if(mapState.marker)mapState.marker.map=null;
        mapState.marker=new AdvancedMarkerElement({map:mapState.map,position:{lat,lng:lon},title:place.displayName||'Tujuan pengantaran'});
        if(place.viewport)mapState.map.fitBounds(place.viewport);else{mapState.map.setCenter({lat,lng:lon});mapState.map.setZoom(17)}
        document.getElementById('locationStatus').textContent='✓ Alamat dipilih: '+(place.formattedAddress||place.displayName||'Tujuan pengantaran');
        await refreshDeliveryQuote();
      }catch(e){showMsg('<div class="error">Alamat tidak dapat diproses. Pilih rekomendasi peta lain.</div>')}
    });
    mapState.ready=true;
    status.textContent='Ketik alamat lalu pilih rekomendasi peta.';
  }catch(e){status.textContent='Google Maps gagal diinisialisasi. Pastikan Maps JavaScript API dan Places API (New) aktif.'}
}
async function refreshDeliveryQuote(){const lat=Number(document.getElementById('lat').value),lon=Number(document.getElementById('lon').value);if(!Number.isFinite(lat)||!Number.isFinite(lon)){deliveryQuote=null;render();return}try{const r=await fetch('/api/delivery/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:lat,longitude:lon})});const d=await r.json();if(!r.ok){deliveryQuote={available:false,error:d.error||'Lokasi di luar area layanan.'};showMsg('<div class="error">'+deliveryQuote.error+'</div>');render();return}deliveryQuote=d;const text=d.delivery_fee===0?`✓ ${d.distance_km} km • Gratis ongkir`:`✓ ${d.distance_km} km • Ongkir ${rupiah(d.delivery_fee)}`;document.getElementById('locationStatus').textContent=text;render();showMsg(`<div class="success">${text}</div>`,3500)}catch(err){deliveryQuote=null;render();showMsg('<div class="error">Tidak dapat menghitung ongkir. Coba lagi.</div>')}}
function buildConfirmSummary(){
  const t=totals();
  const name=(document.getElementById('name').value||'').trim();
  const phone=(document.getElementById('phone').value||'').trim();
  const address=(document.getElementById('address').value||'').trim();
  const items=cart.map(i=>{const p=products.find(x=>x.id===i.product_id);return p?`<div><span>${escapeHtml(p.name)} × ${i.qty}</span><b>${rupiah(p.price*i.qty)}</b></div>`:''}).join('');
  return `<div class="summary-section"><b>Customer</b><p>${escapeHtml(name)} · ${escapeHtml(phone)}</p></div><div class="summary-section"><b>Alamat pengantaran</b><p>${escapeHtml(address)}</p></div><div class="summary-section"><b>Pesanan</b>${items}</div><div class="summary-totals"><div><span>Subtotal</span><b>${rupiah(t.subtotal)}</b></div><div><span>Delivery</span><b>${rupiah(t.delivery)}</b></div><div class="summary-grand"><span>Total</span><b>${rupiah(t.total)}</b></div></div>`;
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function openConfirm(){document.getElementById('confirmSummary').innerHTML=buildConfirmSummary();document.getElementById('confirmModal').hidden=false;}
function closeConfirm(){document.getElementById('confirmModal').hidden=true;}
function openOrderProcess(orderNo,total,status='confirmed'){document.getElementById('orderProcessContent').innerHTML=`<div class="process-order-no">${escapeHtml(orderNo)}</div><div class="process-total">Total ${rupiah(total)}</div><div class="process-steps"><div class="active"><strong>✓ Order dibuat</strong><span>Pesanan diterima sistem</span></div><div class="active"><strong>✓ Pembayaran</strong><span>PAID (demo)</span></div><div><strong>Kitchen</strong><span>Menunggu diproses</span></div><div><strong>Delivery</strong><span>Menunggu penugasan driver</span></div></div>`;document.getElementById('orderProcessModal').hidden=false;}
function closeOrderProcess(){document.getElementById('orderProcessModal').hidden=true;}
async function checkout(){
  const nameEl=document.getElementById('name'),phoneEl=document.getElementById('phone'),addressEl=document.getElementById('address'),latEl=document.getElementById('lat'),lonEl=document.getElementById('lon');
  showMsg('',0);
  if(!cart.length){showMsg('<div class="error">Keranjang kosong.</div>');return}
  const customerName=(nameEl.value||'').trim(),customerPhone=(phoneEl.value||'').trim(),customerAddress=(addressEl.value||'').trim(),latitude=latEl.value!==''?Number(latEl.value):null,longitude=lonEl.value!==''?Number(lonEl.value):null;
  if(!customerName||!customerPhone){showMsg('<div class="error">Nama dan HP aktif wajib diisi.</div>');return}
  if(!customerAddress||latitude===null||longitude===null||!Number.isFinite(latitude)||!Number.isFinite(longitude)){showMsg('<div class="error">Pilih alamat pengantaran terlebih dahulu.</div>');return}
  await refreshDeliveryQuote();
  if(!deliveryQuote||deliveryQuote.available!==true){showMsg('<div class="error">Alamat belum dapat digunakan untuk pengantaran.</div>');return}
  openConfirm();
}
async function confirmCheckout(){
  closeConfirm();
  const name=(document.getElementById('name').value||'').trim(),phone=(document.getElementById('phone').value||'').trim(),address=(document.getElementById('address').value||'').trim(),latitude=Number(document.getElementById('lat').value),longitude=Number(document.getElementById('lon').value);
  const payload={items:cart,name,phone,address,latitude,longitude};
  try{
    const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();
    if(r.status===401){window.location='/login';return}
    if(!r.ok){showMsg('<div class="error">'+escapeHtml(d.error||'Order gagal dibuat.')+'</div>');return}
    const pay=await fetch('/api/simulate-payment/'+d.order_id,{method:'POST'});
    if(!pay.ok){showMsg('<div class="error">Order dibuat, tetapi pembayaran demo gagal.</div>');return}
    openOrderProcess(d.order_no,d.total,'confirmed');
    cart=[];deliveryQuote=null;clearSelectedAddress();render();load();
  }catch(err){showMsg('<div class="error">Tidak dapat terhubung ke server. Coba lagi.</div>')}
}
load();initMaps();
