(function(){
  const cfgPromise=fetch('/api/v1/config').then(r=>r.json()).then(cfg=>{
    if(!cfg.url||!cfg.anon_key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum dikonfigurasi.');
    return supabase.createClient(cfg.url,cfg.anon_key);
  });

  function msg(text,type='error'){
    const el=document.getElementById('authMsg');
    if(el) el.innerHTML='<div class="'+type+'">'+escapeHtml(text)+'</div>';
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  async function getProfile(client,userId){
    const {data,error}=await client.from('profiles').select('id,full_name,role,is_active').eq('id',userId).single();
    if(error) throw error;
    if(!data.is_active) throw new Error('Akun dinonaktifkan.');
    return data;
  }

  async function login(e){
    e.preventDefault();
    msg('','success');
    try{
      const client=await cfgPromise;
      const email=document.getElementById('email').value.trim();
      const password=document.getElementById('password').value;
      const {data,error}=await client.auth.signInWithPassword({email,password});
      if(error) throw error;
      const profile=await getProfile(client,data.user.id);
      sessionStorage.setItem('warkost_v1_role',profile.role);
      window.location=profile.role==='customer'?'/v1/customer':(profile.role==='admin'?'/v1/admin':(['kasir','kitchen'].includes(profile.role)?'/v1/operations':(profile.role==='driver'?'/v1/driver':'/v1/app')));
    }catch(err){msg(err.message||'Login V1 gagal.');}
  }

  async function initApp(){
    try{
      const client=await cfgPromise;
      const {data:{session}}=await client.auth.getSession();
      if(!session){window.location='/v1/login';return;}
      const profile=await getProfile(client,session.user.id);
      document.getElementById('userEmail').textContent=session.user.email||'';
      document.getElementById('workspaceTitle').textContent=workspaceTitle(profile.role);
      document.getElementById('workspaceDescription').textContent=workspaceDescription(profile.role);
      document.getElementById('sessionInfo').innerHTML='<p><b>User:</b> '+escapeHtml(profile.full_name||session.user.email)+'</p><p><b>Role:</b> '+escapeHtml(profile.role)+'</p><p><b>Auth:</b> Supabase session aktif</p>';
      document.getElementById('logoutBtn').onclick=async()=>{await client.auth.signOut();window.location='/v1/login';};
    }catch(err){
      document.getElementById('sessionInfo').innerHTML='<div class="error">'+escapeHtml(err.message||'Session tidak valid.')+'</div>';
    }
  }
  function workspaceTitle(role){
    return ({customer:'Customer — Menu & Order',admin:'Admin — Operational Control Center',kasir:'Kasir / Bar',kitchen:'Kitchen — KDS',driver:'Driver — Delivery',owner:'Owner — Business Dashboard'})[role]||'Warkost Bahagia';
  }
  function workspaceDescription(role){
    return ({customer:'Pesan dan lacak order.',admin:'Kelola operasi dan dispatch.',kasir:'Kelola fulfillment minuman.',kitchen:'Kelola fulfillment makanan.',driver:'Kelola delivery yang ditugaskan.',owner:'Monitor bisnis dan laporan.'})[role]||'';
  }

  window.WarkostV1={initApp};
  document.addEventListener('DOMContentLoaded',()=>{
    const form=document.getElementById('v1LoginForm');
    if(form) form.addEventListener('submit',login);
  });
})();