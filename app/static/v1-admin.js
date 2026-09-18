(function(){
let client, categories=[], products=[];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const rupiah=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const msg=(text,type='success')=>{const el=document.getElementById('adminMsg');el.innerHTML=text?'<div class="'+type+'">'+esc(text)+'</div>':'';};
async function init(){
 try{
  const cfg=await (await fetch('/api/v1/config')).json();
  if(!cfg.url||!cfg.anon_key) throw Error('Supabase V1 belum dikonfigurasi.');
  client=supabase.createClient(cfg.url,cfg.anon_key);
  const {data:{session}}=await client.auth.getSession();
  if(!session){location='/v1/login';return;}
  const {data:profile,error}=await client.from('profiles').select('id,full_name,role,is_active').eq('id',session.user.id).single();
  if(error||!profile||!profile.is_active||profile.role!=='admin'){location='/v1/app';return;}
  document.getElementById('userEmail').textContent=session.user.email||profile.full_name||'';
  document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login';};
  document.getElementById('addCategoryBtn').onclick=addCategory;
  document.getElementById('productForm').onsubmit=saveProduct;
  document.getElementById('cancelEditBtn').onclick=resetProductForm;
  await refresh();
 }catch(e){msg(e.message||'Gagal memuat Admin.','error');}
}
async function refresh(){
 await loadCategories();
 await loadProducts();
 await loadAudit();
}
async function loadAudit(){
 const {data,error}=await client.from('audit_logs').select('id,action,entity_type,entity_id,old_value,new_value,created_at').order('created_at',{ascending:false}).limit(30);
 if(error){document.getElementById('auditRows').innerHTML='<tr><td colspan="4">Audit belum dapat dimuat.</td></tr>';return;}
 const rows=data||[];
 document.getElementById('auditRows').innerHTML=rows.length?rows.map(x=>{
  const oldName=x.old_value?.name||'',newName=x.new_value?.name||'',oldPrice=x.old_value?.selling_price,newPrice=x.new_value?.selling_price;
  let change=oldName||newName||'-';
  if(oldPrice!==undefined||newPrice!==undefined) change+=' • Harga jual '+rupiah(oldPrice)+' → '+rupiah(newPrice);
  return '<tr><td>'+esc(new Date(x.created_at).toLocaleString('id-ID'))+'</td><td><span class="badge">'+esc(x.action)+'</span></td><td>'+esc(x.entity_type)+'</td><td>'+esc(change)+'</td></tr>';
 }).join(''):'<tr><td colspan="4">Belum ada aktivitas.</td></tr>';
}
async function loadCategories(){
 const {data,error}=await client.from('categories').select('id,name,station,description,sort_order,active').order('sort_order',{ascending:true}).order('name',{ascending:true});
 if(error)throw error;
 categories=data||[];
 renderCategories();
 renderCategoryOptions();
}
function renderCategories(){
 const el=document.getElementById('categoryList');
 if(!categories.length){el.innerHTML='<div class="admin-empty">Belum ada kategori. Tambahkan kategori pertama.</div>';return;}
 el.innerHTML=categories.map(c=>'<div class="admin-category-row"><div><strong>'+esc(c.name)+'</strong><span class="badge">'+esc(c.station==='bar'?'BAR / DRINK':'KITCHEN / FOOD')+'</span><small>'+esc(c.description||'')+'</small></div><div class="category-actions"><button data-edit-category="'+c.id+'">Edit</button><button data-toggle-category="'+c.id+'">'+(c.active?'Nonaktifkan':'Aktifkan')+'</button></div></div>').join('');
 el.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>editCategory(b.dataset.editCategory));
 el.querySelectorAll('[data-toggle-category]').forEach(b=>b.onclick=()=>toggleCategory(b.dataset.toggleCategory));
}
function renderCategoryOptions(){
 const el=document.getElementById('productCategory');
 el.innerHTML=categories.filter(c=>c.active).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' — '+esc(c.station==='bar'?'Bar':'Kitchen')+'</option>').join('');
 if(!el.options.length) el.innerHTML='<option value="">Tambahkan kategori aktif terlebih dahulu</option>';
}
async function addCategory(){
 const name=document.getElementById('categoryName').value.trim(),station=document.getElementById('categoryStation').value,description=document.getElementById('categoryDescription').value.trim();
 if(!name){msg('Nama kategori wajib diisi.','error');return;}
 const {error}=await client.from('categories').insert({name,station,description:description||null});
 if(error){msg(error.message,'error');return;}
 document.getElementById('categoryName').value='';document.getElementById('categoryDescription').value='';
 msg('Kategori berhasil ditambahkan.');
 await loadCategories();
}
function editCategory(id){
 const c=categories.find(x=>x.id===id);if(!c)return;
 const name=prompt('Nama kategori:',c.name);if(name===null)return;
 const description=prompt('Deskripsi:',c.description||'');if(description===null)return;
 const station=prompt('Station (kitchen/bar):',c.station);if(station===null)return;
 updateCategory(id,name.trim(),station.trim().toLowerCase(),description.trim());
}
async function updateCategory(id,name,station,description){
 if(!name||!['kitchen','bar'].includes(station)){msg('Data kategori tidak valid.','error');return;}
 const {error}=await client.from('categories').update({name,station,description:description||null,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){msg(error.message,'error');return;} msg('Kategori diperbarui.');await loadCategories();
}
async function toggleCategory(id){
 const c=categories.find(x=>x.id===id);if(!c)return;
 const {error}=await client.from('categories').update({active:!c.active,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){msg(error.message,'error');return;} msg(c.active?'Kategori dinonaktifkan.':'Kategori diaktifkan.');await loadCategories();await loadProducts();
}
async function loadProducts(){
 const {data,error}=await client.from('products').select('id,category_id,name,description,normal_price,selling_price,stock,image_url,active').order('name',{ascending:true});
 if(error)throw error;products=data||[];renderProducts();
}
function renderProducts(){
 const tbody=document.getElementById('productRows');
 if(!products.length){tbody.innerHTML='<tr><td colspan="6">Belum ada produk.</td></tr>';return;}
 tbody.innerHTML=products.map(p=>{
  const c=categories.find(x=>x.id===p.category_id),low=Number(p.stock)<=0;
  return '<tr class="'+(low?'low-stock':'')+'"><td><strong>'+esc(p.name)+'</strong><small>'+esc(p.description||'')+'</small></td><td>'+esc(c?.station==='bar'?'Bar':'Kitchen')+'</td><td><div>'+rupiah(p.selling_price)+'</div><small>Normal '+rupiah(p.normal_price)+'</small></td><td><strong>'+Number(p.stock)+'</strong></td><td><span class="badge">'+(p.active?'Aktif':'Nonaktif')+'</span></td><td class="row-actions"><button data-edit-product="'+p.id+'">Edit</button><button data-toggle-product="'+p.id+'">'+(p.active?'Nonaktifkan':'Aktifkan')+'</button></td></tr>';
 }).join('');
 tbody.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
 tbody.querySelectorAll('[data-toggle-product]').forEach(b=>b.onclick=()=>toggleProduct(b.dataset.toggleProduct));
}
async function saveProduct(e){
 e.preventDefault();
 const id=document.getElementById('productId').value||null;
 const category_id=document.getElementById('productCategory').value;
 const name=document.getElementById('productName').value.trim();
 const normal_price=Number(document.getElementById('normalPrice').value);
 const selling_price=Number(document.getElementById('sellingPrice').value);
 const stock=Number(document.getElementById('productStock').value);
 const description=document.getElementById('productDescription').value.trim();
 const image_url=document.getElementById('imageUrl').value.trim()||null;
 const active=document.getElementById('productActive').checked;
 if(!category_id||!name||!Number.isFinite(normal_price)||normal_price<0||!Number.isFinite(selling_price)||selling_price<0||!Number.isInteger(stock)||stock<0){msg('Lengkapi kategori, nama, harga, dan stock dengan nilai yang valid.','error');return;}
 const payload={category_id,name,description:description||null,normal_price,selling_price,stock,image_url,active,updated_at:new Date().toISOString()};
 const q=id?client.from('products').update(payload).eq('id',id):client.from('products').insert(payload);
 const {error}=await q;
 if(error){msg(error.message,'error');return;}
 msg(id?'Produk diperbarui.':'Produk berhasil ditambahkan.');
 resetProductForm();await loadProducts();
}
function editProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 document.getElementById('productId').value=p.id;
 document.getElementById('productName').value=p.name||'';
 document.getElementById('productCategory').value=p.category_id||'';
 document.getElementById('normalPrice').value=p.normal_price;
 document.getElementById('sellingPrice').value=p.selling_price;
 document.getElementById('productStock').value=p.stock;
 document.getElementById('imageUrl').value=p.image_url||'';
 document.getElementById('productDescription').value=p.description||'';
 document.getElementById('productActive').checked=!!p.active;
 document.getElementById('saveProductBtn').textContent='Simpan Perubahan';
 document.getElementById('cancelEditBtn').hidden=false;
 window.scrollTo({top:document.getElementById('productForm').offsetTop-100,behavior:'smooth'});
}
function resetProductForm(){
 document.getElementById('productForm').reset();document.getElementById('productId').value='';
 document.getElementById('productActive').checked=true;document.getElementById('saveProductBtn').textContent='Simpan Produk';document.getElementById('cancelEditBtn').hidden=true;
}
async function toggleProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 const {error}=await client.from('products').update({active:!p.active,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){msg(error.message,'error');return;}msg(p.active?'Produk dinonaktifkan.':'Produk diaktifkan.');await loadProducts();
}
document.addEventListener('DOMContentLoaded',init);
})();