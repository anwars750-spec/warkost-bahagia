const PROMOS=[
 {kicker:'PROMO COFFEE',title:'Diskon 10% untuk semua coffee.',text:'Nikmati kopi favoritmu lebih hemat hari ini.',image:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&fm=jpg&q=82&w=1200'},
 {kicker:'COMBO HARI INI',title:'Kopi + makanan, lebih hemat.',text:'Pasangkan kopi favorit dengan menu pilihan Warkost.',image:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&fm=jpg&q=82&w=1200'},
 {kicker:'HAPPY HOUR',title:'Teman ngopi, teman bahagia.',text:'Cek pilihan minuman dan menu favorit hari ini.',image:'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&fm=jpg&q=82&w=1200'}
];
let promoIndex=0,promoTimer=null;
let customerPromos=[];
async function loadCustomerPromos(){
 try{
  const r=await fetch('/api/customer/promotions');
  const d=await r.json();
  if(r.ok&&Array.isArray(d)&&d.length){
    customerPromos=d.map((p,i)=>({
      kicker:'VOUCHER '+(p.type==='percent'?p.value+'%':'HEMAT'),
      title:p.type==='percent'?'Hemat '+p.value+'% dengan '+p.code:'Potongan '+rupiah(p.value)+' dengan '+p.code,
      text:p.min_order>0?'Min. transaksi '+rupiah(p.min_order):'Bisa digunakan untuk menu pilihan Warkost.',
      image:PROMOS[i%PROMOS.length].image,
      code:p.code
    }));
  }
 }catch(e){ customerPromos=[]; }
}
function promoItems(){return customerPromos.length?customerPromos:PROMOS;}
function renderPromo(){
 const title=document.getElementById('promoTitle'),textEl=document.getElementById('promoText'),k=document.getElementById('promoKicker'),media=document.getElementById('promoMedia'),dots=document.getElementById('promoDots');
 if(!title||!textEl||!k||!media||!dots)return;
 const list=promoItems(); if(promoIndex>=list.length)promoIndex=0;
 const p=list[promoIndex]; k.textContent=p.kicker;title.textContent=p.title;textEl.textContent=p.text;media.style.backgroundImage="url('"+p.image+"')";
 dots.innerHTML=list.map((_,i)=>'<button type="button" class="'+(i===promoIndex?'active':'')+'" aria-label="Promo '+(i+1)+'" onclick="setPromo('+i+')"></button>').join('');
}
function setPromo(index){const list=promoItems();promoIndex=(index+list.length)%list.length;renderPromo();startPromoTimer();}
function startPromoTimer(){if(promoTimer)clearInterval(promoTimer);promoTimer=setInterval(()=>setPromo(promoIndex+1),6000);}
function setPromo(index){promoIndex=(index+PROMOS.length)%PROMOS.length;renderPromo();startPromoTimer();}
function startPromoTimer(){if(promoTimer)clearInterval(promoTimer);promoTimer=setInterval(()=>setPromo(promoIndex+1),6000);}

let products=[],cart=[],msgTimer=null,deliveryQuote=null,mapState={map:null,marker:null,autocomplete:null,ready:false};
let savedAddresses=[],selectedSavedAddressId=null,accountMapState={map:null,marker:null,autocomplete:null,ready:false};
const WHATSAPP_NUMBER='6281310358558';
function contactWhatsApp(){
 const message=encodeURIComponent('Halo Warkost Bahagia, saya ingin bertanya mengenai menu, pesanan, pembayaran, atau pengantaran.');
 window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+message,'_blank','noopener,noreferrer');
}
const rupiah=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
let activeCategory='Semua',menuQuery='';
function productPricing(p){const sale=Number(p?.price||0),normal=Math.max(sale,Number(p?.normal_price||sale));const pct=normal>sale?Math.round((1-sale/normal)*100):0;return {sale,normal,pct,discounted:pct>0};}
async function loadSavedAddresses(){
 try{
  const r=await fetch('/api/customer/addresses');const data=await r.json();
  if(!r.ok||!Array.isArray(data))throw new Error(data.error||'Gagal memuat alamat');
  savedAddresses=data;
  renderSavedAddressPicker();
  return data;
 }catch(e){savedAddresses=[];renderSavedAddressPicker();return [];}
}
function renderSavedAddressPicker(){
 const el=document.getElementById('savedAddressPicker');if(!el)return;
 if(!savedAddresses.length){
  el.innerHTML='<div class="saved-address-empty"><strong>Belum ada alamat tersimpan</strong><small>Alamat pertama yang kamu pilih di checkout akan otomatis disimpan ke Akun.</small></div>';
  return;
 }
 el.innerHTML='<div class="saved-address-title"><strong>Gunakan alamat tersimpan</strong><small>Pilih alamat akun atau masukkan alamat baru.</small></div>'+
 savedAddresses.map(a=>'<button type="button" class="saved-address-option '+(selectedSavedAddressId===a.id?'active':'')+'" onclick="selectSavedAddress('+a.id+')"><span class="saved-address-icon">⌖</span><span><strong>'+escapeHtml(a.label||'Alamat')+'</strong><small>'+escapeHtml(a.address)+'</small></span><b>→</b></button>').join('')+
 '<button type="button" class="saved-address-new" onclick="startNewCartAddress()">+ Gunakan alamat baru</button>';
}
function selectSavedAddress(id){
 const a=savedAddresses.find(x=>x.id===id);if(!a)return;
 selectedSavedAddressId=a.id;
 const address=document.getElementById('address'),lat=document.getElementById('lat'),lon=document.getElementById('lon');
 if(address)address.value=a.address||'';if(lat)lat.value=a.latitude??'';if(lon)lon.value=a.longitude??'';
 const status=document.getElementById('locationStatus');
 if(status)status.textContent=a.latitude!=null&&a.longitude!=null?'✓ '+(a.label||'Alamat tersimpan')+' dipilih.':'Alamat tersimpan belum memiliki titik maps.';
 renderSavedAddressPicker();
 if(a.latitude!=null&&a.longitude!=null)refreshDeliveryQuote();
}
function startNewCartAddress(){
 selectedSavedAddressId=null;
 ['address','lat','lon'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
 const status=document.getElementById('locationStatus');if(status)status.textContent='Masukkan alamat baru dan pilih rekomendasi peta.';
 renderSavedAddressPicker();
 const picker=document.querySelector('#addressSearch input');picker?.focus();
}
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
  await loadCustomerPromos();
  renderPromo();
  startPromoTimer();
  await loadSavedAddresses();
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
  const favorites=items.filter(p=>p.is_favorite),regular=items.filter(p=>!p.is_favorite);
  const card=p=>{
    const image=productImage(p),pricing=productPricing(p);
    const imageMarkup=image
      ? '<div class="product-art"><img src="'+image+'" alt="'+escapeHtml(p.name)+'" loading="lazy" decoding="async"></div>'
      : '<div class="product-art image-fallback" aria-hidden="true"></div>';
    const priceMarkup=pricing.discounted
      ? '<div class="product-price"><span class="price-old">'+rupiah(pricing.normal)+'</span><b>'+rupiah(pricing.sale)+'</b><span class="discount-badge">'+pricing.pct+'% OFF</span></div>'
      : '<div class="product-price"><b>'+rupiah(pricing.sale)+'</b></div>';
    return '<article class="product">'+imageMarkup+'<span class="product-category">'+escapeHtml(p.category||'Menu')+(p.is_favorite?' <b class="favorite-star" title="Menu favorit" aria-label="Menu favorit">★</b>':'')+'</span><h3>'+escapeHtml(p.name)+'</h3><p>'+escapeHtml(p.description||'Pilihan menu Warkost Bahagia')+'</p><div class="product-bottom">'+priceMarkup+'<small>'+(p.stock<1?'Stok habis':'Tersedia')+'</small></div><div class="product-actions"><button type="button" class="secondary product-detail-button" onclick="openProductDetail('+p.id+')">Detail</button><button '+(p.stock<1?'disabled':'')+' onclick="add('+p.id+')">'+(p.stock<1?'Habis':'Tambah ke keranjang')+'</button></div></article>';
  };
  let markup='';
  if(favorites.length) markup+='<div class="menu-group menu-favorites-group"><div class="menu-group-heading"><span class="section-kicker">MENU FAVORIT</span><h3>Pilihan Favorit</h3><small>Menu yang ditandai ⭐ oleh admin.</small></div><div class="menu-group-grid">'+favorites.map(card).join('')+'</div></div>';
  const groups={};
  regular.forEach(p=>{const key=String(p.category||'Menu').trim()||'Menu';(groups[key] ||= []).push(p);});
  const categories=Object.keys(groups);
  categories.forEach(cat=>{
    const heading=(favorites.length||categories.length>1)?'<div class="menu-group-heading"><span class="section-kicker">KATEGORI</span><h3>'+escapeHtml(cat)+'</h3></div>':'';
    markup+='<div class="menu-group menu-regular-group">'+heading+'<div class="menu-group-grid">'+groups[cat].map(card).join('')+'</div></div>';
  });
  box.innerHTML=markup; empty.hidden=items.length>0; const mc=document.getElementById('menuCount'); if(mc)mc.textContent=items.length+' menu';
}
document.addEventListener('DOMContentLoaded',()=>{const s=document.getElementById('menuSearch');if(s)s.addEventListener('input',e=>{menuQuery=e.target.value;renderProducts();});});
function add(id){if(document.body?.dataset.authenticated!=='true'){window.location.href='/login?next=/';return;}let x=cart.find(i=>i.product_id===id);let p=products.find(x=>x.id===id);if(!p)return;if(x){if(x.qty>=p.stock)return;x.qty++;}else cart.push({product_id:id,qty:1});render()}
function minus(id){let x=cart.find(i=>i.product_id===id);if(!x)return;x.qty--;if(x.qty<=0)cart=cart.filter(i=>i.product_id!==id);render()}
function plus(id){add(id)}
let appliedPromo=null;
function totals(){let subtotal=cart.reduce((s,i)=>{let p=products.find(x=>x.id===i.product_id);return s+(p?productPricing(p).sale*i.qty:0)},0);let delivery=(deliveryQuote&&deliveryQuote.available)?Number(deliveryQuote.delivery_fee||0):0;let discount=Number(appliedPromo?.discount||0);return {subtotal,discount,delivery,total:Math.max(0,subtotal+delivery-discount)}}
function render(){
  const cartCount=cart.reduce((a,b)=>a+b.qty,0);
  const legacyCount=document.getElementById('count'); if(legacyCount) legacyCount.textContent=cartCount;
  const hc=document.getElementById('headerCartCount'),sc=document.getElementById('shortcutCartCount'),mc=document.getElementById('mobileCartCount'),mt=document.getElementById('mobileCartTotal');
  if(hc) hc.textContent=cartCount; if(sc) sc.textContent=cartCount; if(mc) mc.textContent=cartCount;
  const box=document.getElementById('cartItems');
  if(box) box.innerHTML=cart.length ? cart.map(i=>{ const p=products.find(x=>x.id===i.product_id); if(!p)return ''; const pricing=productPricing(p); const sub=pricing.sale*i.qty; return '<div class="cartrow"><div><b>'+escapeHtml(p.name)+'</b><br><small>'+(pricing.discounted?'<s>'+rupiah(pricing.normal)+'</s> → ':'')+rupiah(pricing.sale)+' × '+i.qty+' = '+rupiah(sub)+'</small></div><div class="qty"><button type="button" onclick="minus('+i.product_id+')">−</button><b>'+i.qty+'</b><button type="button" onclick="plus('+i.product_id+')">+</button></div></div>'; }).join('') : '<p>Keranjang kosong.</p>';
  const t=totals();
  const sub=document.getElementById('subtotal'),disc=document.getElementById('discount'),del=document.getElementById('delivery'),total=document.getElementById('total');
  if(sub)sub.textContent=rupiah(t.subtotal); if(disc)disc.textContent='− '+rupiah(t.discount); if(del)del.textContent=rupiah(t.delivery); if(total)total.textContent=rupiah(t.total); if(mt)mt.textContent=rupiah(t.total);
}
function cartOpen(){
  if(document.body?.dataset.authenticated!=='true'){window.location.href='/login?next=/';return;}
  const cartEl=document.getElementById('cart');
  if(!cartEl)return;
  const open=!cartEl.classList.contains('show');
  cartEl.classList.toggle('show',open);
  syncCustomerSurfaceBackdrop();
  if(open)render();
}

function openProductDetail(id){
 const p=products.find(x=>x.id===id); const box=document.getElementById('productDetailContent'); const modal=document.getElementById('productDetailModal');
 if(!p||!box||!modal)return;
 const pricing=productPricing(p),image=productImage(p);
 const imageHtml=image?'<img class="product-detail-image" src="'+image+'" alt="'+escapeHtml(p.name)+'">':'<div class="product-detail-image image-fallback"></div>';
 box.innerHTML=imageHtml+
   '<div class="product-detail-copy"><span class="section-kicker">'+escapeHtml(p.category||'MENU')+(p.is_favorite?' · ★ FAVORIT':'')+'</span>'+
   '<h2 id="productDetailTitle">'+escapeHtml(p.name)+'</h2><p>'+escapeHtml(p.description||'Pilihan menu Warkost Bahagia')+'</p>'+
   (pricing.discounted?'<div class="detail-pricing"><s>'+rupiah(pricing.normal)+'</s><strong>'+rupiah(pricing.sale)+'</strong><span>'+pricing.pct+'% OFF</span></div>':'<div class="detail-pricing"><strong>'+rupiah(pricing.sale)+'</strong></div>')+
   '<div class="detail-stock">'+(p.stock>0?'✓ Tersedia · Stok '+p.stock:'Habis')+'</div>'+
   '<button type="button" class="primary detail-add" '+(p.stock<1?'disabled':'')+' onclick="add('+p.id+');closeProductDetail();cartOpen()">'+(p.stock<1?'Menu habis':'Tambah ke keranjang')+' <span>→</span></button></div>';
 modal.hidden=false;
}
function closeProductDetail(){const m=document.getElementById('productDetailModal');if(m)m.hidden=true;}

async function openVoucherCenter(){
 const modal=document.getElementById('voucherCenterModal'),box=document.getElementById('voucherCenterContent');if(!modal||!box)return;
 modal.hidden=false;box.innerHTML='<div class="notification-loading"><span>⏳</span><strong>Memuat voucher...</strong><small>Mengecek promo yang sedang aktif.</small></div>';
 try{
  const r=await fetch('/api/customer/promotions');const data=await r.json();
  if(!r.ok)throw new Error(data.error||'Gagal memuat voucher');
  if(!data.length){box.innerHTML='<div class="notification-empty"><span>🎟️</span><strong>Belum ada voucher aktif</strong><small>Voucher baru akan muncul di sini saat tersedia.</small></div>';return;}
  box.innerHTML='<div class="voucher-list">'+data.map(p=>{
    const value=p.type==='percent'?p.value+'% OFF':rupiah(p.value)+' OFF';
    const safeCode=escapeHtml(String(p.code||'')).replace(/'/g,'&#39;');
    return '<article class="voucher-card"><div class="voucher-main"><span class="voucher-code">'+escapeHtml(p.code)+'</span><strong>'+value+'</strong><small>'+(p.min_order>0?'Min. transaksi '+rupiah(p.min_order):'Tanpa minimum transaksi')+(p.max_discount?' · Maks. '+rupiah(p.max_discount):'')+'</small></div><button type="button" class="voucher-use-button" data-voucher-code="'+safeCode+'">Gunakan</button></article>';
  }).join('')+'</div>';
 }catch(e){box.innerHTML='<div class="notification-empty"><span>⚠</span><strong>Voucher belum dapat dimuat</strong><small>Coba lagi beberapa saat.</small></div>';}
}
async function useVoucherCode(code){
 const normalized=String(code||'').trim().toUpperCase();
 if(!normalized)return;
 const input=document.getElementById('promoCode');
 closeVoucherCenter();
 if(input){
   input.value=normalized;
   input.focus();
   await claimVoucher();
 }
}
function closeVoucherCenter(){const m=document.getElementById('voucherCenterModal');if(m)m.hidden=true;}
document.addEventListener('click',e=>{
 const button=e.target.closest?.('.voucher-use-button');
 if(button){
   e.preventDefault();
   e.stopPropagation();
   useVoucherCode(button.dataset.voucherCode||'');
 }
});


async function loadOrderDetail(id){
 stopTrackingCapacityRefresh();
 const box=document.getElementById('accountContent');if(!box)return;
 box.hidden=false;box.innerHTML='<p class="account-loading">Memuat detail pesanan...</p>';
 try{
  const r=await fetch('/api/order/'+id);const d=await r.json();
  if(!r.ok)throw new Error(d.error||'Detail pesanan gagal dimuat');
  const items=Array.isArray(d.items)?d.items:[];
  box.innerHTML=accountSectionHeader('DETAIL PESANAN','Order '+escapeHtml(d.order.order_no))+
   '<div class="order-detail-card"><div class="order-detail-status"><span>'+notificationStatusIcon(d.order.status)+'</span><div><strong>'+escapeHtml(notificationStatusLabel(d.order.status))+'</strong><small>'+escapeHtml(d.order.created_at||'')+'</small></div></div>'+
   '<div class="order-detail-items">'+items.map(i=>'<div><span>'+escapeHtml(i.name)+' × '+i.qty+'</span><b>'+rupiah(i.price*i.qty)+'</b></div>').join('')+'</div>'+
   '<div class="order-detail-totals"><div><span>Subtotal</span><b>'+rupiah(d.order.subtotal)+'</b></div><div><span>Diskon</span><b>− '+rupiah(d.order.discount)+'</b></div><div><span>Delivery</span><b>'+rupiah(d.order.delivery_fee)+'</b></div><div class="grand"><span>Total</span><b>'+rupiah(d.order.total)+'</b></div></div>'+
   '<div class="order-detail-address"><small>Alamat pengantaran</small><p>'+escapeHtml(d.order.address)+'</p></div>'+
   '<div class="order-detail-actions"><button type="button" class="primary" onclick="loadOrderTracking('+d.order.id+')">Lihat Tracking →</button><a class="track-button" href="https://wa.me/'+escapeHtml(d.contact?.admin_whatsapp||WHATSAPP_NUMBER)+'?text='+encodeURIComponent('Halo Warkost Bahagia, saya ingin menanyakan pesanan '+d.order.order_no+'.')+'" target="_blank" rel="noopener">Chat Admin WhatsApp</a></div></div>';
 }catch(e){box.innerHTML='<div class="error">'+escapeHtml(e.message||'Detail pesanan gagal dimuat.')+'</div>';}
}

function notificationStatusLabel(status){
  const map={
    pending_payment:'Menunggu pembayaran',
    paid:'Pembayaran diterima',
    confirmed:'Pesanan dikonfirmasi',
    processing:'Pesanan sedang diproses',
    ready:'Pesanan siap diantar',
    ready_for_pickup:'Pesanan siap diambil',
    out_for_delivery:'Pesanan sedang diantar',
    completed:'Pesanan selesai',
    cancelled:'Pesanan dibatalkan',
    expired:'Pesanan kedaluwarsa',
    in_fulfillment:'Pesanan sedang diproses'
  };
  return map[String(status||'').toLowerCase()]||'Status pesanan diperbarui';
}
function notificationStatusIcon(status){
  const s=String(status||'').toLowerCase();
  if(s==='completed')return '✓';
  if(s==='cancelled'||s==='expired')return '!';
  if(s==='out_for_delivery')return '🛵';
  if(s==='ready'||s==='ready_for_pickup')return '📦';
  if(s==='processing'||s==='in_fulfillment')return '🍳';
  if(s==='paid'||s==='confirmed')return '✓';
  return '🔔';
}
function formatNotificationTime(value){
  if(!value)return '';
  const d=new Date(String(value).replace(' ','T'));
  if(Number.isNaN(d.getTime()))return '';
  return d.toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
async function loadNotifications(){
  const el=document.getElementById('notificationContent');
  if(!el)return;
  el.innerHTML='<div class="notification-loading"><span>⏳</span><strong>Memuat notifikasi...</strong><small>Mengecek status pesanan terbaru.</small></div>';
  try{
    const r=await fetch('/api/customer/notifications');
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Gagal memuat notifikasi');
    const orders=Array.isArray(data)?data:[];
    if(!orders.length){
      el.innerHTML='<div class="notification-empty"><span>🔔</span><strong>Belum ada notifikasi</strong><small>Update pesanan akan muncul di sini.</small></div>';
      return;
    }
    el.innerHTML=orders.slice(0,6).map(o=>{
      const status=o.status||o.order_status||o.payment_status||'';
      const number=o.order_no||o.order_number||(o.order_id?'#'+o.order_id:'#');
      const total=o.total!=null?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(o.total)||0):'';
      return '<button type="button" class="notification-item" onclick="closeNotifications();openCustomerAccountSection(\'orders\')">'+
        '<span class="notification-icon">'+notificationStatusIcon(status)+'</span>'+
        '<span class="notification-copy"><strong>Pesanan '+number+'</strong><small>'+(o.message||notificationStatusLabel(status))+(total?' · '+total:'')+'</small><em>'+formatNotificationTime(o.created_at)+'</em></span>'+
        '<span class="notification-arrow">→</span>'+
      '</button>';
    }).join('');
  }catch(err){
    console.error(err);
    el.innerHTML='<div class="notification-empty"><span>⚠</span><strong>Notifikasi belum dapat dimuat</strong><small>Segarkan halaman lalu coba lagi.</small></div>';
  }
}
function toggleNotifications(){
  const p=document.getElementById('notificationPanel');
  const b=document.getElementById('notificationButton');
  if(!p)return;
  const open=!p.classList.contains('show');
  if(open){
    p.classList.add('show');
    p.setAttribute('aria-hidden','false');
    if(b)b.setAttribute('aria-expanded','true');
    loadNotifications();
  }else{
    closeNotifications();
  }
}
function closeNotifications(){
  const p=document.getElementById('notificationPanel');
  const b=document.getElementById('notificationButton');
  if(!p)return;
  p.classList.remove('show');
  p.setAttribute('aria-hidden','true');
  if(b)b.setAttribute('aria-expanded','false');
  syncCustomerSurfaceBackdrop();
}
function syncCustomerSurfaceBackdrop(){
  const cart=document.getElementById('cart');
  const notification=document.getElementById('notificationPanel');
  let overlay=document.getElementById('customerSurfaceBackdrop');
  const active=!!(cart?.classList.contains('show')||notification?.classList.contains('show'));
  if(active){
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='customerSurfaceBackdrop';
      overlay.className='customer-surface-backdrop';
      overlay.setAttribute('aria-hidden','true');
      overlay.addEventListener('click',()=>{closeNotifications();closeCart();});
      document.body.appendChild(overlay);
    }
    overlay.classList.add('show');
  }else if(overlay){
    overlay.classList.remove('show');
  }
}
function closeCart(){
  const cart=document.getElementById('cart');
  if(!cart)return;
  cart.classList.remove('show');
  syncCustomerSurfaceBackdrop();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeNotifications();closeCart();closeCustomerAccountMenu();closeAccountPanel();closeProductDetail();closeVoucherCenter();closeConfirm();}});
function toggleCustomerAccountMenu(){
  const menu=document.getElementById('customerAccountMenu'),trigger=document.getElementById('customerAccountTrigger');
  if(!menu)return;
  const open=!menu.classList.contains('show');
  menu.classList.toggle('show',open);
  menu.setAttribute('aria-hidden',String(!open));
  if(trigger)trigger.setAttribute('aria-expanded',String(open));
}
function closeCustomerAccountMenu(){
  const menu=document.getElementById('customerAccountMenu'),trigger=document.getElementById('customerAccountTrigger');
  if(!menu)return;
  menu.classList.remove('show');menu.setAttribute('aria-hidden','true');
  if(trigger)trigger.setAttribute('aria-expanded','false');
}
function openCustomerAccountSection(section){
  closeCustomerAccountMenu();
  openAccountPanel();
  loadAccountSection(section);
}
document.addEventListener('click',e=>{
  const wrap=document.querySelector('.customer-account-wrap');
  if(wrap&&!wrap.contains(e.target))closeCustomerAccountMenu();

  const notification=document.getElementById('notificationPanel');
  const notificationButton=document.getElementById('notificationButton');
  if(notification?.classList.contains('show')&&!notification.contains(e.target)&&!notificationButton?.contains(e.target)){
    closeNotifications();
  }

  const cart=document.getElementById('cart');
  const cartButtons=[...document.querySelectorAll('[onclick="cartOpen()"]')];
  const voucherModal=document.getElementById('voucherCenterModal');
  if(cart?.classList.contains('show')&&!cart.contains(e.target)&&!cartButtons.some(btn=>btn.contains(e.target))&&!voucherModal?.contains(e.target)){
    closeCart();
  }

  const accountPanel=document.getElementById('accountPanel');
  if(accountPanel?.classList.contains('show')&&e.target===accountPanel){
    closeAccountPanel();
  }

  const backdrop=e.target;
  if(backdrop?.classList?.contains('modal-backdrop')){
    if(backdrop.id==='productDetailModal')closeProductDetail();
    if(backdrop.id==='voucherCenterModal')closeVoucherCenter();
    if(backdrop.id==='confirmModal')closeConfirm();
    if(backdrop.id==='orderProcessModal')closeOrderProcess();
  }
});
function openAccountPanel(){const p=document.getElementById('accountPanel');if(!p)return;p.classList.add('show');p.setAttribute('aria-hidden','false');}
function closeAccountPanel(){const p=document.getElementById('accountPanel');if(!p)return;p.classList.remove('show');p.setAttribute('aria-hidden','true');showAccountMenuView();}
function showAccountMenuView(){
  stopTrackingCapacityRefresh();
  const menu=document.getElementById('accountMenuView'),box=document.getElementById('accountContent');
  if(menu)menu.hidden=false;
  if(box){box.hidden=true;box.innerHTML='';}
}
function accountSectionHeader(kicker,title){
  return '<div class="account-section-head"><button type="button" class="account-back" onclick="showAccountMenuView()">← Pengaturan Akun</button><div><span class="section-kicker">'+kicker+'</span><h3>'+title+'</h3></div></div>';
}
async function loadAccountSection(section){
  stopTrackingCapacityRefresh();
  const menu=document.getElementById('accountMenuView'),box=document.getElementById('accountContent');
  if(!box)return;
  if(menu)menu.hidden=true;
  box.hidden=false;
  box.innerHTML='<p class="account-loading">Memuat...</p>';
  if(section==='orders'){
    const r=await fetch('/api/customer/orders');const data=await r.json();
    if(!r.ok){box.innerHTML=accountSectionHeader('RIWAYAT TRANSAKSI','Riwayat Transaksi')+'<div class="error">'+escapeHtml(data.error||'Gagal memuat riwayat.')+'</div>';return;}
    box.innerHTML=accountSectionHeader('RIWAYAT TRANSAKSI','Pesanan Kamu')+
      '<div class="account-order-list">'+(data.length?data.map(o=>'<div class="account-order"><div><strong>'+escapeHtml(o.order_no)+'</strong><small>'+escapeHtml(o.created_at||'')+'</small></div><b>'+rupiah(o.total)+'</b><span class="order-status">'+escapeHtml(o.status||'')+'</span><div class="order-card-actions"><button type="button" class="track-button" onclick="loadOrderDetail('+o.id+')">Detail Pesanan</button><button type="button" class="track-button" onclick="loadOrderTracking('+o.id+')">Tracking →</button></div></div>').join(''):'<p>Belum ada transaksi.</p>')+'</div>';
  }else if(section==='addresses'){
    const r=await fetch('/api/customer/addresses');const data=await r.json();
    if(!r.ok){box.innerHTML=accountSectionHeader('ALAMAT','Alamat Pengantaran')+'<div class="error">'+escapeHtml(data.error||'Gagal memuat alamat.')+'</div>';return;}
    box.innerHTML=accountSectionHeader('ALAMAT','Alamat Pengantaran')+
      '<div class="account-address-intro"><span class="account-feature-icon">⌖</span><div><strong>Simpan alamat favorit</strong><small>Alamat tersimpan bisa langsung dipilih saat checkout.</small></div></div>'+
      '<div class="account-address-list">'+(data.length?data.map(a=>'<article class="account-address"><div class="account-address-top"><div class="account-address-icon">⌂</div><div class="account-address-copy"><strong>'+escapeHtml(a.label||'Alamat')+'</strong><p>'+escapeHtml(a.address)+'</p><small class="saved-address-meta">'+(a.latitude!=null&&a.longitude!=null?'✓ Titik maps tersimpan':'⚠ Titik maps belum tersimpan')+'</small></div><button type="button" class="account-inline-button" onclick="editCustomerAddress('+a.id+')">Edit</button></div></article>').join(''):'<div class="account-empty-state"><strong>Belum ada alamat</strong><small>Tambahkan alamat pertama untuk mempercepat checkout.</small></div>')+'</div>'+
      '<form class="account-address-form" onsubmit="saveCustomerAddress(event)"><div class="account-form-title"><span class="account-feature-icon">+</span><div><strong>Tambah alamat baru</strong><small>Pilih titik maps agar ongkir dan rute lebih akurat.</small></div></div><input type="hidden" id="accountAddressId"><input id="addressLabel" placeholder="Contoh: Rumah, Kantor, Kos" value="Rumah"><div id="accountAddressSearch" class="maps-autocomplete account-address-search"></div><textarea id="addressValue" placeholder="Tulis alamat lengkap" required></textarea><input type="hidden" id="accountAddressLat"><input type="hidden" id="accountAddressLon"><div id="accountAddressMap" class="order-map account-address-map"></div><small class="location-note">Ketik alamat lalu pilih rekomendasi peta.</small><div id="accountAddressStatus" class="location-status">Titik maps belum dipilih.</div><button class="primary account-primary-button" type="submit">Simpan Alamat <span>→</span></button><div id="addressMsg"></div></form>';
    fetch('/api/maps/config').then(r=>r.json()).then(cfg=>{ if(cfg.api_key && typeof google!=='undefined') setupAccountMaps(cfg); else initAccountLocalTestMode(cfg); }).catch(()=>{});
  }else if(section==='password'){
    box.innerHTML=accountSectionHeader('KEAMANAN','Ubah Password')+
      '<div class="account-security-intro"><span class="account-feature-icon">✓</span><div><strong>Jaga akun tetap aman</strong><small>Gunakan password yang panjang dan unik untuk akun Warkost.</small></div></div>'+
      '<form class="account-password" onsubmit="changeAccountPassword(event)"><label for="currentPassword">Password saat ini</label><input id="currentPassword" type="password" placeholder="Masukkan password saat ini" autocomplete="current-password" required><label for="newPassword">Password baru</label><input id="newPassword" type="password" placeholder="Minimal 12 karakter" minlength="12" autocomplete="new-password" required><small class="password-hint">Minimal 12 karakter.</small><label for="confirmPassword">Konfirmasi password baru</label><input id="confirmPassword" type="password" placeholder="Ulangi password baru" minlength="12" autocomplete="new-password" required><button class="primary account-primary-button" type="submit">Simpan Password <span>→</span></button><div id="passwordMsg"></div></form>';
  }
}
async function changeAccountPassword(e){
  e.preventDefault();
  const msg=document.getElementById('passwordMsg');
  const current=document.getElementById('currentPassword')?.value||'';
  const next=document.getElementById('newPassword')?.value||'';
  const confirm=document.getElementById('confirmPassword')?.value||'';
  if(next.length<12){if(msg)msg.innerHTML='<div class="error">Password baru minimal 12 karakter.</div>';return;}
  if(next!==confirm){if(msg)msg.innerHTML='<div class="error">Konfirmasi password tidak cocok.</div>';return;}
  if(msg)msg.innerHTML='<div class="account-inline-loading">Menyimpan perubahan...</div>';
  try{
    const r=await fetch('/api/customer/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:current,new_password:next})});
    const data=await r.json();
    if(msg)msg.innerHTML='<div class="'+(r.ok?'success':'error')+'">'+escapeHtml(data.message||data.error||'Gagal mengubah password.')+'</div>';
    if(r.ok){
      document.getElementById('currentPassword').value='';
      document.getElementById('newPassword').value='';
      document.getElementById('confirmPassword').value='';
    }
  }catch(err){
    if(msg)msg.innerHTML='<div class="error">Koneksi gagal. Silakan coba lagi.</div>';
  }
}
async function saveCustomerAddress(e){
 e.preventDefault();
 const msg=document.getElementById('addressMsg'),address=document.getElementById('addressValue').value.trim(),label=document.getElementById('addressLabel').value.trim()||'Rumah';
 const lat=document.getElementById('accountAddressLat')?.value||'',lon=document.getElementById('accountAddressLon')?.value||'';
 if(!address){if(msg)msg.innerHTML='<div class="error">Alamat wajib diisi.</div>';return}
 if(!lat||!lon){if(msg)msg.innerHTML='<div class="error">Pilih rekomendasi alamat agar titik maps ikut tersimpan.</div>';return}
 const r=await fetch('/api/customer/addresses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.getElementById('accountAddressId')?.value||null,label,address,latitude:Number(lat),longitude:Number(lon)})});
 const data=await r.json();
 if(msg)msg.innerHTML='<div class="'+(r.ok?'success':'error')+'">'+escapeHtml(data.ok?'Alamat berhasil disimpan.':(data.error||'Gagal menyimpan alamat.'))+'</div>';
 if(r.ok){await loadCustomerLocation();await loadSavedAddresses();await loadAccountSection('addresses');}
}
async function editCustomerAddress(id){
 const r=await fetch('/api/customer/addresses');const data=await r.json();const a=data.find(x=>x.id===id);if(!a)return;
 const idEl=document.getElementById('accountAddressId'),v=document.getElementById('addressValue'),l=document.getElementById('addressLabel'),lat=document.getElementById('accountAddressLat'),lon=document.getElementById('accountAddressLon');
 if(idEl)idEl.value=a.id||'';if(v)v.value=a.address;if(l)l.value=a.label||'Rumah';if(lat)lat.value=a.latitude??'';if(lon)lon.value=a.longitude??'';
 const status=document.getElementById('accountAddressStatus');if(status)status.textContent=a.latitude!=null&&a.longitude!=null?'✓ Titik maps tersimpan.':'Titik maps belum dipilih.';
 v?.focus();
}
let trackingCapacityTimer=null;
function stopTrackingCapacityRefresh(){if(trackingCapacityTimer){clearInterval(trackingCapacityTimer);trackingCapacityTimer=null;}}
async function loadOrderTracking(id){
  stopTrackingCapacityRefresh();
  const box=document.getElementById('accountContent');if(!box)return;
  box.innerHTML='<p class="account-loading">Memuat tracking...</p>';
  async function renderTracking(){
    try{
      const r=await fetch('/api/customer/orders/'+id+'/tracking');const data=await r.json();
      if(!r.ok){box.innerHTML='<div class="error">'+escapeHtml(data.error||'Tracking gagal dimuat.')+'</div>';return false;}
      const t=data.tracking||{},o=data.order||{},contact=data.contact||{},cap=data.delivery_capacity||{};
      const stages=Array.isArray(t.stages)?t.stages:[],stageIndex=Number.isFinite(Number(t.stage_index))?Number(t.stage_index):0;
      const adminPhone=contact.admin_whatsapp||WHATSAPP_NUMBER;
      const adminMsg=encodeURIComponent('Halo Warkost Bahagia, saya ingin menanyakan pesanan '+(o.order_no||'')+'.');
      const adminLink='https://wa.me/'+adminPhone+'?text='+adminMsg;
      const driverHtml=contact.driver_phone&&t.status==='out_for_delivery'
        ? '<a class="tracking-contact tracking-driver" href="https://wa.me/'+escapeHtml(contact.driver_phone)+'?text='+encodeURIComponent('Halo, saya customer untuk pesanan '+(o.order_no||'')+'.')+'" target="_blank" rel="noopener">🛵 Chat Driver WhatsApp <span>→</span></a>':'';
      const waitingNotice=!t.delivery_stop && ['confirmed','processing','ready'].includes(t.status) && cap.waiting
        ? '<div class="delivery-capacity waiting"><strong>⏳ Antrean pengantaran</strong><span>'+escapeHtml(cap.message)+'</span><small>'+cap.active_deliveries+' pengantaran aktif · '+cap.available_slots+' slot tersedia</small></div>':'';
      const availableNotice=!t.delivery_stop && ['confirmed','processing','ready'].includes(t.status) && !cap.waiting
        ? '<div class="delivery-capacity available"><strong>✓ Slot pengantaran tersedia</strong><span>'+escapeHtml(cap.message)+'</span></div>':'';
      box.innerHTML='<div class="account-section-head"><button type="button" class="account-back" onclick="stopTrackingCapacityRefresh();loadAccountSection(&quot;orders&quot;)">← Pengaturan Akun</button><div><span class="section-kicker">STATUS PESANAN</span><h3>'+escapeHtml(t.label||'Status pesanan')+'</h3></div></div>'+
        waitingNotice+availableNotice+
        '<div class="tracking-timeline">'+stages.map((s,i)=>'<div class="tracking-step '+(i<=stageIndex?'done':'')+'"><span>'+(i<=stageIndex?'✓':(i+1))+'</span><div><strong>'+escapeHtml(s.label)+'</strong><small>'+(i<stageIndex?'Selesai':i===stageIndex?'Status saat ini':'Menunggu')+'</small></div></div>').join('')+'</div>'+
        '<div class="tracking-address"><strong>'+escapeHtml(o.order_no||'')+'</strong><p>'+escapeHtml(o.address||'')+'</p><b>'+rupiah(o.total)+'</b></div>'+
        '<div class="tracking-contacts"><a class="tracking-contact tracking-admin" href="'+adminLink+'" target="_blank" rel="noopener">💬 Chat Admin WhatsApp <span>→</span></a>'+driverHtml+'</div>'+
        '<button type="button" class="track-button" onclick="stopTrackingCapacityRefresh();loadAccountSection(&quot;orders&quot;)">← Kembali ke Riwayat</button>';
      return true;
    }catch(err){console.error(err);return false;}
  }
  if(await renderTracking()) trackingCapacityTimer=setInterval(renderTracking,3000);
}

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
    setupAccountMaps(cfg);
  }catch(e){status.textContent='Google Maps gagal diinisialisasi. Pastikan Maps JavaScript API dan Places API (New) aktif.'}
}
function initAccountLocalTestMode(cfg){
 const picker=document.getElementById('accountAddressSearch'),mapEl=document.getElementById('accountAddressMap');
 if(!picker||!mapEl)return;
 if(picker.dataset.localReady==='1')return;
 picker.dataset.localReady='1';
 picker.innerHTML='<div class="local-test-box"><b>MODE TEST LOKAL</b><small>Google Maps belum dikonfigurasi. Pilih titik simulasi untuk menyimpan alamat beserta koordinat.</small><div class="test-distance-grid"><button type="button" onclick="setAccountTestLocation(2)">Titik 2 km</button><button type="button" onclick="setAccountTestLocation(5)">Titik 5 km</button><button type="button" onclick="setAccountTestLocation(6)">Titik 6 km</button><button type="button" onclick="setAccountTestLocation(8)">Titik 8 km</button><button type="button" onclick="setAccountTestLocation(9)">Titik 9 km</button></div></div>';
 mapEl.innerHTML='<div class="local-map-placeholder">🗺️<br><b>Preview Map ditunda</b><br><small>Titik simulasi akan disimpan sebagai latitude & longitude.</small></div>';
 window.testCafe=window.testCafe||{lat:Number(cfg?.cafe_latitude),lon:Number(cfg?.cafe_longitude)};
}
function setAccountTestLocation(distanceKm){
 const address=(document.getElementById('addressValue')?.value||'').trim();
 if(!address){const msg=document.getElementById('addressMsg');if(msg)msg.innerHTML='<div class="error">Isi alamat lengkap terlebih dahulu.</div>';return}
 const p=destinationPoint(window.testCafe.lat,window.testCafe.lon,distanceKm,90);
 document.getElementById('accountAddressLat').value=p.lat;
 document.getElementById('accountAddressLon').value=p.lon;
 const status=document.getElementById('accountAddressStatus');if(status)status.textContent='✓ Titik simulasi '+distanceKm.toFixed(1)+' km dipilih.';
}
async function setupAccountMaps(cfg){
 if(accountMapState.ready||typeof google==='undefined')return;
 const picker=document.getElementById('accountAddressSearch'),mapEl=document.getElementById('accountAddressMap');
 if(!picker||!mapEl)return;
 try{
  const {Map}=await google.maps.importLibrary('maps');
  const {PlaceAutocompleteElement}=await google.maps.importLibrary('places');
  const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
  const center={lat:Number(cfg.cafe_latitude)||-6.9218,lng:Number(cfg.cafe_longitude)||106.9270};
  accountMapState.map=new Map(mapEl,{center,zoom:14,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,mapId:'DEMO_MAP_ID'});
  accountMapState.autocomplete=new PlaceAutocompleteElement({includedRegionCodes:['id']});
  accountMapState.autocomplete.placeholder='Cari alamat tersimpan...';
  picker.innerHTML='';
  picker.appendChild(accountMapState.autocomplete);
  accountMapState.autocomplete.addEventListener('gmp-select',async({placePrediction})=>{
    const place=placePrediction.toPlace();
    await place.fetchFields({fields:['displayName','formattedAddress','location','viewport']});
    if(!place.location)return;
    const lat=Number(place.location.lat()),lon=Number(place.location.lng()),address=place.formattedAddress||place.displayName||'';
    document.getElementById('addressValue').value=address;
    document.getElementById('accountAddressLat').value=lat;
    document.getElementById('accountAddressLon').value=lon;
    if(accountMapState.marker)accountMapState.marker.map=null;
    accountMapState.marker=new AdvancedMarkerElement({map:accountMapState.map,position:{lat,lng:lon},title:place.displayName||'Alamat'});
    if(place.viewport)accountMapState.map.fitBounds(place.viewport);else{accountMapState.map.setCenter({lat,lng:lon});accountMapState.map.setZoom(17)}
    document.getElementById('accountAddressStatus').textContent='✓ Titik maps dipilih.';
  });
  accountMapState.ready=true;
 }catch(e){console.warn('Account maps init failed',e);}
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
async function getDeliveryCapacity(){
  try{const r=await fetch('/api/customer/delivery-status');const d=await r.json();return r.ok?d:null}catch(e){return null}
}
async function applyDeliveryCapacityNotice(target){
  const d=await getDeliveryCapacity();
  if(!d||!target)return d;
  const cls=d.waiting?'delivery-capacity waiting':'delivery-capacity available';
  target.insertAdjacentHTML('beforeend','<div class="'+cls+'"><strong>'+ (d.waiting?'⏳ Harap menunggu':'✓ Driver tersedia') +'</strong><span>'+escapeHtml(d.message)+'</span></div>');
  return d;
}
async function openOrderProcess(orderNo,total,status='confirmed'){
 const box=document.getElementById('orderProcessContent');if(!box)return;
 box.innerHTML='<div class="payment-result-success"><span>✓</span><strong>Pembayaran berhasil</strong><small>Pesanan kamu sudah masuk ke sistem Warkost Bahagia.</small></div><div class="process-order-no">'+escapeHtml(orderNo)+'</div><div class="process-total">Total '+rupiah(total)+'</div><div class="process-steps"><div class="active"><strong>✓ Order dibuat</strong><span>Pesanan diterima sistem</span></div><div class="active"><strong>✓ Pembayaran</strong><span>PAID (demo)</span></div><div><strong>Kitchen</strong><span>Menunggu diproses</span></div><div><strong>Delivery</strong><span>Menunggu penugasan driver</span></div></div><div class="payment-result-actions"><button type="button" class="secondary" onclick="closeOrderProcess();openCustomerAccountSection(&quot;orders&quot;)">Lihat Pesanan</button><button type="button" class="primary" onclick="closeOrderProcess();openCustomerAccountSection(&quot;orders&quot;)">Tracking Pesanan →</button></div>';
 document.getElementById('orderProcessModal').hidden=false;await applyDeliveryCapacityNotice(box);
}
function closeOrderProcess(){document.getElementById('orderProcessModal').hidden=true;const cartEl=document.getElementById('cart');if(cartEl)cartEl.classList.remove('show');render();window.scrollTo({top:0,behavior:'smooth'});}
async function claimVoucher(){
  const input=document.getElementById('promoCode'),msg=document.getElementById('promoMsg');
  const code=(input?.value||'').trim().toUpperCase();
  if(!code){appliedPromo=null;if(msg)msg.innerHTML='<div class="error">Masukkan kode voucher terlebih dahulu.</div>';render();return}
  if(!cart.length){if(msg)msg.innerHTML='<div class="error">Tambahkan menu ke keranjang sebelum klaim voucher.</div>';return}
  const subtotal=totals().subtotal;
  try{
    const r=await fetch('/api/customer/promo/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,subtotal})});
    const d=await r.json();
    if(!r.ok){appliedPromo=null;if(msg)msg.innerHTML='<div class="error">'+escapeHtml(d.error||'Voucher tidak dapat digunakan.')+'</div>';render();return}
    appliedPromo={code:d.code,discount:Number(d.discount||0),label:d.label||d.code};
    if(msg)msg.innerHTML='<div class="success">✓ Voucher '+escapeHtml(d.code)+' aktif. Hemat '+rupiah(d.discount)+'.</div>';
    render();
  }catch(e){if(msg)msg.innerHTML='<div class="error">Voucher belum dapat diverifikasi. Coba lagi.</div>'}
}
async function checkout(){
  const nameEl=document.getElementById('name'),phoneEl=document.getElementById('phone'),addressEl=document.getElementById('address'),latEl=document.getElementById('lat'),lonEl=document.getElementById('lon');
  showMsg('',0);
  if(!cart.length){showMsg('<div class="error">Keranjang kosong.</div>');return}
  const customerName=(nameEl.value||'').trim(),customerPhone=(phoneEl.value||'').trim(),customerAddress=(addressEl.value||'').trim(),latitude=latEl.value!==''?Number(latEl.value):null,longitude=lonEl.value!==''?Number(lonEl.value):null;
  if(!customerName||!customerPhone){showMsg('<div class="error">Nama dan HP aktif wajib diisi.</div>');return}
  if(!customerAddress||latitude===null||longitude===null||!Number.isFinite(latitude)||!Number.isFinite(longitude)){showMsg('<div class="error">Pilih alamat pengantaran terlebih dahulu.</div>');return}
  await refreshDeliveryQuote();
  if(!deliveryQuote||deliveryQuote.available!==true){showMsg('<div class="error">Alamat belum dapat digunakan untuk pengantaran.</div>');return}
  if(savedAddresses.length===0){
    try{
      const save=await fetch('/api/customer/addresses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'Rumah',address:customerAddress,latitude,longitude})});
      if(save.ok){await loadSavedAddresses();}
    }catch(e){console.warn('Alamat pertama belum tersimpan otomatis',e);}
  }
  openConfirm();
}
async function confirmCheckout(){
  closeConfirm();
  const name=(document.getElementById('name').value||'').trim(),phone=(document.getElementById('phone').value||'').trim(),address=(document.getElementById('address').value||'').trim(),latitude=Number(document.getElementById('lat').value),longitude=Number(document.getElementById('lon').value);
  const payload={items:cart,name,phone,address,latitude,longitude,promo_code:(document.getElementById('promoCode')?.value||'').trim()};
  try{
    const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();
    if(r.status===401){window.location='/login';return}
    if(!r.ok){showMsg('<div class="error">'+escapeHtml(d.error||'Order gagal dibuat.')+'</div>');return}
    const pay=await fetch('/api/simulate-payment/'+d.order_id,{method:'POST'});
    if(!pay.ok){showMsg('<div class="error">Order dibuat, tetapi pembayaran demo gagal.</div>');return}
    await openOrderProcess(d.order_no,d.total,'confirmed');
    cart=[];deliveryQuote=null;appliedPromo=null;const pc=document.getElementById('promoCode');if(pc)pc.value='';const pm=document.getElementById('promoMsg');if(pm)pm.innerHTML='';clearSelectedAddress();render();load();
  }catch(err){showMsg('<div class="error">Tidak dapat terhubung ke server. Coba lagi.</div>')}
}
function hideSplash(){const s=document.getElementById('splashScreen');if(s){s.classList.add('hide');setTimeout(()=>s.remove(),450);}}
setTimeout(hideSplash,700);
load();initMaps();
