"use client";

import { useEffect, useState } from "react";
import styles from "./ManagerBannerCenter.module.css";

function BannerForm({ banner, api, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      let imageUrl = banner?.image_url || "";
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
      if (!imageUrl) throw Error("Gambar banner wajib diunggah");
      await api("banner", {
        ...(banner ? { id: banner.id } : {}),
        internalName: form.get("internalName"),
        imageUrl,
        active: form.get("active") === "on",
        sortOrder: Number(form.get("sortOrder")),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-banner-form-title"
        onSubmit={submit}
      >
        <header className={styles.drawerHeader}>
          <div>
            <span>BANNER CUSTOMER</span>
            <h2 id="manager-banner-form-title">
              {banner ? "Edit Banner" : "Tambah Banner"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form banner"
          >
            ×
          </button>
        </header>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {banner?.image_url && (
          <div className={styles.formPreview}>
            <img src={banner.image_url} alt="Preview banner saat ini" />
          </div>
        )}

        <label className={styles.field}>
          Nama internal
          <input
            name="internalName"
            required
            minLength="2"
            maxLength="100"
            defaultValue={banner?.internal_name || ""}
            placeholder="Contoh: Banner Ramadan Utama"
          />
          <small>Hanya terlihat oleh Manager.</small>
        </label>

        <label className={styles.field}>
          {banner ? "Ganti gambar (opsional)" : "Gambar banner"}
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required={!banner}
          />
          <small>PNG, JPG, WEBP, atau AVIF · maks. 8 MB.</small>
        </label>

        <label className={styles.field}>
          Urutan tampil
          <input
            name="sortOrder"
            type="number"
            min="0"
            max="9999"
            required
            defaultValue={banner?.sort_order ?? 0}
          />
          <small>Angka lebih kecil tampil lebih dahulu.</small>
        </label>

        <label className={styles.switchField}>
          <input
            name="active"
            type="checkbox"
            defaultChecked={banner ? Boolean(banner.active) : true}
          />
          <span>Banner aktif dan tampil di Customer</span>
        </label>

        <footer className={styles.drawerFooter}>
          <button type="button" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button className={styles.primary} disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan Banner"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function ManagerBannerCenter({ banners, api, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function updateBanner(banner, changes) {
    setBusyId(banner.id);
    setError("");
    try {
      await api("banner", {
        id: banner.id,
        internalName: banner.internal_name,
        imageUrl: banner.image_url,
        active: Boolean(banner.active),
        sortOrder: Number(banner.sort_order),
        ...changes,
      });
      await onChanged();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeBanner(banner) {
    if (
      !window.confirm(
        `Hapus banner “${banner.internal_name}”? Tindakan ini tidak dapat dibatalkan.`,
      )
    )
      return;
    setBusyId(banner.id);
    setError("");
    try {
      await api("banner-delete", { id: banner.id });
      await onChanged();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.center}>
      <div className={styles.pageTitle}>
        <div>
          <span>TAMPILAN CUSTOMER</span>
          <h1>Kelola Banner</h1>
          <p>
            Banner berdiri sendiri dari promo. Customer hanya melihat gambar
            aktif sesuai urutan tampil.
          </p>
        </div>
        <button className={styles.primary} onClick={() => setEditing("new")}>
          ＋ Tambah Banner
        </button>
      </div>

      <section className={styles.summary} aria-label="Ringkasan banner">
        <article>
          <small>Total Banner</small>
          <strong>{banners.length}</strong>
        </article>
        <article>
          <small>Aktif</small>
          <strong>{banners.filter((banner) => banner.active).length}</strong>
        </article>
        <article>
          <small>Nonaktif</small>
          <strong>{banners.filter((banner) => !banner.active).length}</strong>
        </article>
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {banners.length ? (
        <section className={styles.grid} aria-label="Daftar banner">
          {banners.map((banner) => {
            const busy = busyId === banner.id;
            return (
              <article className={styles.card} key={banner.id}>
                <div className={styles.thumbnail}>
                  <img src={banner.image_url} alt="" />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardHeading}>
                    <div>
                      <small>NAMA INTERNAL</small>
                      <h2>{banner.internal_name}</h2>
                    </div>
                    <span
                      className={
                        banner.active ? styles.active : styles.inactive
                      }
                    >
                      {banner.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <div className={styles.orderRow}>
                    <span>
                      Urutan <strong>{banner.sort_order}</strong>
                    </span>
                    <small>
                      Diperbarui {String(banner.updated_at || "").slice(0, 16)}
                    </small>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={() => setEditing(banner)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateBanner(banner, {
                          active: !Boolean(banner.active),
                        })
                      }
                      disabled={busy}
                    >
                      {banner.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      className={styles.deleteButton}
                      type="button"
                      onClick={() => removeBanner(banner)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className={styles.empty}>
          <strong>Belum ada banner.</strong>
          <p>
            Customer tetap mendapat fallback visual yang aman sampai banner
            pertama ditambahkan dan diaktifkan.
          </p>
          <button className={styles.primary} onClick={() => setEditing("new")}>
            Tambah Banner Pertama
          </button>
        </section>
      )}

      {editing && (
        <BannerForm
          banner={editing === "new" ? null : editing}
          api={api}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
