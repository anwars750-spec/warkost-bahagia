"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const EMPTY = {
  brandName: "Warkost Bahagia",
  businessWhatsApp: "6281546407856",
  businessLatitude: -6.9217,
  businessLongitude: 106.9272,
  deliveryFreeKm: 5,
  deliveryFeePerKm: 2500,
  deliveryMaxKm: 15,
  paymentExpiryMinutes: 15,
  printerSimulation: true,
  adminPrinter: "LAN 80mm Admin (simulasi)",
  kitchenPrinter: "LAN 80mm Kitchen (simulasi)",
};

function ownerSignature() {
  return Boolean(
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    ),
  );
}

function findLegacySettingsPanel() {
  return [...document.querySelectorAll("main > section.panel")].find(
    (node) =>
      node
        .querySelector("h2")
        ?.textContent?.trim()
        .toLowerCase()
        .startsWith("pengaturan caf"),
  );
}

async function request(body) {
  const response = await fetch("/api/settings", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.error || "Pengaturan tidak dapat diproses");
  return result;
}

function normalize(settings) {
  return {
    ...EMPTY,
    ...(settings || {}),
    businessLatitude: Number(
      settings?.businessLatitude ?? EMPTY.businessLatitude,
    ),
    businessLongitude: Number(
      settings?.businessLongitude ?? EMPTY.businessLongitude,
    ),
    deliveryFreeKm: Number(settings?.deliveryFreeKm ?? EMPTY.deliveryFreeKm),
    deliveryFeePerKm: Number(
      settings?.deliveryFeePerKm ?? EMPTY.deliveryFeePerKm,
    ),
    deliveryMaxKm: Number(settings?.deliveryMaxKm ?? EMPTY.deliveryMaxKm),
    paymentExpiryMinutes: Number(
      settings?.paymentExpiryMinutes ?? EMPTY.paymentExpiryMinutes,
    ),
    printerSimulation: settings?.printerSimulation !== false,
  };
}

function rupiah(value) {
  const number = Number(value || 0);
  return `Rp${Number.isFinite(number) ? Math.round(number).toLocaleString("id-ID") : "0"}`;
}

function whatsappDisplay(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if (!raw) return "Belum diatur";
  return raw.startsWith("62") ? `+${raw}` : raw;
}

export default function OwnerSettingsCenter() {
  const [host, setHost] = useState(null);
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[data-owner-settings-legacy="true"]')
        .forEach((node) => {
          node.hidden = false;
          delete node.dataset.ownerSettingsLegacy;
        });
      document.getElementById("owner-settings-center-host")?.remove();
      document.body.classList.remove("owner-settings-center-active");
      setHost(null);
      setVisible(false);
    };

    const sync = () => {
      const legacy = findLegacySettingsPanel();
      if (!legacy || !ownerSignature()) {
        if (!legacy) cleanup();
        return;
      }
      legacy.dataset.ownerSettingsLegacy = "true";
      legacy.hidden = true;
      let target = document.getElementById("owner-settings-center-host");
      if (!target) {
        target = document.createElement("div");
        target.id = "owner-settings-center-host";
        legacy.insertAdjacentElement("beforebegin", target);
      }
      document.body.classList.add("owner-settings-center-active");
      setHost(target);
      setVisible(true);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, []);

  async function load() {
    if (!visible) return;
    setLoading(true);
    setError("");
    try {
      const next = normalize(await request());
      setSaved(next);
      setForm(next);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  const deliverySummary = useMemo(() => {
    const free = Number(form.deliveryFreeKm || 0);
    const max = Number(form.deliveryMaxKm || 0);
    const fee = Number(form.deliveryFeePerKm || 0);
    return `0–${free} km gratis · >${free}–${max} km ${rupiah(fee)}/km mulai · >${max} km tidak tersedia`;
  }, [form.deliveryFreeKm, form.deliveryFeePerKm, form.deliveryMaxKm]);

  function patch(key, value) {
    setMessage("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(saved);
    setError("");
    setMessage("Perubahan yang belum disimpan dibatalkan.");
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        brandName: String(form.brandName || "").trim(),
        rupiahPerPoint: 10000,
        businessWhatsApp: String(form.businessWhatsApp || "").trim(),
        businessLatitude: Number(form.businessLatitude),
        businessLongitude: Number(form.businessLongitude),
        deliveryFreeKm: Number(form.deliveryFreeKm),
        deliveryFeePerKm: Number(form.deliveryFeePerKm),
        deliveryMaxKm: Number(form.deliveryMaxKm),
        paymentExpiryMinutes: Number(form.paymentExpiryMinutes),
        printerSimulation: Boolean(form.printerSimulation),
        adminPrinter: String(form.adminPrinter || "").trim(),
        kitchenPrinter: String(form.kitchenPrinter || "").trim(),
      };
      const next = normalize(await request(payload));
      setSaved(next);
      setForm(next);
      setMessage(
        "Pengaturan tersimpan. Perubahan operasional berikutnya akan memakai konfigurasi ini.",
      );
      window.dispatchEvent(
        new CustomEvent("warkost:owner-settings-updated", { detail: next }),
      );
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  if (!host || !visible) return null;

  const content = (
    <form
      className="owner-settings-center"
      aria-label="Owner Settings Center"
      onSubmit={save}
    >
      <header className="osc-hero">
        <div>
          <span>OWNER BUSINESS SETTINGS</span>
          <h1>Pengaturan Operasional</h1>
          <p>
            Kelola konfigurasi yang memengaruhi customer, delivery, pembayaran,
            dan perangkat operasional Warkost dari satu tempat.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading || saving}>
          ↻ {loading ? "Memuat…" : "Perbarui"}
        </button>
      </header>

      <section className="osc-status-grid" aria-label="Ringkasan pengaturan">
        <article>
          <span>Brand</span>
          <strong>{form.brandName || "Warkost Bahagia"}</strong>
          <small>nama yang tampil pada sistem</small>
        </article>
        <article>
          <span>Delivery</span>
          <strong>{form.deliveryFreeKm}–{form.deliveryMaxKm} km</strong>
          <small>{form.deliveryFreeKm} km pertama gratis</small>
        </article>
        <article>
          <span>Pembayaran</span>
          <strong>{form.paymentExpiryMinutes} menit</strong>
          <small>batas pembayaran non-tunai</small>
        </article>
        <article className={form.printerSimulation ? "attention" : "ready"}>
          <span>Printer</span>
          <strong>{form.printerSimulation ? "Simulasi" : "Operasional"}</strong>
          <small>mode perangkat saat ini</small>
        </article>
      </section>

      {error && <div className="osc-feedback error">{error}</div>}
      {message && <div className="osc-feedback success">{message}</div>}

      <section className="osc-section">
        <header className="osc-section-head">
          <div className="osc-section-icon">B</div>
          <div>
            <span>INFORMASI BISNIS</span>
            <h2>Identitas & kontak</h2>
            <p>Informasi dasar yang dipakai pada pengalaman customer dan operasional.</p>
          </div>
        </header>
        <div className="osc-fields two">
          <label>
            <span>Nama bisnis</span>
            <input
              value={form.brandName}
              minLength={2}
              maxLength={80}
              required
              onChange={(e) => patch("brandName", e.target.value)}
            />
            <small>Nama yang ditampilkan sebagai identitas Warkost.</small>
          </label>
          <label>
            <span>WhatsApp bisnis</span>
            <input
              value={form.businessWhatsApp}
              inputMode="tel"
              required
              onChange={(e) => patch("businessWhatsApp", e.target.value)}
            />
            <small>Saat ini: {whatsappDisplay(form.businessWhatsApp)} · dipakai untuk bantuan customer.</small>
          </label>
        </div>
      </section>

      <section className="osc-section">
        <header className="osc-section-head">
          <div className="osc-section-icon">⌖</div>
          <div>
            <span>LOKASI OUTLET</span>
            <h2>Titik asal pengantaran</h2>
            <p>Koordinat ini menjadi titik awal perhitungan jarak dan ongkir.</p>
          </div>
        </header>
        <div className="osc-callout warning">
          <b>Dampak langsung ke ongkir</b>
          <span>Ubah koordinat hanya jika lokasi operasional Warkost benar-benar berpindah.</span>
        </div>
        <div className="osc-fields two">
          <label>
            <span>Latitude</span>
            <input
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              required
              value={form.businessLatitude}
              onChange={(e) => patch("businessLatitude", e.target.value)}
            />
          </label>
          <label>
            <span>Longitude</span>
            <input
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              required
              value={form.businessLongitude}
              onChange={(e) => patch("businessLongitude", e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="osc-section delivery">
        <header className="osc-section-head">
          <div className="osc-section-icon">↗</div>
          <div>
            <span>DELIVERY RULES</span>
            <h2>Radius & ongkir</h2>
            <p>Aturan ini dipakai server saat quote maupun saat order dibuat.</p>
          </div>
        </header>
        <div className="osc-rule-preview">
          <span>ATURAN AKTIF SETELAH DISIMPAN</span>
          <strong>{deliverySummary}</strong>
        </div>
        <div className="osc-fields three">
          <label>
            <span>Gratis sampai</span>
            <div className="osc-input-suffix">
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                required
                value={form.deliveryFreeKm}
                onChange={(e) => patch("deliveryFreeKm", e.target.value)}
              />
              <em>km</em>
            </div>
            <small>Radius bebas ongkir dari outlet.</small>
          </label>
          <label>
            <span>Biaya per km mulai</span>
            <div className="osc-input-prefix">
              <em>Rp</em>
              <input
                type="number"
                min="0"
                step="500"
                required
                value={form.deliveryFeePerKm}
                onChange={(e) => patch("deliveryFeePerKm", e.target.value)}
              />
            </div>
            <small>Dihitung per km mulai setelah radius gratis.</small>
          </label>
          <label>
            <span>Radius maksimum</span>
            <div className="osc-input-suffix">
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                required
                value={form.deliveryMaxKm}
                onChange={(e) => patch("deliveryMaxKm", e.target.value)}
              />
              <em>km</em>
            </div>
            <small>Di luar radius ini checkout diblokir.</small>
          </label>
        </div>
      </section>

      <section className="osc-section">
        <header className="osc-section-head">
          <div className="osc-section-icon">⌛</div>
          <div>
            <span>PAYMENT CONTROL</span>
            <h2>Batas waktu pembayaran</h2>
            <p>Menentukan berapa lama transaksi non-tunai menunggu pembayaran.</p>
          </div>
        </header>
        <div className="osc-fields payment">
          <label>
            <span>Payment expiry</span>
            <div className="osc-input-suffix">
              <input
                type="number"
                min="1"
                max="1440"
                step="1"
                required
                value={form.paymentExpiryMinutes}
                onChange={(e) => patch("paymentExpiryMinutes", e.target.value)}
              />
              <em>menit</em>
            </div>
            <small>Order yang tidak dibayar setelah periode ini dapat masuk status kedaluwarsa.</small>
          </label>
        </div>
      </section>

      <section className="osc-section">
        <header className="osc-section-head">
          <div className="osc-section-icon">▣</div>
          <div>
            <span>PRINTER & DEVICE</span>
            <h2>Printer operasional</h2>
            <p>Atur perangkat cetak Admin dan Kitchen serta mode simulasi.</p>
          </div>
        </header>

        <button
          className={`osc-switch-card ${form.printerSimulation ? "on" : "off"}`}
          type="button"
          role="switch"
          aria-checked={form.printerSimulation}
          onClick={() => patch("printerSimulation", !form.printerSimulation)}
        >
          <span className="osc-switch"><i /></span>
          <span>
            <strong>Mode simulasi printer</strong>
            <small>
              {form.printerSimulation
                ? "Aktif — cocok untuk demo/UAT tanpa printer fisik."
                : "Nonaktif — gunakan konfigurasi printer operasional yang tersedia."}
            </small>
          </span>
        </button>

        <div className="osc-fields two printer-fields">
          <label>
            <span>Printer Admin</span>
            <input
              minLength={3}
              maxLength={100}
              required
              value={form.adminPrinter}
              onChange={(e) => patch("adminPrinter", e.target.value)}
            />
            <small>Nama/identitas printer untuk struk area Admin.</small>
          </label>
          <label>
            <span>Printer Kitchen</span>
            <input
              minLength={3}
              maxLength={100}
              required
              value={form.kitchenPrinter}
              onChange={(e) => patch("kitchenPrinter", e.target.value)}
            />
            <small>Nama/identitas printer untuk tiket makanan Kitchen.</small>
          </label>
        </div>
      </section>

      <section className="osc-note">
        <div>i</div>
        <p>
          <strong>Jejak perubahan tetap tercatat.</strong>
          Setiap penyimpanan pengaturan masuk ke Audit Aktivitas agar Owner dapat
          melihat kapan konfigurasi penting diubah.
        </p>
      </section>

      <footer className="osc-actionbar">
        <div>
          <span>{dirty ? "Ada perubahan belum disimpan" : "Semua perubahan sudah tersimpan"}</span>
          <small>{dirty ? "Periksa kembali sebelum menerapkan ke operasional." : "Konfigurasi server dan tampilan ini sudah sinkron."}</small>
        </div>
        <div className="osc-actions">
          <button type="button" onClick={reset} disabled={!dirty || saving}>
            Batalkan perubahan
          </button>
          <button className="primary" type="submit" disabled={!dirty || saving}>
            {saving ? "Menyimpan…" : "Simpan Pengaturan"}
          </button>
        </div>
      </footer>
    </form>
  );

  return createPortal(content, host);
}
