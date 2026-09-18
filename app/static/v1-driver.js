(function(){
  let client=null, session=null, snapshot=null;

  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>'Rp '+Number(v||0).toLocaleString('id-ID');
  function msg(text,type='success'){
    const el=$('message'); el.textContent=text; el.className='ops-message '+type; el.hidden=!text;
    if(text) setTimeout(()=>{el.hidden=true},4000);
  }

  async function config(){
    const r=await fetch('/api/v1/config'); const c=await r.json();
    if(!c.url||!c.anon_key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum dikonfigurasi.');
    return supabase.createClient(c.url,c.anon_key);
  }
  async function call(body){
    const {data:{session:s}}=await client.auth.getSession();
    if(!s) throw new Error('Session habis. Silakan login kembali.');
    const r=await fetch('/api/v1/edge/driver-operations',{method:'POST',headers:{
      Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'
    },body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Driver service error');
    return data;
  }
  async function load(){
    const data=await call({action:'snapshot'}); snapshot=data;
    const d=data.driver||{};
    $('driverStatus').textContent=d.status?.toUpperCase()||'—';
    $('driverStatus').className='driver-status '+(d.status||'');
    $('statusBtn').textContent=d.status==='online'?'OFFLINE':(d.status==='busy'?'BUSY':'ONLINE');
    $('statusBtn').disabled=d.status==='busy';
    $('driverSubtitle').textContent=d.name||'Driver';
    $('activeCount').textContent=(data.orders||[]).length;
    $('tripStatus').textContent=d.active_trip_id?'AKTIF':'—';
    $('capacity').textContent=(data.stops||[]).filter(x=>['pending','active'].includes(x.status)).length+' / 5';
    render(data);
  }
  function render(data){
    const list=$('deliveryList'); const orders=data.orders||[]; const details=new Map((data.order_details||[]).map(x=>[x.id,x]));
    if(!orders.length){list.innerHTML='<div class="ops-empty">Belum ada delivery aktif.</div>';return;}
    const stopMap=new Map((data.stops||[]).map(x=>[x.order_id,x]));
    list.innerHTML=orders.map(d=>{
      const o=details.get(d.order_id)||{}; const stop=stopMap.get(d.order_id)||{};
      const canPickup=d.status==='assigned';
      const canComplete=['picked_up','out_for_delivery'].includes(d.status);
      return '<article class="driver-card">'+
        '<div class="driver-card-top"><div><strong>'+esc(o.order_number||'Order')+'</strong><span class="status '+esc(d.status)+'">'+esc(d.status.replaceAll('_',' ').toUpperCase())+'</span></div><b>#'+esc(stop.sequence||'—')+'</b></div>'+
        '<div class="driver-customer"><strong>'+esc(o.delivery_address||d.address||'Alamat tidak tersedia')+'</strong><span>'+esc(o.channel||'delivery')+' · '+money(o.total_amount)+'</span></div>'+
        '<div class="driver-meta"><span>📍 '+(d.distance_km==null?'—':Number(d.distance_km).toFixed(1)+' km')+'</span><span>⏱ '+esc(d.estimated_minutes||o.estimated_delivery_minutes||'—')+' menit</span></div>'+
        '<div class="driver-actions">'+
        (canPickup?'<button class="primary" data-action="pickup" data-id="'+esc(d.id)+'">Ambil Pesanan</button>':'')+
        (canComplete?'<button class="primary" data-action="complete" data-id="'+esc(d.id)+'">Selesaikan + Foto</button>':'')+
        '</div></article>';
    }).join('');
    list.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>b.dataset.action==='pickup'?pickup(b.dataset.id):openProof(b.dataset.id));
  }
  async function pickup(id){
    try{bump(true);await call({action:'pickup',delivery_order_id:id});msg('Pesanan berhasil diambil. Status delivery sekarang OUT FOR DELIVERY.');await load();}
    catch(e){msg(e.message,'error')}finally{bump(false)}
  }
  function openProof(id){
    $('proofDeliveryId').value=id; $('proofFile').value=''; $('proofNotes').value=''; $('proofModal').hidden=false;
  }
  function closeProof(){$('proofModal').hidden=true}
  async function complete(e){
    e.preventDefault();
    const id=$('proofDeliveryId').value, file=$('proofFile').files[0];
    if(!file)return;
    if(!file.type.startsWith('image/')){msg('File bukti harus berupa gambar.','error');return;}
    if(file.size>5*1024*1024){msg('Ukuran foto maksimal 5 MB.','error');return;}
    try{
      bump(true);
      const path=session.user.id+'/'+id+'-'+Date.now()+'.jpg';
      const {error:ue}=await client.storage.from('delivery-proofs').upload(path,file,{contentType:file.type,upsert:false});
      if(ue)throw ue;
      await call({action:'complete',delivery_order_id:id,proof_photo:path,notes:$('proofNotes').value.trim()});
      closeProof();msg('Delivery selesai dan bukti tersimpan.');await load();
    }catch(e){msg(e.message||'Gagal menyelesaikan delivery.','error')}
    finally{bump(false)}
  }
  async function toggleStatus(){
    try{
      bump(true);
      const next=snapshot?.driver?.status==='online'?'offline':'online';
      await call({action:'status',status:next});
      msg('Status driver diubah ke '+next.toUpperCase()+'.');await load();
    }catch(e){msg(e.message,'error')}finally{bump(false)}
  }
  function bump(disabled){
    $('statusBtn').disabled=disabled;
    document.querySelectorAll('.driver-actions button').forEach(x=>x.disabled=disabled);
  }
  async function init(){
    try{
      client=await config();
      const {data}=await client.auth.getSession(); session=data.session;
      if(!session){location='/v1/login';return}
      const {data:profile,error}=await client.from('profiles').select('full_name,role,is_active').eq('id',session.user.id).single();
      if(error||!profile?.is_active||profile.role!=='driver'){location='/v1/app';return}
      $('userEmail').textContent=session.user.email||'';
      $('logoutBtn').onclick=async()=>{await client.auth.signOut();location='/v1/login'};
      $('statusBtn').onclick=toggleStatus;
      $('closeProof').onclick=closeProof;$('cancelProof').onclick=closeProof;
      $('proofForm').onsubmit=complete;
      await load();
      setInterval(()=>load().catch(e=>msg(e.message,'error')),5000);
    }catch(e){msg(e.message||'Driver app gagal dimuat.','error')}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
