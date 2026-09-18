import math, os, uuid
from datetime import datetime
import os

from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify, current_app
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash
from .db import get_db

bp=Blueprint('main',__name__)
ROLE_HOME={'customer':'main.index','admin':'main.dashboard','kasir':'main.dashboard','kitchen':'main.dashboard','driver':'main.dashboard','owner':'main.dashboard'}

def haversine(a,b,c,d):
    if None in (a,b,c,d): return None
    R=6371; p1=math.radians(a); p2=math.radians(c); dp=math.radians(c-a); dl=math.radians(d-b)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

def user():
    uid=session.get('user_id')
    return get_db().execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone() if uid else None

def require_role(*roles):
    u=user(); return bool(u and u['role'] in roles)

def status_transition_allowed(role, current_status, next_status, payment_status):
    # V0.8.1: each role gets only the transition it actually owns.
    transitions = {
        'kasir': {('pending_payment', 'confirmed')},
        'kitchen': {('confirmed', 'processing'), ('processing', 'ready')},
        'admin': {
            ('pending_payment', 'confirmed'), ('pending_payment', 'cancelled'),
            ('confirmed', 'processing'), ('confirmed', 'cancelled'),
            ('processing', 'ready'), ('processing', 'cancelled'),
            ('ready', 'completed'),
        },
        'owner': {
            ('pending_payment', 'confirmed'), ('pending_payment', 'cancelled'),
            ('confirmed', 'processing'), ('confirmed', 'cancelled'),
            ('processing', 'ready'), ('processing', 'cancelled'),
            ('ready', 'completed'),
        },
    }
    if role == 'kasir' and payment_status != 'paid':
        return False
    return (current_status, next_status) in transitions.get(role, set())

def setting(key, default=None):
    row=get_db().execute('SELECT value FROM settings WHERE key=?',(key,)).fetchone()
    return row['value'] if row else default

def money(n): return int(round(n or 0))

def delivery_config():
    """Return the configurable delivery rule used by both quote and order creation."""
    try:
        free_radius = float(setting('delivery_free_radius_km', '5'))
        max_radius = float(setting('max_delivery_radius_km', '8'))
        extra_fee = money(float(setting('delivery_extra_fee', '5000')))
    except (TypeError, ValueError):
        raise ValueError('Pengaturan delivery tidak valid')
    if free_radius < 0 or max_radius <= 0 or extra_fee < 0 or free_radius > max_radius:
        raise ValueError('Pengaturan delivery tidak valid: radius gratis harus <= radius maksimal dan nilainya tidak boleh negatif')
    return free_radius, max_radius, extra_fee

def calculate_delivery(lat, lon):
    """Calculate distance/fee from the configured Warkost point.

    In explicit LOCAL_TEST_MODE, verification is relaxed so the offline
    simulator can exercise the order flow before Google Maps/production
    configuration is available. Production mode still requires verification.
    """
    local_test = str(os.environ.get('WARKOST_LOCAL_TEST_MODE', '0')).lower() in ('1','true','yes')
    if not local_test and str(setting('cafe_location_verified', '0')).lower() not in ('1','true','yes'):
        raise ValueError('Titik lokasi Warkost belum diverifikasi oleh Admin/Owner')
    try:
        cafe_lat = float(setting('cafe_latitude', '-6.9218'))
        cafe_lon = float(setting('cafe_longitude', '106.9270'))
        if not (-90 <= cafe_lat <= 90 and -180 <= cafe_lon <= 180):
            raise ValueError
        free_radius, max_radius, extra_fee = delivery_config()
        distance = haversine(cafe_lat, cafe_lon, float(lat), float(lon))
        if distance is None:
            raise ValueError
        if distance > max_radius:
            return distance, None, free_radius, max_radius, extra_fee
        fee = 0 if distance <= free_radius else extra_fee
        return distance, fee, free_radius, max_radius, extra_fee
    except (TypeError, ValueError):
        raise ValueError('Pengaturan/titik lokasi Warkost tidak valid')

@bp.route('/')
def index():
    u=user()
    return render_template('index.html',u=u) if not u or u['role']=='customer' else redirect(url_for('main.dashboard'))

@bp.route('/login',methods=['GET','POST'])
def login():
    if request.method=='POST':
        ident=request.form.get('identity','').strip(); pw=request.form.get('password','')
        u=get_db().execute('SELECT * FROM users WHERE email=? OR phone=?',(ident,ident)).fetchone()
        if u and check_password_hash(u['password_hash'],pw) and u['status']=='active':
            session.clear(); session['user_id']=u['id']
            # On fresh V0.8, role is already correct. Existing V0.7 databases can be migrated later.
            return redirect(url_for(ROLE_HOME.get(u['role'],'main.index')))
        return render_template('login.html',error='Login gagal. Gunakan akun demo atau akun yang sudah terdaftar.')
    return render_template('login.html')

@bp.route('/v1/login')
def v1_login():
    return render_template('v1_login.html')

@bp.route('/v1/payment')
def v1_payment():
    return render_template('v1_payment.html')

@bp.route('/v1/customer/order')
def v1_customer_order_detail():
    return render_template('v1_customer_order_detail.html')

@bp.route('/v1/customer/orders')
def v1_customer_orders():
    return render_template('v1_customer_orders.html')

@bp.route('/v1/customer')
def v1_customer():
    return render_template('v1_customer.html')

@bp.route('/v1/app')
def v1_app():
    return render_template('v1_app.html')

@bp.route('/api/v1/config')
def v1_config():
    # Supabase anon key is a public browser credential; protect it with Supabase
    # RLS and configure allowed APIs/quotas in the Supabase/Google dashboards.
    return jsonify(
        url=os.environ.get('SUPABASE_URL','').strip(),
        anon_key=os.environ.get('SUPABASE_ANON_KEY','').strip()
    )

@bp.route('/api/v1/edge/<function_name>', methods=['POST'])
def v1_edge_proxy(function_name):
    """Allowlist-only proxy for customer V1 Edge Functions."""
    if function_name not in ('delivery-quote','order-create'):
        return jsonify(error='Edge function tidak diizinkan'),404
    token = request.headers.get('Authorization','').strip()
    if not token.startswith('Bearer '):
        return jsonify(error='Authentication required'),401
    supabase_url = os.environ.get('SUPABASE_URL','').strip()
    if not supabase_url:
        return jsonify(error='Supabase V1 belum dikonfigurasi.'),503
    import urllib.request, urllib.error, json as _json
    try:
        body=request.get_data(cache=True)
        req=urllib.request.Request(
            supabase_url.rstrip('/') + '/functions/v1/customer-' + function_name,
            data=body,
            headers={'Authorization':token,'Content-Type':'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req,timeout=15) as resp:
            raw=resp.read().decode('utf-8')
            return jsonify(_json.loads(raw)),resp.status
    except urllib.error.HTTPError as exc:
        try: payload=_json.loads(exc.read().decode('utf-8'))
        except Exception: payload={'error':'Customer service error'}
        return jsonify(payload),exc.code
    except Exception:
        return jsonify(error='Customer service tidak dapat dihubungi.'),502

@bp.route('/api/payment/create', methods=['POST'])
def payment_create():
    token = request.headers.get('Authorization','').strip()
    if not token.startswith('Bearer '):
        return jsonify(error='Authentication required'),401
    supabase_url = os.environ.get('SUPABASE_URL','').strip()
    if not supabase_url:
        return jsonify(error='Supabase V1 belum dikonfigurasi.'),503
    import urllib.request, urllib.error, json as _json
    try:
        body = request.get_data(cache=True)
        req = urllib.request.Request(
            supabase_url.rstrip('/') + '/functions/v1/payment-create',
            data=body,
            headers={'Authorization':token,'Content-Type':'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return jsonify(_json.loads(resp.read().decode('utf-8'))), resp.status
    except urllib.error.HTTPError as exc:
        try: payload=_json.loads(exc.read().decode('utf-8'))
        except Exception: payload={'error':'Payment service error'}
        return jsonify(payload),exc.code
    except Exception:
        return jsonify(error='Payment service tidak dapat dihubungi.'),502

@bp.route('/logout')
def logout(): session.clear(); return redirect(url_for('main.index'))

@bp.route('/api/products')
def products():
    rows=get_db().execute('SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.id').fetchall()
    return jsonify([dict(r) for r in rows])

@bp.route('/api/maps/config')
def maps_config():
    # Browser API keys are public credentials and must be restricted in Google Cloud
    # (HTTP referrers, APIs, quotas). Never put a server secret here.
    key = os.environ.get('GOOGLE_MAPS_API_KEY','').strip()
    try:
        cafe_lat = float(setting('cafe_latitude','-6.9218'))
        cafe_lon = float(setting('cafe_longitude','106.9270'))
        verified = str(setting('cafe_location_verified','0')).lower() in ('1','true','yes')
    except (TypeError, ValueError):
        cafe_lat, cafe_lon, verified = -6.9218, 106.9270, False
    return jsonify(api_key=key, cafe_latitude=cafe_lat, cafe_longitude=cafe_lon, cafe_location_verified=verified)

@bp.route('/api/order',methods=['POST'])
def create_order():
    if not require_role('customer'): return jsonify(error='Customer login required'),401
    data=request.json or {}; items=data.get('items',[])
    if not items: return jsonify(error='Keranjang kosong'),400
    name=data.get('name','').strip(); phone=data.get('phone','').strip(); address=data.get('address','').strip()
    lat=data.get('latitude'); lon=data.get('longitude')
    if not name or not phone or not address: return jsonify(error='Nama, HP aktif, dan alamat wajib diisi'),400
    if lat is None or lon is None: return jsonify(error='Pilih alamat dari rekomendasi peta terlebih dahulu agar titik tujuan terdeteksi.'),400
    try:
        lat=float(lat); lon=float(lon)
    except (TypeError, ValueError):
        return jsonify(error='Lokasi pengantaran tidak valid'),400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify(error='Lokasi pengantaran tidak valid'),400
    db=get_db(); subtotal=0; valid=[]
    for it in items:
        p=db.execute('SELECT * FROM products WHERE id=? AND active=1',(it.get('product_id'),)).fetchone()
        if not p: continue
        qty=max(1,int(it.get('qty',1)))
        if qty>p['stock']: return jsonify(error=f'Stock {p["name"]} hanya {p["stock"]}'),400
        subtotal += p['price']*qty; valid.append((p,qty,it.get('notes','')))
    if not valid:return jsonify(error='Produk tidak valid'),400
    try:
        distance, fee, free_radius, max_radius, extra_fee = calculate_delivery(lat, lon)
    except ValueError as exc:
        return jsonify(error=str(exc)),400
    if fee is None:
        return jsonify(error=f'Lokasi di luar radius delivery maksimal ({max_radius:g} km)'),400
    total=subtotal+fee
    order_no='WB-'+datetime.now().strftime('%y%m%d')+'-'+uuid.uuid4().hex[:5].upper()
    cur=db.execute('INSERT INTO orders(order_no,customer_id,customer_name,customer_phone,address,latitude,longitude,distance_km,delivery_fee,subtotal,total,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(order_no,user()['id'],name,phone,address,lat,lon,distance,fee,subtotal,total,'qris_btn'))
    oid=cur.lastrowid
    for p,q,n in valid:
        db.execute('INSERT INTO order_items(order_id,product_id,name,qty,price,notes) VALUES(?,?,?,?,?,?)',(oid,p['id'],p['name'],q,p['price'],n))
        db.execute('UPDATE products SET stock=stock-? WHERE id=?',(q,p['id']))
    db.execute('INSERT INTO payments(order_id,provider,status) VALUES(?,?,?)',(oid,'qris_btn','pending'))
    db.execute('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)',(user()['id'],'CREATE','order',oid,'Customer checkout'))
    db.commit(); return jsonify(order_id=oid,order_no=order_no,subtotal=subtotal,delivery_fee=fee,discount=0,total=total,status='pending_payment')

@bp.route('/api/simulate-payment/<int:oid>',methods=['POST'])
def simulate_payment(oid):
    if not require_role('customer'): return jsonify(error='Unauthorized'),403
    db=get_db(); o=db.execute('SELECT * FROM orders WHERE id=? AND customer_id=?',(oid,user()['id'])).fetchone()
    if not o:return jsonify(error='Order tidak ditemukan'),404
    db.execute("UPDATE payments SET status='paid',paid_at=CURRENT_TIMESTAMP,reference=? WHERE order_id=?",('SIM-'+uuid.uuid4().hex[:8],oid))
    db.execute("UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=?",(oid,))
    recipients=db.execute("SELECT id FROM users WHERE role IN ('admin','kasir','kitchen')").fetchall()
    for r in recipients: db.execute('INSERT INTO notifications(user_id,order_id,title,message) VALUES(?,?,?,?)',(r['id'],oid,'Order baru',f'Order {o["order_no"]} sudah dibayar.'))
    db.commit(); return jsonify(ok=True)

@bp.route('/api/delivery/quote',methods=['POST'])
def delivery_quote():
    if not require_role('customer'):
        return jsonify(error='Customer login required'),401
    data=request.json or {}
    try:
        lat=float(data.get('latitude')); lon=float(data.get('longitude'))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180): raise ValueError
        distance, fee, free_radius, max_radius, extra_fee = calculate_delivery(lat, lon)
    except (TypeError, ValueError):
        return jsonify(error='Lokasi pengantaran tidak valid'),400
    if fee is None:
        return jsonify(ok=False,available=False,distance_km=round(distance,2),free_radius_km=free_radius,max_radius_km=max_radius,extra_fee=extra_fee,error=f'Lokasi di luar radius delivery maksimal ({max_radius:g} km)'),400
    return jsonify(ok=True,available=True,distance_km=round(distance,2),free_radius_km=free_radius,max_radius_km=max_radius,delivery_fee=fee,extra_fee=extra_fee,message=('Gratis ongkir' if fee==0 else f'Ongkir {money(fee):,}'))

@bp.route('/api/order/<int:oid>')
def order_detail(oid):
    if not user(): return jsonify(error='Login required'),401
    db=get_db(); o=db.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
    if not o:return jsonify(error='Not found'),404
    if user()['role']=='customer' and o['customer_id']!=user()['id']:return jsonify(error='Forbidden'),403
    items=db.execute('SELECT * FROM order_items WHERE order_id=?',(oid,)).fetchall()
    return jsonify(order=dict(o),items=[dict(x) for x in items])

@bp.route('/api/admin/orders')
def admin_orders():
    if not require_role('admin','owner','kasir','kitchen'): return jsonify(error='Forbidden'),403
    rows=get_db().execute('SELECT * FROM orders ORDER BY id DESC').fetchall(); return jsonify([dict(r) for r in rows])

@bp.route('/api/order/<int:oid>/status',methods=['POST'])
def update_status(oid):
    role=user()['role'] if user() else None
    if role not in ('admin','owner','kasir','kitchen'):
        return jsonify(error='Forbidden'),403
    st=(request.json or {}).get('status')
    allowed={'confirmed','processing','ready','cancelled','completed'}
    if st not in allowed:return jsonify(error='Status tidak valid'),400
    db=get_db(); o=db.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
    if not o:return jsonify(error='Order tidak ditemukan'),404
    if not status_transition_allowed(role, o['status'], st, o['payment_status']):
        return jsonify(error=f'Role {role} tidak berhak mengubah {o["status"]} menjadi {st}'),403
    db.execute('UPDATE orders SET status=? WHERE id=?',(st,oid))
    db.execute('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)',(user()['id'],'UPDATE','order',oid,f'{o["status"]}->{st}'))
    db.commit(); return jsonify(ok=True,status=st)

@bp.route('/dashboard')
def dashboard():
    u=user()
    if not u: return redirect(url_for('main.login'))
    if u['role']=='customer': return redirect(url_for('main.index'))
    return render_template('dashboard.html',u=u)

# ---------- ADMIN: MENU / STOCK / SETTINGS ----------
@bp.route('/api/admin/products',methods=['GET','POST'])
def admin_products():
    if not require_role('admin','owner'):return jsonify(error='Forbidden'),403
    db=get_db()
    if request.method=='POST':
        d=request.json or {}; pid=d.get('id'); name=(d.get('name') or '').strip(); price=int(d.get('price') or 0); stock=int(d.get('stock') or 0); minimum=int(d.get('stock_minimum') or 0)
        if not name or price<0 or stock<0:return jsonify(error='Nama, harga, dan stock harus valid'),400
        if pid:
            db.execute('UPDATE products SET name=?,price=?,stock=?,stock_minimum=?,active=? WHERE id=?',(name,price,stock,minimum,1 if d.get('active',True) else 0,pid))
            action='UPDATE'
        else:
            cat=db.execute('SELECT id FROM categories ORDER BY id LIMIT 1').fetchone(); db.execute('INSERT INTO products(category_id,name,description,price,stock,stock_minimum) VALUES(?,?,?,?,?,?)',(cat['id'] if cat else None,name,d.get('description',''),price,stock,minimum)); action='CREATE'
        db.commit(); return jsonify(ok=True,action=action)
    rows=db.execute('SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.id').fetchall(); return jsonify([dict(r) for r in rows])

@bp.route('/api/admin/products/<int:pid>',methods=['DELETE'])
def delete_product(pid):
    if not require_role('admin','owner'):return jsonify(error='Forbidden'),403
    db=get_db(); db.execute('UPDATE products SET active=0 WHERE id=?',(pid,)); db.commit(); return jsonify(ok=True)

@bp.route('/api/admin/settings',methods=['GET','POST'])
def admin_settings():
    if not require_role('admin','owner'):return jsonify(error='Forbidden'),403
    db=get_db()
    if request.method=='POST':
        d=request.json or {}
        allowed={'delivery_free_radius_km','delivery_extra_fee','max_delivery_radius_km','cafe_latitude','cafe_longitude','cafe_location_verified','cafe_location_accuracy_m'}
        updates={k:d.get(k) for k in allowed if k in d}
        try:
            free=float(updates.get('delivery_free_radius_km', setting('delivery_free_radius_km','5')))
            extra=money(float(updates.get('delivery_extra_fee', setting('delivery_extra_fee','5000'))))
            max_radius=float(updates.get('max_delivery_radius_km', setting('max_delivery_radius_km','8')))
            cafe_lat=float(updates.get('cafe_latitude', setting('cafe_latitude','-6.9218')))
            cafe_lon=float(updates.get('cafe_longitude', setting('cafe_longitude','106.9270')))
            verified=str(updates.get('cafe_location_verified', setting('cafe_location_verified','0'))).lower() in ('1','true','yes')
            if free < 0 or max_radius <= 0 or extra < 0 or free > max_radius:
                raise ValueError('Radius gratis harus 0 atau lebih, radius maksimal harus lebih besar dari 0, dan radius gratis tidak boleh melebihi radius maksimal.')
            if not (-90 <= cafe_lat <= 90 and -180 <= cafe_lon <= 180):
                raise ValueError('Titik Warkost tidak valid.')
        except (TypeError, ValueError) as exc:
            return jsonify(error=str(exc)),400
        normalized={
            'delivery_free_radius_km':free,
            'delivery_extra_fee':extra,
            'max_delivery_radius_km':max_radius,
            'cafe_latitude':cafe_lat,
            'cafe_longitude':cafe_lon,
            'cafe_location_verified':1 if verified else 0,
            'cafe_location_accuracy_m':updates.get('cafe_location_accuracy_m', setting('cafe_location_accuracy_m','')),
        }
        for k,v in normalized.items():
            db.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(k,str(v)))
        db.commit()
    rows=db.execute('SELECT key,value FROM settings ORDER BY key').fetchall(); return jsonify({r['key']:r['value'] for r in rows})

# ---------- CAMPAIGN FOUNDATION ----------
@bp.route('/api/campaigns',methods=['GET','POST'])
def campaigns():
    if not require_role('admin','owner'):return jsonify(error='Forbidden'),403
    db=get_db()
    if request.method=='POST':
        d=request.json or {}; name=(d.get('name') or '').strip()
        if not name:return jsonify(error='Nama campaign wajib diisi'),400
        cur=db.execute('INSERT INTO campaigns(name,starts_at,ends_at,active) VALUES(?,?,?,?)',(name,d.get('starts_at'),d.get('ends_at'),1)); db.commit(); return jsonify(id=cur.lastrowid)
    return jsonify([dict(x) for x in db.execute('SELECT * FROM campaigns ORDER BY id DESC').fetchall()])

# ---------- DRIVER ----------
@bp.route('/api/driver/online',methods=['POST'])
def driver_online():
    if not require_role('driver'):return jsonify(error='Forbidden'),403
    online=1 if (request.json or {}).get('online') else 0; db=get_db(); db.execute('UPDATE drivers SET online=? WHERE user_id=?',(online,user()['id'])); db.commit(); return jsonify(online=bool(online))

@bp.route('/api/driver/claim/<int:oid>',methods=['POST'])
def claim(oid):
    if not require_role('driver'):return jsonify(error='Forbidden'),403
    db=get_db(); d=db.execute('SELECT * FROM drivers WHERE user_id=?',(user()['id'],)).fetchone()
    if not d or not d['online']:return jsonify(error='Driver harus ONLINE'),400
    existing=db.execute('SELECT ds.id FROM delivery_stops ds WHERE ds.order_id=?',(oid,)).fetchone()
    if existing:return jsonify(error='Order sudah ditugaskan'),409
    o=db.execute("SELECT * FROM orders WHERE id=? AND status IN ('confirmed','processing','ready') AND payment_status='paid'",(oid,)).fetchone()
    if not o:return jsonify(error='Order tidak tersedia'),404
    trip=db.execute("SELECT * FROM delivery_trips WHERE driver_id=? AND status='active' ORDER BY id DESC LIMIT 1",(user()['id'],)).fetchone()
    if not trip:
        trip=db.execute('INSERT INTO delivery_trips(driver_id) VALUES(?)',(user()['id'],)); trip_id=trip.lastrowid; db.execute('UPDATE drivers SET active_trip_id=? WHERE user_id=?',(trip_id,user()['id']))
    else: trip_id=trip['id']
    count=db.execute('SELECT COUNT(*) c FROM delivery_stops WHERE trip_id=?',(trip_id,)).fetchone()['c']
    db.execute('INSERT INTO delivery_stops(trip_id,order_id,sequence_no) VALUES(?,?,?)',(trip_id,oid,count+1)); db.execute("UPDATE orders SET status='assigned' WHERE id=?",(oid,)); db.commit(); return jsonify(ok=True)

@bp.route('/api/driver/stops')
def driver_stops():
    if not require_role('driver'):return jsonify(error='Forbidden'),403
    rows=get_db().execute("SELECT ds.*,o.order_no,o.customer_name,o.customer_phone,o.address,o.latitude,o.longitude,o.distance_km,o.total FROM delivery_stops ds JOIN delivery_trips dt ON dt.id=ds.trip_id JOIN orders o ON o.id=ds.order_id WHERE dt.driver_id=? AND ds.status!='completed' ORDER BY ds.id ASC",(user()['id'],)).fetchall(); return jsonify([dict(r) for r in rows])

@bp.route('/api/driver/complete/<int:stop_id>',methods=['POST'])
def complete(stop_id):
    if not require_role('driver'):return jsonify(error='Forbidden'),403
    db=get_db(); s=db.execute("SELECT ds.*,dt.driver_id,o.id oid,o.total FROM delivery_stops ds JOIN delivery_trips dt ON dt.id=ds.trip_id JOIN orders o ON o.id=ds.order_id WHERE ds.id=? AND dt.driver_id=?",(stop_id,user()['id'])).fetchone()
    if not s:return jsonify(error='Stop tidak ditemukan'),404
    f=request.files.get('photo')
    if not f:return jsonify(error='Foto pesanan wajib diupload'),400
    folder=os.path.join(current_app.instance_path,'proofs'); os.makedirs(folder,exist_ok=True); fn=secure_filename(f'{s["oid"]}_{uuid.uuid4().hex}.jpg'); f.save(os.path.join(folder,fn))
    db.execute("UPDATE delivery_stops SET status='completed',completed_at=CURRENT_TIMESTAMP,proof_photo=? WHERE id=?",(fn,stop_id)); db.execute("UPDATE orders SET status='completed' WHERE id=?",(s['oid'],)); db.execute("INSERT OR IGNORE INTO sales(order_id,revenue,channel,completed_at) VALUES(?,?,?,CURRENT_TIMESTAMP)",(s['oid'],s['total'],'delivery')); db.commit(); return jsonify(ok=True)

@bp.route('/api/notifications')
def notifications():
    if not user():return jsonify(error='Login required'),401
    rows=get_db().execute('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30',(user()['id'],)).fetchall(); return jsonify([dict(r) for r in rows])

@bp.route('/api/report')
def report():
    if not require_role('owner','admin'):return jsonify(error='Forbidden'),403
    db=get_db(); summary=db.execute("SELECT COUNT(*) orders,COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) completed FROM orders").fetchone(); products=db.execute("SELECT oi.name,SUM(oi.qty) qty,SUM(oi.qty*oi.price) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='completed' GROUP BY oi.name ORDER BY revenue DESC").fetchall(); return jsonify(summary=dict(summary),products=[dict(x) for x in products])

@bp.route('/api/printer',methods=['GET','POST'])
def printer():
    if not require_role('admin','owner'):return jsonify(error='Forbidden'),403
    db=get_db()
    if request.method=='POST':
        d=request.json or {}; db.execute('UPDATE printer_settings SET name=?,ip_address=?,port=?,auto_print=? WHERE id=1',(d.get('name'),d.get('ip_address'),d.get('port',9100),1 if d.get('auto_print',True) else 0)); db.commit()
    return jsonify(dict(db.execute('SELECT * FROM printer_settings WHERE id=1').fetchone()))
