"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
const money = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
async function api(route, body, signal) {
  const response = await fetch("/api/" + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Gagal memuat");
  return data;
}
export default function App() {
  const checkoutAttempt = useRef(null);
  const pollController = useRef(null);
  const [user, setUser] = useState(null),
    [menu, setMenu] = useState({
      products: [],
      categories: [],
      brand: "Warkost Bahagia",
    }),
    [orders, setOrders] = useState([]),
    [nextOrderCursor, setNextOrderCursor] = useState(null),
    [alerts, setAlerts] = useState({ notifications: [], unread: 0 }),
    [account, setAccount] = useState({
      addresses: [],
      loyalty: 0,
      transactions: [],
    }),
    [drivers, setDrivers] = useState([]),
    [customers, setCustomers] = useState([]),
    [customerCursor, setCustomerCursor] = useState(null),
    [customerSearch, setCustomerSearch] = useState(""),
    [inventory, setInventory] = useState({ products: [], categories: [] }),
    [dashboard, setDashboard] = useState(null),
    [stock, setStock] = useState({ products: [], movements: [] }),
    [audit, setAudit] = useState({ logs: [], nextCursor: null }),
    [report, setReport] = useState(null),
    [settings, setSettings] = useState({
      brandName: "Warkost Bahagia",
      rupiahPerPoint: 10000,
    }),
    [cart, setCart] = useState({}),
    [view, setView] = useState("menu"),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editingAddress, setEditingAddress] = useState(null),
    [selectedCategory, setSelectedCategory] = useState(0);
  async function loadCustomers(query = "", before = null) {
    const page = await api(
      "customers?q=" +
        encodeURIComponent(query) +
        (before === null ? "" : "&before=" + before),
    );
    setCustomers((previous) =>
      before === null ? page.customers : [...previous, ...page.customers],
    );
    setCustomerCursor(page.nextCursor);
  }
  function saveProductWithImage(body, file) {
    return run(async () => {
      if (file?.size > 0) {
        const form = new FormData();
        form.append("image", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "Gagal mengunggah gambar");
        body.imageUrl = result.url;
      }
      await api("product", body);
    });
  }
  async function refresh() {
    const [m, me] = await Promise.all([api("menu"), api("me")]);
    setMenu(m);
    setUser(me.user);
    if (me.user && me.user.role !== "CUSTOMER")
      setView((prev) => (prev === "menu" ? "orders" : prev));
    if (me.user) {
      const o = await api("orders");
      setOrders(o.orders);
      setNextOrderCursor(o.nextCursor);
      setAlerts(await api("notifications"));
      if (me.user.role === "CUSTOMER") setAccount(await api("account"));
      if (["ADMIN", "OWNER"].includes(me.user.role)) {
        setDrivers((await api("drivers")).drivers);
        setInventory(await api("inventory"));
        setDashboard(await api("dashboard"));
        setStock(await api("stock"));
        if (view === "reports")
          setReport(await api("report?date=" + (report?.date || "")));
        if (me.user.role === "ADMIN") {
          await loadCustomers(customerSearch);
          setSettings(await api("settings"));
        }
        if (me.user.role === "OWNER") setAudit(await api("audit"));
      }
    } else {
      setOrders([]);
      setNextOrderCursor(null);
      setCustomers([]);
      setCustomerSearch("");
    }
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!user) return;
    let running = false;
    const controller = new AbortController();
    pollController.current = controller;
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden" || running) return;
      running = true;
      try {
        const [latestOrders, latestAlerts] = await Promise.all([
          api("orders", undefined, controller.signal),
          api("notifications", undefined, controller.signal),
        ]);
        setOrders((previous) => {
          const fresh = new Set(latestOrders.orders.map((order) => order.id));
          return [
            ...latestOrders.orders,
            ...previous.filter((order) => !fresh.has(order.id)),
          ].sort((a, b) => b.id - a.id);
        });
        setNextOrderCursor((cursor) =>
          cursor === null
            ? null
            : Math.min(cursor, latestOrders.nextCursor ?? cursor),
        );
        setAlerts(latestAlerts);
        if (["ADMIN", "OWNER"].includes(user.role))
          setDashboard(await api("dashboard"));
        if (user.role === "CUSTOMER") setAccount(await api("account"));
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        running = false;
      }
    }, 20000);
    return () => {
      clearInterval(timer);
      controller.abort();
      if (pollController.current === controller) pollController.current = null;
    };
  }, [user?.id, user?.role]);
  async function run(fn) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submitAuth(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const data = await api(mode, {
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      });
      setUser(data.user);
      setView(data.user.role === "CUSTOMER" ? "menu" : "orders");
    });
  }
  const count = Object.values(cart).reduce((s, n) => s + n, 0),
    total = menu.products.reduce((s, p) => s + p.price * (cart[p.id] || 0), 0);
  function step(id, n) {
    setCart((old) => ({ ...old, [id]: Math.max(0, (old[id] || 0) + n) }));
  }
  const role = user?.role;
  return (
    <>
      <header className="top">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/warkost-bahagia-logo-transparent.png"
            alt="Warkost Bahagia"
            width={1672}
            height={941}
            priority
          />
          <div>
            <strong>{menu.brand}</strong>
            <small>Pesanan hangat, sampai dengan aman.</small>
          </div>
        </div>
        <nav>
          {role === "CUSTOMER" ? (
            <>
              <button onClick={() => setView("menu")}>Menu</button>
              <button onClick={() => setView("orders")}>Pesanan</button>
              <button onClick={() => setView("account")}>Akun</button>
            </>
          ) : role ? (
            <>
              <button onClick={() => setView("orders")}>
                {role === "ADMIN"
                  ? "Operasional"
                  : role === "KITCHEN"
                    ? "Dapur"
                    : role === "OWNER"
                      ? "Dashboard"
                      : "Tugas saya"}
              </button>
              {role === "ADMIN" && (
                <>
                  <button onClick={() => setView("products")}>Produk</button>
                  <button onClick={() => setView("drivers")}>Driver</button>
                  <button onClick={() => setView("customers")}>
                    Pelanggan
                  </button>
                  <button
                    onClick={async () => {
                      setView("reports");
                      try {
                        setReport(await api("report"));
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Laporan
                  </button>
                  <button onClick={() => setView("settings")}>
                    Pengaturan
                  </button>
                  <button onClick={() => setView("stock")}>Stok</button>
                </>
              )}
              {role === "OWNER" && (
                <>
                  <button onClick={() => setView("stock")}>Stok</button>
                  <button onClick={() => setView("audit")}>Audit log</button>
                  <button
                    onClick={async () => {
                      setView("reports");
                      try {
                        setReport(await api("report"));
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Laporan
                  </button>
                </>
              )}
            </>
          ) : null}
          {role && (
            <button onClick={() => setView("notifications")}>
              Notifikasi{alerts.unread > 0 ? ` · ${alerts.unread}` : ""}
            </button>
          )}
          {role ? (
            <button
              onClick={() =>
                run(async () => {
                  pollController.current?.abort();
                  await api("logout", {});
                  setUser(null);
                  setView("menu");
                })
              }
            >
              Keluar
            </button>
          ) : (
            <button onClick={() => setView("auth")}>Masuk</button>
          )}
        </nav>
      </header>
      <main>
        <div className="heading">
          <div>
            <span className="eyebrow">
              {role === "ADMIN"
                ? "PUSAT OPERASIONAL"
                : role === "KITCHEN"
                  ? "STASIUN DAPUR"
                  : role === "OWNER"
                    ? "KONTROL OWNER"
                    : role === "DRIVER"
                      ? "PENGANTARAN"
                      : "DAPUR WARKOST"}
            </span>
            <h1>
              {view === "notifications"
                ? "Notifikasi"
                : view === "customers" && role === "ADMIN"
                  ? "Kelola pelanggan"
                  : view === "reports" && role === "ADMIN"
                    ? "Laporan harian"
                    : view === "reports" && role === "OWNER"
                      ? "Laporan harian"
                      : view === "stock" && ["ADMIN", "OWNER"].includes(role)
                        ? "Kontrol stok"
                        : view === "audit" && role === "OWNER"
                          ? "Audit aktivitas"
                          : role === "KITCHEN"
                            ? "Antrean makanan"
                            : role === "OWNER"
                              ? "Ringkasan usaha"
                              : role === "ADMIN"
                                ? "Pantau pesanan hari ini"
                                : role === "DRIVER"
                                  ? "Tugas pengantaran"
                                  : view === "menu"
                                    ? "Mau makan apa hari ini?"
                                    : view === "orders"
                                      ? "Pesanan saya"
                                      : view === "account"
                                        ? "Akun saya"
                                        : "Selamat datang"}
            </h1>
          </div>
          {role === "CUSTOMER" && view === "menu" && (
            <button className="primary" onClick={() => setView("cart")}>
              Keranjang · {count} · {money(total)}
            </button>
          )}
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        {!role && view === "auth" ? (
          <section className="panel narrow">
            <div className="tabs">
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => setMode("login")}
              >
                Masuk
              </button>
              <button
                className={mode === "register" ? "active" : ""}
                onClick={() => setMode("register")}
              >
                Daftar pelanggan
              </button>
            </div>
            <form onSubmit={submitAuth}>
              {mode === "register" && (
                <label>
                  Nama
                  <input name="name" required minLength="2" />
                </label>
              )}
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 10 : 1}
                />
              </label>
              <button className="primary" disabled={busy}>
                {mode === "login" ? "Masuk" : "Buat akun"}
              </button>
            </form>
          </section>
        ) : null}
        {(!role || role === "CUSTOMER") && view === "menu" && (
          <>
            <div className="filters">
              <button
                className={!selectedCategory ? "active" : ""}
                onClick={() => setSelectedCategory(0)}
              >
                Semua
              </button>
              {menu.categories.map((c) => (
                <button
                  key={c.id}
                  className={selectedCategory === c.id ? "active" : ""}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="grid">
              {menu.products
                .filter(
                  (p) =>
                    !selectedCategory || p.category_id === selectedCategory,
                )
                .map((p) => (
                  <article className="product" key={p.id}>
                    <div className="food-visual">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} />
                      ) : (
                        <span>✦</span>
                      )}
                    </div>
                    <div className="product-body">
                      <small>
                        {
                          menu.categories.find((c) => c.id === p.category_id)
                            ?.name
                        }
                      </small>
                      <h2>{p.name}</h2>
                      <p>{p.description}</p>
                      <div className="product-foot">
                        <strong>{money(p.price)}</strong>
                        {role === "CUSTOMER" ? (
                          <div className="qty">
                            <button
                              onClick={() => step(p.id, -1)}
                              aria-label={"Kurangi " + p.name}
                            >
                              −
                            </button>
                            <span>{cart[p.id] || 0}</span>
                            <button
                              onClick={() => step(p.id, 1)}
                              aria-label={"Tambah " + p.name}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setView("auth")}>
                            Masuk untuk pesan
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {!menu.products.length && <p>Menu belum tersedia.</p>}
          </>
        )}
        {role === "CUSTOMER" && view === "cart" && (
          <section className="panel">
            <h2>Keranjang</h2>
            {menu.products
              .filter((p) => cart[p.id] > 0)
              .map((p) => (
                <div className="line" key={p.id}>
                  <span>
                    {p.name} · {cart[p.id]} × {money(p.price)}
                  </span>
                  <div className="qty">
                    <button onClick={() => step(p.id, -1)}>−</button>
                    <button onClick={() => step(p.id, 1)}>+</button>
                  </div>
                </div>
              ))}
            <div className="line">
              <strong>Total</strong>
              <strong>{money(total)}</strong>
            </div>
            {count > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    const payload = {
                      addressId: Number(f.get("address")),
                      method: f.get("method"),
                      items: menu.products
                        .filter((p) => cart[p.id] > 0)
                        .map((p) => ({
                          productId: p.id,
                          quantity: cart[p.id],
                        })),
                    };
                    const signature = JSON.stringify(payload);
                    if (checkoutAttempt.current?.signature !== signature)
                      checkoutAttempt.current = {
                        signature,
                        key: crypto.randomUUID(),
                      };
                    const result = await api("checkout", {
                      ...payload,
                      idempotencyKey: checkoutAttempt.current.key,
                    });
                    checkoutAttempt.current = null;
                    setCart({});
                    setView("orders");
                    setMessage("Pesanan #" + result.id + " berhasil dibuat");
                  });
                }}
              >
                <label>
                  Alamat pengantaran
                  <select name="address" required>
                    {account.addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.detail}
                      </option>
                    ))}
                  </select>
                </label>
                {!account.addresses.length && (
                  <p>Tambahkan alamat di halaman Akun terlebih dahulu.</p>
                )}
                <label>
                  Metode pembayaran
                  <select name="method">
                    <option value="CASH">Tunai saat diterima</option>
                    <option value="BANK_TRANSFER">
                      Transfer bank · verifikasi admin
                    </option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy || !account.addresses.length}
                >
                  Buat pesanan · {money(total)}
                </button>
              </form>
            )}
          </section>
        )}
        {role === "CUSTOMER" && view === "account" && (
          <div className="columns">
            <section className="panel">
              <h2>Alamat pengantaran</h2>
              {account.addresses.map((a) => (
                <div className="line" key={a.id}>
                  <span>
                    <strong>{a.label}</strong>
                    <br />
                    {a.detail}
                  </span>
                  <span className="actions">
                    <button onClick={() => setEditingAddress(a.id)}>
                      Ubah
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() => api("address-remove", { id: a.id }))
                      }
                    >
                      Hapus
                    </button>
                  </span>
                </div>
              ))}
              <form
                key={editingAddress || "new"}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    await api(editingAddress ? "address-replace" : "address", {
                      ...(editingAddress ? { id: editingAddress } : {}),
                      label: f.get("label"),
                      detail: f.get("detail"),
                    });
                    setEditingAddress(null);
                    e.target.reset();
                  });
                }}
              >
                <h2>{editingAddress ? "Ubah alamat" : "Tambah alamat"}</h2>
                <label>
                  Label
                  <input
                    name="label"
                    defaultValue={
                      account.addresses.find((a) => a.id === editingAddress)
                        ?.label || ""
                    }
                    placeholder="Rumah / Kantor"
                    required
                    minLength="2"
                  />
                </label>
                <label>
                  Alamat lengkap
                  <textarea
                    name="detail"
                    defaultValue={
                      account.addresses.find((a) => a.id === editingAddress)
                        ?.detail || ""
                    }
                    minLength="10"
                    required
                  />
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    Simpan alamat
                  </button>
                  {editingAddress && (
                    <button
                      type="button"
                      onClick={() => setEditingAddress(null)}
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
            </section>
            <section className="panel">
              <h2>Profil</h2>
              <p>
                {user.name} · {user.email}
              </p>
              <form
                key={user.name}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    const response = await api("profile", {
                      name: f.get("name"),
                      currentPassword: f.get("currentPassword"),
                      newPassword: f.get("newPassword"),
                    });
                    setUser(response.user);
                    setMessage("Profil diperbarui");
                    e.target.reset();
                  });
                }}
              >
                <label>
                  Nama
                  <input
                    name="name"
                    defaultValue={user.name}
                    required
                    minLength="2"
                  />
                </label>
                <label>
                  Password saat ini (jika mengganti password)
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  Password baru (opsional, minimal 12 karakter)
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Simpan profil
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>Poin loyalitas</h2>
              <div className="big-number">{account.loyalty} poin</div>
              <p>Poin diberikan saat pesanan selesai dikirim.</p>
              {account.transactions.map((t) => (
                <div className="line" key={t.id}>
                  <span>Pesanan #{t.order_id}</span>
                  <strong>+{t.amount}</strong>
                </div>
              ))}
            </section>
          </div>
        )}
        {["ADMIN", "OWNER"].includes(role) && view === "reports" && (
          <section className="panel">
            <h2>Ringkasan operasional</h2>
            <p>
              Pesanan dihitung menurut tanggal dibuat; revenue menurut tanggal
              pembayaran diverifikasi. Waktu mengikuti Asia/Jakarta.
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const date = new FormData(event.currentTarget).get("date");
                setBusy(true);
                setError("");
                try {
                  setReport(
                    await api("report?date=" + encodeURIComponent(date)),
                  );
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Tanggal
                <input
                  key={report?.date}
                  name="date"
                  type="date"
                  defaultValue={report?.date || ""}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Lihat laporan
              </button>
            </form>
            {report && (
              <>
                <div className="stats">
                  {[
                    ["Pesanan dibuat", report.orders.count],
                    ["Nilai pesanan aktif", money(report.orders.order_value)],
                    ["Pembayaran lunas", report.paid.count],
                    ["Revenue terverifikasi", money(report.paid.revenue)],
                  ].map(([label, value]) => (
                    <div className="stat" key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <h2>Status pesanan</h2>
                {report.statuses.map((item) => (
                  <div className="line" key={item.status}>
                    <span>{item.status}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!report.statuses.length && (
                  <p>Belum ada pesanan pada tanggal ini.</p>
                )}
                <h2>Produk terlaris</h2>
                {report.products.map((item) => (
                  <div className="line" key={item.product_id + ":" + item.name}>
                    <span>
                      {item.name} · {item.quantity} item
                    </span>
                    <strong>{money(item.value)}</strong>
                  </div>
                ))}
              </>
            )}
          </section>
        )}
        {role === "ADMIN" && view === "settings" && (
          <section className="panel narrow">
            <h2>Pengaturan café</h2>
            <form
              key={settings.brandName + settings.rupiahPerPoint}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  api("settings", {
                    brandName: f.get("brandName"),
                    rupiahPerPoint: Number(f.get("rupiahPerPoint")),
                  }),
                );
              }}
            >
              <label>
                Nama café
                <input
                  name="brandName"
                  defaultValue={settings.brandName}
                  minLength="2"
                  required
                />
              </label>
              <label>
                Rupiah per 1 poin
                <input
                  name="rupiahPerPoint"
                  type="number"
                  min="1000"
                  max="100000"
                  defaultValue={settings.rupiahPerPoint}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Simpan pengaturan
              </button>
            </form>
          </section>
        )}
        {role === "ADMIN" && view === "drivers" && (
          <section className="panel">
            <h2>Kelola driver</h2>
            <p>
              Driver dengan pengantaran aktif harus menyelesaikan tugas sebelum
              dinonaktifkan.
            </p>
            {drivers.map((d) => (
              <div className="line" key={d.id}>
                <span>
                  <strong>{d.name}</strong> · {d.email} ·{" "}
                  {d.active ? "Aktif" : "Nonaktif"}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api("driver-active", { id: d.id, active: !d.active }),
                    )
                  }
                >
                  {d.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
            <h2>Tambah driver</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await api("driver", {
                    name: f.get("name"),
                    email: f.get("email"),
                    password: f.get("password"),
                  });
                  e.target.reset();
                });
              }}
            >
              <label>
                Nama
                <input name="name" minLength="2" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Password awal (minimal 14 karakter)
                <input
                  name="password"
                  type="password"
                  minLength="14"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Buat akun driver
              </button>
            </form>
          </section>
        )}
        {role === "ADMIN" && view === "customers" && (
          <section className="panel">
            <h2>Daftar pelanggan</h2>
            <p>Pesanan aktif harus diselesaikan sebelum akun dinonaktifkan.</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const query = new FormData(event.currentTarget)
                  .get("search")
                  .toString()
                  .trim();
                setBusy(true);
                setError("");
                try {
                  await loadCustomers(query);
                  setCustomerSearch(query);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Cari nama atau email
                <input
                  name="search"
                  defaultValue={customerSearch}
                  maxLength="80"
                />
              </label>
              <button className="primary" disabled={busy}>
                Cari pelanggan
              </button>
            </form>
            {customers.map((customer) => (
              <div className="line" key={customer.id}>
                <span>
                  <strong>{customer.name}</strong> · {customer.email}
                  <br />
                  {customer.active ? "Aktif" : "Nonaktif"} ·{" "}
                  {customer.order_count} pesanan · {customer.points} poin
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api("customer-active", {
                        id: customer.id,
                        active: !customer.active,
                      }),
                    )
                  }
                >
                  {customer.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
            {!customers.length && <p>Belum ada pelanggan yang cocok.</p>}
            {customerCursor && (
              <button
                className="refresh"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await loadCustomers(customerSearch, customerCursor);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat pelanggan lain
              </button>
            )}
          </section>
        )}
        {role === "ADMIN" && view === "products" && (
          <section className="panel">
            <h2>Kelola kategori</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await api("category", { name: f.get("name") });
                  e.target.reset();
                });
              }}
            >
              <label>
                Nama kategori baru
                <input name="name" required minLength="2" />
              </label>
              <button className="primary" disabled={busy}>
                Tambah kategori
              </button>
            </form>
            {inventory.categories.map((c) => (
              <div className="line" key={c.id}>
                <span>
                  {c.name} · {c.active ? "Aktif" : "Nonaktif"}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api("category", {
                        id: c.id,
                        name: c.name,
                        active: !c.active,
                      }),
                    )
                  }
                >
                  {c.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            ))}
            <h2>Kelola produk</h2>
            {inventory.products.map((p) => (
              <ProductEditor
                key={p.id}
                product={p}
                categories={inventory.categories}
                busy={busy}
                onSave={saveProductWithImage}
              />
            ))}
            <h2>Tambah menu</h2>
            <ProductEditor
              categories={inventory.categories}
              busy={busy}
              onSave={saveProductWithImage}
            />
          </section>
        )}
        {["ADMIN", "OWNER"].includes(role) && view === "stock" && (
          <section className="panel">
            <h2>Stok produk</h2>
            <p>
              Admin hanya dapat menambah stok. Pengurangan manual hanya dapat
              dilakukan Owner dan selalu dicatat.
            </p>
            {stock.products.map((product) => (
              <form
                className="stock-row"
                key={product.id + ":" + product.stock_quantity}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  run(async () => {
                    await api("stock", {
                      productId: product.id,
                      quantity: Number(form.get("quantity")),
                      reason: form.get("reason"),
                    });
                    setMessage("Stok " + product.name + " diperbarui");
                  });
                }}
              >
                <div>
                  <strong>{product.name}</strong>
                  <small className="notification-date">
                    {product.prep_station === "KITCHEN" ? "Dapur" : "Kasir"}
                    {" · "}stok {product.stock_quantity}
                  </small>
                </div>
                <input
                  name="quantity"
                  type="number"
                  min={role === "ADMIN" ? "1" : undefined}
                  placeholder={role === "ADMIN" ? "+ jumlah" : "+ / − jumlah"}
                  required
                />
                <input
                  name="reason"
                  minLength="3"
                  maxLength="240"
                  placeholder="Alasan perubahan"
                  required
                />
                <button className="primary" disabled={busy}>
                  Simpan
                </button>
              </form>
            ))}
            <h2>100 pergerakan terakhir</h2>
            {stock.movements.map((movement) => (
              <div className="line" key={movement.id}>
                <span>
                  <strong>{movement.product_name}</strong> · {movement.kind}
                  <br />
                  {movement.reason} · {movement.actor_name || "Sistem"}
                </span>
                <strong>
                  {movement.quantity_delta > 0 ? "+" : ""}
                  {movement.quantity_delta}
                  {" → "}
                  {movement.balance_after}
                </strong>
              </div>
            ))}
          </section>
        )}
        {role === "OWNER" && view === "audit" && (
          <section className="panel">
            <h2>Audit log</h2>
            <p>
              Catatan bersifat hanya-baca dan diurutkan dari aktivitas terbaru.
            </p>
            {audit.logs.map((log) => (
              <div className="line audit-row" key={log.id}>
                <span>
                  <strong>{log.action}</strong>
                  <br />
                  {log.actor_name || "Sistem"} · {log.actor_role || "SYSTEM"} ·{" "}
                  {log.created_at}
                  {log.details && (
                    <small className="notification-date">{log.details}</small>
                  )}
                </span>
              </div>
            ))}
            {!audit.logs.length && <p>Belum ada aktivitas tercatat.</p>}
            {audit.nextCursor && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const next = await api("audit?before=" + audit.nextCursor);
                    setAudit({
                      logs: [...audit.logs, ...next.logs],
                      nextCursor: next.nextCursor,
                    });
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat aktivitas lama
              </button>
            )}
          </section>
        )}
        {role && view === "notifications" && (
          <section className="panel narrow">
            <h2>Kabar terbaru</h2>
            {alerts.notifications.length ? (
              alerts.notifications.map((n) => (
                <div className={n.read_at ? "line" : "line unread"} key={n.id}>
                  <div>
                    <strong>{n.message}</strong>
                    <small className="notification-date">{n.created_at}</small>
                  </div>
                  {!n.read_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() => api("notification-read", { id: n.id }))
                      }
                    >
                      Tandai dibaca
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p>Belum ada notifikasi.</p>
            )}
          </section>
        )}
        {role && view === "orders" && (
          <>
            <button
              className="refresh"
              onClick={() => run(async () => {})}
              disabled={busy}
            >
              Perbarui status
            </button>
            {["ADMIN", "OWNER"].includes(role) && dashboard && (
              <div className="stats">
                {[
                  ["Order hari ini", dashboard.today.orders],
                  [
                    "Revenue terverifikasi hari ini",
                    money(dashboard.today.revenue),
                  ],
                  [
                    "Menunggu",
                    dashboard.statuses.find((s) => s.status === "PENDING")
                      ?.count || 0,
                  ],
                  [
                    "Disiapkan",
                    dashboard.statuses.find((s) => s.status === "PREPARING")
                      ?.count || 0,
                  ],
                  [
                    "Siap antar",
                    dashboard.statuses.find((s) => s.status === "READY")
                      ?.count || 0,
                  ],
                  [
                    "Dalam pengantaran",
                    dashboard.statuses
                      .filter((s) =>
                        ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(
                          s.status,
                        ),
                      )
                      .reduce((n, s) => n + s.count, 0),
                  ],
                  [
                    "Selesai",
                    dashboard.statuses.find((s) => s.status === "DELIVERED")
                      ?.count || 0,
                  ],
                  ["Pelanggan", dashboard.customers],
                  ["Driver terdaftar", dashboard.drivers],
                  ["Aktivitas poin", dashboard.loyalty],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="order-list">
              {orders.map((o) => (
                <Order
                  key={o.id}
                  order={o}
                  role={role}
                  drivers={drivers}
                  busy={busy}
                  action={(route, body) =>
                    run(async () => {
                      await api(route, body);
                      setMessage("Pesanan #" + o.id + " diperbarui");
                    })
                  }
                />
              ))}
            </div>
            {!orders.length && <div className="panel">Belum ada pesanan.</div>}
            {nextOrderCursor && (
              <button
                className="refresh"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const page = await api("orders?before=" + nextOrderCursor);
                    setOrders((current) => {
                      const known = new Set(current.map((order) => order.id));
                      return [
                        ...current,
                        ...page.orders.filter((order) => !known.has(order.id)),
                      ].sort((a, b) => b.id - a.id);
                    });
                    setNextOrderCursor(page.nextCursor);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Muat pesanan lama
              </button>
            )}
          </>
        )}
      </main>
      <footer>
        Warkost Bahagia · Dibuat untuk operasional yang lebih rapi
      </footer>
    </>
  );
}
function Order({ order: o, role, drivers, busy, action }) {
  const [driver, setDriver] = useState("");
  const [details, setDetails] = useState(null);
  const [detailError, setDetailError] = useState("");
  const adminNext = {
    PENDING: "CONFIRMED",
  };
  const driverNext = {
    ASSIGNED: "PICKED_UP",
    PICKED_UP: "ON_DELIVERY",
    ON_DELIVERY: "DELIVERED",
  };
  return (
    <article className="panel order">
      <div className="order-head">
        <div>
          <small>
            #{o.id} · {o.created_at}
          </small>
          <h2>{o.customer_name || "Pesanan saya"}</h2>
        </div>
        <span className="badge">{o.status.replaceAll("_", " ")}</span>
      </div>
      <p>{o.address || ""}</p>
      <div className="line">
        <strong>{money(o.total)}</strong>
        <span>{o.payment_status || ""}</span>
      </div>
      {(o.kitchen_status || o.cashier_status) && (
        <div className="station-statuses">
          {o.kitchen_status && (
            <span className="badge">Dapur · {o.kitchen_status}</span>
          )}
          {o.cashier_status && (
            <span className="badge">Kasir · {o.cashier_status}</span>
          )}
        </div>
      )}
      <button
        onClick={() => {
          if (details) {
            setDetails(null);
            return;
          }
          api("order-items?id=" + o.id)
            .then(setDetails)
            .catch((e) => setDetailError(e.message));
        }}
      >
        {details ? "Tutup detail" : "Lihat item & riwayat"}
      </button>
      {detailError && <p role="alert">{detailError}</p>}
      {details && (
        <div className="order-details">
          {details.items.map((item, i) => (
            <div className="line" key={i}>
              <span>
                {item.quantity} × {item.name}
                {item.prep_station &&
                  ` · ${item.prep_station === "KITCHEN" ? "Dapur" : "Kasir"}`}
              </span>
              <strong>{money(item.quantity * item.price)}</strong>
            </div>
          ))}
          <small>Riwayat status</small>
          {details.events.map((event, i) => (
            <p key={i}>
              {event.created_at} · {event.next_status.replaceAll("_", " ")}
            </p>
          ))}
        </div>
      )}
      {["ADMIN", "OWNER"].includes(role) && (
        <div className="actions">
          {adminNext[o.status] && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("status", { orderId: o.id, status: adminNext[o.status] })
              }
            >
              Lanjutkan ke {adminNext[o.status]}
            </button>
          )}
          {role === "ADMIN" && o.cashier_status === "QUEUED" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", { orderId: o.id, status: "PREPARING" })
              }
            >
              Mulai siapkan minuman
            </button>
          )}
          {role === "ADMIN" && o.cashier_status === "PREPARING" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", { orderId: o.id, status: "READY" })
              }
            >
              Minuman siap
            </button>
          )}
          {o.status === "READY" && (
            <>
              <select
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              >
                <option value="">Pilih driver</option>
                {drivers
                  .filter((d) => d.active && Number(d.active_load) < 5)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.active_load}/5
                    </option>
                  ))}
              </select>
              <button
                className="primary"
                disabled={!driver || busy}
                onClick={() =>
                  action("status", {
                    orderId: o.id,
                    status: "ASSIGNED",
                    driverId: Number(driver),
                  })
                }
              >
                Tugaskan driver
              </button>
            </>
          )}
          {o.payment_status === "UNPAID" && (
            <button
              onClick={() =>
                action("payment", { orderId: o.id, status: "PAID" })
              }
              disabled={busy}
            >
              Tandai lunas
            </button>
          )}
        </div>
      )}
      {role === "KITCHEN" &&
        ["QUEUED", "PREPARING"].includes(o.kitchen_status) && (
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("station-status", {
                  orderId: o.id,
                  status: o.kitchen_status === "QUEUED" ? "PREPARING" : "READY",
                })
              }
            >
              {o.kitchen_status === "QUEUED" ? "Mulai masak" : "Makanan siap"}
            </button>
          </div>
        )}
      {role === "DRIVER" && driverNext[o.status] && (
        <div className="actions">
          {o.status === "ASSIGNED" && !o.accepted_at ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => action("accept", { orderId: o.id })}
            >
              Terima tugas
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action("status", {
                  orderId: o.id,
                  status: driverNext[o.status],
                })
              }
            >
              {o.status === "ASSIGNED"
                ? "Sudah diambil · Pickup"
                : o.status === "PICKED_UP"
                  ? "Mulai pengantaran"
                  : "Selesaikan pengantaran"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ProductEditor({ product: p, categories, busy, onSave }) {
  return (
    <form
      className="product-editor"
      key={p?.id || "new"}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave(
          {
            ...(p ? { id: p.id } : {}),
            name: f.get("name"),
            description: f.get("description"),
            price: Number(f.get("price")),
            categoryId: Number(f.get("categoryId")),
            imageUrl: f.get("imageUrl"),
            prepStation: f.get("prepStation"),
            active: f.get("active") === "on",
          },
          f.get("image"),
        );
      }}
    >
      <label>
        Nama
        <input
          name="name"
          defaultValue={p?.name || ""}
          required
          minLength="2"
        />
      </label>
      <label>
        Deskripsi
        <input name="description" defaultValue={p?.description || ""} />
      </label>
      <label>
        Harga (Rp)
        <input
          name="price"
          type="number"
          min="1"
          defaultValue={p?.price || ""}
          required
        />
      </label>
      <label>
        Kategori
        <select
          name="categoryId"
          defaultValue={p?.category_id || categories[0]?.id}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stasiun persiapan
        <select name="prepStation" defaultValue={p?.prep_station || "KITCHEN"}>
          <option value="KITCHEN">Dapur · makanan</option>
          <option value="CASHIER">Kasir · minuman</option>
        </select>
      </label>
      <label>
        URL gambar HTTPS atau unggahan (opsional)
        <input
          name="imageUrl"
          type="text"
          defaultValue={p?.image_url || ""}
          placeholder="https://..."
        />
      </label>
      <label>
        Unggah gambar menu (maksimal 8 MB)
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
        />
      </label>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={p ? p.active === 1 : true}
        />
        Tersedia untuk customer
      </label>
      <button className="primary" disabled={busy}>
        {p ? "Simpan " + p.name : "Tambah produk"}
      </button>
    </form>
  );
}
