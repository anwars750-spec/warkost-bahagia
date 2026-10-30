"use client";

import { useMemo, useState } from "react";

const FAMILY = [
  ["PERCENT_ITEM", "%", "Diskon Item (%)"],
  ["FIXED", "Rp", "Potongan Harga"],
  ["FREE_ITEM", "▣", "Gratis Item"],
  ["FIRST_MEMBER", "♙", "Member Pertama"],
  ["SCHEDULED", "▦", "Campaign Waktu"],
  ["BIRTHDAY", "♨", "Ulang Tahun"],
];
const familyName = (value) =>
  FAMILY.find(([key]) => key === value)?.[2] || "Promo Legacy";
const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const dateInput = (value) =>
  value ? String(value).replace(" ", "T").slice(0, 16) : "";
const endingSoon = (row) =>
  row.status === "ACTIVE" &&
  new Date(String(row.ends_at).replace(" ", "T") + "Z").getTime() -
    Date.now() <=
    3 * 86400000;

function statusLabel(row) {
  return (
    {
      ACTIVE: "AKTIF",
      SCHEDULED: "TERJADWAL",
      EXPIRED: "BERAKHIR",
      INACTIVE: "NONAKTIF",
    }[row.status] || row.status
  );
}

function PromoForm({ current, inventory, onClose, onSaved, api }) {
  const [family, setFamily] = useState(
    current?.promotion_family || "PERCENT_ITEM",
  );
  const [benefit, setBenefit] = useState(
    current?.benefit_type ||
      (family === "FREE_ITEM"
        ? "FREE_ITEM"
        : family === "FIXED"
          ? "FIXED"
          : "PERCENT"),
  );
  const [scope, setScope] = useState(current?.scope_type || "ORDER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const products = inventory.products || [];
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      let imageUrl = current?.image_url || "";
      const image = form.get("image");
      if (image?.size) {
        const upload = new FormData();
        upload.append("image", image);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: upload,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "Gagal mengunggah gambar");
        imageUrl = result.url;
      }
      const value = (name) => form.get(name) || null;
      await api("promotion", {
        ...(current ? { id: current.id } : {}),
        title: value("title"),
        description: value("description"),
        badge: value("badge"),
        terms: value("terms"),
        ctaLabel: "Lihat Promo",
        imageUrl,
        startsAt: new Date(value("startsAt")).toISOString(),
        endsAt: new Date(value("endsAt")).toISOString(),
        active: form.get("active") === "on",
        promotionFamily: family,
        benefitType: benefit,
        scopeType: scope,
        discountValue: Number(value("discountValue") || 0),
        minimumOrder: Number(value("minimumOrder") || 0),
        maxDiscount:
          value("maxDiscount") === null ? null : Number(value("maxDiscount")),
        quota: value("quota") === null ? null : Number(value("quota")),
        perMemberLimit: Number(value("perMemberLimit") || 1),
        targetProductId:
          scope === "PRODUCT" ? Number(value("targetProductId")) : null,
        targetCategoryId:
          scope === "CATEGORY" ? Number(value("targetCategoryId")) : null,
        targetSubcategoryId:
          scope === "SUBCATEGORY" ? Number(value("targetSubcategoryId")) : null,
        giftProductId:
          benefit === "FREE_ITEM" ? Number(value("giftProductId")) : null,
        registrationDays:
          family === "FIRST_MEMBER" && value("registrationDays")
            ? Number(value("registrationDays"))
            : null,
        birthdayWindowBefore:
          family === "BIRTHDAY"
            ? Number(value("birthdayWindowBefore") || 0)
            : 0,
        birthdayWindowAfter:
          family === "BIRTHDAY" ? Number(value("birthdayWindowAfter") || 0) : 0,
        scheduleType: value("scheduleType") || "RANGE",
        scheduleWeekdays: form.getAll("scheduleWeekdays"),
        scheduleMonthDays: value("scheduleMonthDays"),
        scheduleDates: value("scheduleDates"),
        timeStart: value("timeStart"),
        timeEnd: value("timeEnd"),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }
  const defaultStart =
    dateInput(current?.starts_at) || dateInput(new Date().toISOString());
  const defaultEnd =
    dateInput(current?.ends_at) ||
    dateInput(new Date(Date.now() + 30 * 86400000).toISOString());
  return (
    <div
      className="promo-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="promo-drawer" onSubmit={submit}>
        <header>
          <div>
            <small>BUAT &amp; ATUR RULE</small>
            <h2>{current ? "Edit Promo" : "Buat Promo Baru"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup">
            ×
          </button>
        </header>
        {error && (
          <p className="manager-error" role="alert">
            {error}
          </p>
        )}
        <section>
          <h3>
            <b>1</b> Jenis Promo
          </h3>
          <div className="promo-family-grid">
            {FAMILY.map(([key, icon, label]) => (
              <button
                className={family === key ? "active" : ""}
                type="button"
                key={key}
                onClick={() => {
                  setFamily(key);
                  if (key === "FREE_ITEM") setBenefit("FREE_ITEM");
                  else if (key === "FIXED") setBenefit("FIXED");
                  else if (["PERCENT_ITEM"].includes(key))
                    setBenefit("PERCENT");
                }}
              >
                <i>{icon}</i>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>
            <b>2</b> Benefit
          </h3>
          <div className="promo-form-grid">
            <label>
              Nama Promo
              <input
                name="title"
                required
                minLength="2"
                maxLength="100"
                defaultValue={current?.title || ""}
              />
            </label>
            <label>
              Badge
              <input
                name="badge"
                required
                defaultValue={current?.badge || "PROMO"}
              />
            </label>
            <label className="wide">
              Deskripsi
              <textarea
                name="description"
                required
                minLength="5"
                defaultValue={current?.description || ""}
              />
            </label>
            <label>
              Tipe Benefit
              <select
                value={benefit}
                onChange={(e) => setBenefit(e.target.value)}
                disabled={["PERCENT_ITEM", "FIXED", "FREE_ITEM"].includes(
                  family,
                )}
              >
                <option value="PERCENT">Persen</option>
                <option value="FIXED">Nominal</option>
                <option value="FREE_ITEM">Gratis Item</option>
              </select>
            </label>
            {benefit !== "FREE_ITEM" ? (
              <>
                <label>
                  Nilai {benefit === "PERCENT" ? "(%)" : "(Rp)"}
                  <input
                    name="discountValue"
                    type="number"
                    min="1"
                    max={benefit === "PERCENT" ? 100 : undefined}
                    required
                    defaultValue={current?.discount_value || ""}
                  />
                </label>
                <label>
                  Maksimum Diskon
                  <input
                    name="maxDiscount"
                    type="number"
                    min="0"
                    defaultValue={current?.max_discount ?? ""}
                  />
                </label>
              </>
            ) : (
              <label>
                Produk Hadiah
                <select
                  name="giftProductId"
                  required
                  defaultValue={current?.gift_product_id || ""}
                >
                  <option value="">Pilih produk</option>
                  {products
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="wide">
              Gambar Promo
              <input
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
              />
            </label>
          </div>
        </section>
        <section>
          <h3>
            <b>3</b> Target
          </h3>
          <div className="promo-form-grid">
            <label>
              Cakupan
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="ORDER">Seluruh order</option>
                <option value="PRODUCT">Produk</option>
                <option value="CATEGORY">Kategori</option>
                <option value="SUBCATEGORY">Subkategori</option>
              </select>
            </label>
            {scope === "PRODUCT" && (
              <label>
                Produk
                <select
                  name="targetProductId"
                  required
                  defaultValue={current?.target_product_id || ""}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scope === "CATEGORY" && (
              <label>
                Kategori
                <select
                  name="targetCategoryId"
                  required
                  defaultValue={current?.target_category_id || ""}
                >
                  {inventory.categories.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scope === "SUBCATEGORY" && (
              <label>
                Subkategori
                <select
                  name="targetSubcategoryId"
                  required
                  defaultValue={current?.target_subcategory_id || ""}
                >
                  {(inventory.subcategories || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Minimum Belanja
              <input
                name="minimumOrder"
                type="number"
                min="0"
                defaultValue={current?.minimum_order || 0}
              />
            </label>
          </div>
        </section>
        <section>
          <h3>
            <b>4</b> Customer Eligibility
          </h3>
          <div className="promo-form-grid">
            {family === "FIRST_MEMBER" && (
              <label>
                Berlaku setelah daftar (hari)
                <input
                  name="registrationDays"
                  type="number"
                  min="1"
                  defaultValue={current?.registration_days || 30}
                />
              </label>
            )}
            {family === "BIRTHDAY" && (
              <>
                <label>
                  Hari sebelum ulang tahun
                  <input
                    name="birthdayWindowBefore"
                    type="number"
                    min="0"
                    defaultValue={current?.birthday_window_before || 0}
                  />
                </label>
                <label>
                  Hari sesudah ulang tahun
                  <input
                    name="birthdayWindowAfter"
                    type="number"
                    min="0"
                    defaultValue={current?.birthday_window_after || 0}
                  />
                </label>
              </>
            )}
            <p className="promo-rule-note">
              {family === "BIRTHDAY"
                ? "Member sesuai tanggal lahir · dapat dipakai dengan COD dan loyalty."
                : family === "FIRST_MEMBER"
                  ? "Hanya member tanpa order DELIVERED + PAID sebelumnya."
                  : "Member Warkost · pembayaran QRIS atau Transfer."}
            </p>
          </div>
        </section>
        <section>
          <h3>
            <b>5</b> Schedule
          </h3>
          <div className="promo-form-grid">
            <label>
              Mulai
              <input
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={defaultStart}
              />
            </label>
            <label>
              Selesai
              <input
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={defaultEnd}
              />
            </label>
            <label>
              Pola
              <select
                name="scheduleType"
                defaultValue={current?.schedule_type || "RANGE"}
              >
                <option value="RANGE">Rentang tanggal</option>
                <option value="WEEKLY">Hari mingguan</option>
                <option value="MONTHLY">Tanggal bulanan</option>
                <option value="DATES">Tanggal spesifik</option>
              </select>
            </label>
            <label>
              Tanggal bulanan
              <input
                name="scheduleMonthDays"
                placeholder="1,15,30"
                defaultValue={current?.schedule_month_days || ""}
              />
            </label>
            <label className="wide">
              Tanggal spesifik
              <input
                name="scheduleDates"
                placeholder="2026-10-10,2026-10-17"
                defaultValue={current?.schedule_dates || ""}
              />
            </label>
            <div className="wide promo-weekdays">
              {[
                [1, "Sen"],
                [2, "Sel"],
                [3, "Rab"],
                [4, "Kam"],
                [5, "Jum"],
                [6, "Sab"],
                [0, "Min"],
              ].map(([day, label]) => (
                <label key={day}>
                  <input
                    name="scheduleWeekdays"
                    type="checkbox"
                    value={day}
                    defaultChecked={String(current?.schedule_weekdays || "")
                      .split(",")
                      .includes(String(day))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label>
              Jam mulai
              <input
                name="timeStart"
                type="time"
                defaultValue={current?.time_start || ""}
              />
            </label>
            <label>
              Jam selesai
              <input
                name="timeEnd"
                type="time"
                defaultValue={current?.time_end || ""}
              />
            </label>
          </div>
        </section>
        <section>
          <h3>
            <b>6</b> Payment Eligibility
          </h3>
          <p className="promo-rule-note">
            {family === "BIRTHDAY"
              ? "COD, QRIS, dan Transfer Bank."
              : "QRIS dan Transfer Bank. Promo reguler otomatis ditolak server pada COD."}
          </p>
        </section>
        <section>
          <h3>
            <b>7</b> Limits
          </h3>
          <div className="promo-form-grid">
            <label>
              Kuota total
              <input
                name="quota"
                type="number"
                min="1"
                defaultValue={current?.quota ?? ""}
              />
            </label>
            <label>
              Per member
              <input
                name="perMemberLimit"
                type="number"
                min="1"
                required
                defaultValue={current?.per_member_limit || 1}
              />
            </label>
            <label className="wide">
              Syarat / Ringkasan
              <textarea
                name="terms"
                required
                minLength="3"
                defaultValue={
                  current?.terms || "Berlaku sesuai ketentuan promo."
                }
              />
            </label>
            <label className="manager-switch wide">
              <input
                name="active"
                type="checkbox"
                defaultChecked={current ? Boolean(current.active) : true}
              />{" "}
              Aktifkan promo setelah disimpan
            </label>
          </div>
        </section>
        <section className="promo-preview">
          <h3>
            <b>8</b> Preview
          </h3>
          <p>
            <strong>{familyName(family)}</strong> ·{" "}
            {benefit === "FREE_ITEM"
              ? "hadiah item"
              : benefit === "PERCENT"
                ? "diskon persen"
                : "potongan nominal"}{" "}
            · {family === "BIRTHDAY" ? "semua metode bayar" : "QRIS/Transfer"}.
          </p>
        </section>
        <footer>
          <button type="button" onClick={onClose}>
            Batal
          </button>
          <button className="manager-primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan Promo"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function ManagerPromotionCenter({
  promotions,
  inventory,
  api,
  onChanged,
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const rows = useMemo(
    () =>
      promotions.filter(
        (row) =>
          `${row.title} ${row.description} ${familyName(row.promotion_family)}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (type === "all" || row.promotion_family === type) &&
          (status === "all" || row.status === status),
      ),
    [promotions, query, type, status],
  );
  const count = (value) =>
    promotions.filter((row) => row.status === value).length;
  return (
    <div className="manager-promo-center">
      <div className="manager-page-title">
        <div>
          <span>MANAJEMEN KOMERSIAL</span>
          <h1>Kelola Promo</h1>
          <p>Buat dan atur promosi dari satu sumber rule server Warkost.</p>
        </div>
        <button className="manager-primary" onClick={() => setEditing("new")}>
          ＋ Buat Promo
        </button>
      </div>
      <div className="promo-kpis">
        <article>
          <small>Total Promo</small>
          <strong>{promotions.length}</strong>
          <span>semua jenis promo</span>
        </article>
        <article className="green">
          <small>Promo Aktif</small>
          <strong>{count("ACTIVE")}</strong>
          <span>sedang berjalan</span>
        </article>
        <article className="amber">
          <small>Terjadwal</small>
          <strong>{count("SCHEDULED")}</strong>
          <span>akan dimulai</span>
        </article>
        <article className="amber">
          <small>Akan Berakhir</small>
          <strong>{promotions.filter(endingSoon).length}</strong>
          <span>≤ 3 hari lagi</span>
        </article>
        <article className="red">
          <small>Nonaktif / Berakhir</small>
          <strong>{count("EXPIRED") + count("INACTIVE")}</strong>
          <span>perlu ditinjau</span>
        </article>
      </div>
      <div className="promo-toolbar">
        <input
          aria-label="Cari promo"
          placeholder="Cari nama promo, jenis, atau deskripsi…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Semua jenis"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">Semua jenis</option>
          {FAMILY.map(([key, , label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Semua status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Semua status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SCHEDULED">Terjadwal</option>
          <option value="EXPIRED">Berakhir</option>
          <option value="INACTIVE">Nonaktif</option>
        </select>
      </div>
      <section className="manager-card promo-list">
        <div className="promo-list-head">
          <span>Promo</span>
          <span>Jenis Promo</span>
          <span>Periode &amp; Benefit</span>
          <span>Status</span>
          <span>Aksi</span>
        </div>
        {rows.map((row) => (
          <article key={row.id}>
            <div className="promo-name">
              <img src={row.image_url || "/demo/promo-warkost.webp"} alt="" />
              <span>
                <strong>{row.title}</strong>
                <small>{row.description}</small>
              </span>
            </div>
            <span className="promo-family">
              {familyName(row.promotion_family)}
            </span>
            <span>
              <strong>
                {row.benefit_type === "FREE_ITEM"
                  ? "Gratis item"
                  : row.benefit_type === "PERCENT"
                    ? `${row.discount_value}%`
                    : money(row.discount_value)}
              </strong>
              <small>
                {String(row.starts_at).slice(0, 10)} –{" "}
                {String(row.ends_at).slice(0, 10)}
              </small>
            </span>
            <span className={`promo-status ${row.status?.toLowerCase()}`}>
              {endingSoon(row) ? "BERAKHIR SEGERA" : statusLabel(row)}
            </span>
            <div>
              <button onClick={() => setEditing(row)}>Edit</button>
              <button
                aria-label={row.active ? "Nonaktifkan" : "Aktifkan"}
                onClick={async () => {
                  await api("promotion", {
                    ...row,
                    title: row.title,
                    description: row.description,
                    badge: row.badge,
                    terms: row.terms,
                    ctaLabel: row.cta_label,
                    imageUrl: row.image_url || "",
                    startsAt: new Date(
                      String(row.starts_at).replace(" ", "T") + "Z",
                    ).toISOString(),
                    endsAt: new Date(
                      String(row.ends_at).replace(" ", "T") + "Z",
                    ).toISOString(),
                    active: !row.active,
                    promotionFamily: row.promotion_family,
                    benefitType: row.benefit_type,
                    scopeType: row.scope_type,
                    targetProductId: row.target_product_id,
                    targetCategoryId: row.target_category_id,
                    targetSubcategoryId: row.target_subcategory_id,
                    giftProductId: row.gift_product_id,
                    registrationDays: row.registration_days,
                    birthdayWindowBefore: row.birthday_window_before,
                    birthdayWindowAfter: row.birthday_window_after,
                    scheduleType: row.schedule_type,
                    scheduleWeekdays: row.schedule_weekdays,
                    scheduleDates: row.schedule_dates,
                    scheduleMonthDays: row.schedule_month_days,
                    timeStart: row.time_start,
                    timeEnd: row.time_end,
                    perMemberLimit: row.per_member_limit,
                    discountValue: row.discount_value,
                    minimumOrder: row.minimum_order,
                    maxDiscount: row.max_discount,
                    quota: row.quota,
                  });
                  await onChanged();
                }}
              >
                {row.active ? "Nonaktifkan" : "Aktifkan"}
              </button>
            </div>
          </article>
        ))}
        {!rows.length && (
          <div className="manager-empty">Belum ada promo sesuai filter.</div>
        )}
      </section>
      <section className="promo-family-guide">
        <header>
          <span>JENIS PROMO YANG TERSEDIA</span>
          <h2>6 Jenis Promosi</h2>
        </header>
        <div>
          {FAMILY.map(([key, icon, label], index) => (
            <article key={key}>
              <i>{icon}</i>
              <strong>
                {index + 1}. {label}
              </strong>
              <p>Rule server-authoritative untuk {label.toLowerCase()}.</p>
            </article>
          ))}
        </div>
      </section>
      {editing && (
        <PromoForm
          current={editing === "new" ? null : editing}
          inventory={inventory}
          api={api}
          onSaved={onChanged}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
