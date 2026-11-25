"use client";

import { useRef, useState } from "react";
import { readAddressPoint } from "../lib/address-point.mjs";
import "./customer-account-address.css";

const emptyDraft = { label: "", detail: "", point: null, isDefault: false };
const missingPoint =
  "Pilih titik lokasi terlebih dahulu agar alamat tersimpan akurat.";

function AddressStep({ number, title, description }) {
  return (
    <div className="wloc-native-step-heading">
      <b aria-hidden="true">{number}</b>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </div>
  );
}

export default function CustomerAccountAddressLocationFirst({
  address,
  busy,
  saving,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = useState(() =>
    address
      ? {
          label: address.label,
          detail: address.detail,
          point: readAddressPoint(address.latitude, address.longitude),
          isDefault: address.is_default === 1,
        }
      : emptyDraft,
  );
  const [error, setError] = useState("");
  const form = useRef(null);

  function openPicker() {
    window.dispatchEvent(
      new CustomEvent("warkost:location-picker-open", {
        detail: {
          source: "account",
          address: { label: draft.label, detail: draft.detail, ...draft.point },
          applyAddress({ label, detail, latitude, longitude }) {
            const point = readAddressPoint(latitude, longitude);
            if (!form.current || !point) {
              throw new Error(
                "Form alamat belum siap atau titik lokasi tidak valid.",
              );
            }
            setDraft((current) => ({ ...current, label, detail, point }));
            setError("");
          },
        },
      }),
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.point) {
      setError(missingPoint);
      return;
    }
    if (busy || saving) return;

    setError("");
    try {
      const saved = await onSave(address?.id ?? null, {
        label: draft.label,
        detail: draft.detail,
        ...draft.point,
        isDefault: draft.isDefault,
      });
      if (saved) setDraft(emptyDraft);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <form className="wloc-native-location-first" ref={form} onSubmit={submit}>
      <h2>{address ? "Ubah alamat" : "Tambah alamat"}</h2>
      <section className="wloc-account-location-card">
        <AddressStep
          number={1}
          title="Pilih titik lokasi pengantaran"
          description="Pilih titik di peta atau gunakan GPS."
        />
        {draft.point && (
          <div className="wloc-account-point-summary">
            <strong>Lokasi terpilih</strong>
            <span>{draft.detail}</span>
          </div>
        )}
        <button
          className="wloc-account-picker-button wloc-account-picker-trigger"
          type="button"
          aria-haspopup="dialog"
          disabled={busy || saving}
          onClick={openPicker}
        >
          {draft.point ? "Ubah titik lokasi" : "Pilih titik lokasi"}
        </button>
        {!draft.point && (
          <small>Pilih titik untuk membuka detail alamat.</small>
        )}
      </section>

      {draft.point && (
        <>
          <section className="wloc-native-detail-section">
            <AddressStep
              number={2}
              title="Lengkapi detail alamat"
              description="Tambahkan nomor rumah atau patokan bila perlu."
            />
            <label>
              Alamat &amp; detail pengantaran
              <textarea
                name="detail"
                value={draft.detail}
                onChange={(event) =>
                  setDraft({ ...draft, detail: event.target.value })
                }
                disabled={saving}
                required
                minLength={10}
                maxLength={500}
              />
            </label>
          </section>
          <section className="wloc-native-label-section">
            <AddressStep
              number={3}
              title="Beri label alamat"
              description="Misalnya Rumah, Kantor, atau Kos."
            />
            <label>
              Label alamat
              <input
                name="label"
                value={draft.label}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
                disabled={saving}
                required
                minLength={2}
                maxLength={60}
              />
            </label>
          </section>
          <section className="wloc-native-default-section">
            <AddressStep
              number={4}
              title="Pilih sebagai alamat default"
              description="Opsional. Digunakan otomatis saat checkout berikutnya."
            />
            <label className="consent-field">
              <input
                name="isDefault"
                type="checkbox"
                checked={draft.isDefault}
                onChange={(event) =>
                  setDraft({ ...draft, isDefault: event.target.checked })
                }
                disabled={saving}
              />
              <span>Jadikan alamat default</span>
            </label>
          </section>
        </>
      )}
      <section className="wloc-native-save-section">
        {draft.point && (
          <>
            <small className="wloc-native-ready-note">
              Titik lokasi sudah valid.
            </small>
            <button type="submit" className="primary" disabled={busy || saving}>
              {saving ? "Menyimpan…" : "Simpan alamat"}
            </button>
          </>
        )}
        {address && (
          <button type="button" disabled={saving} onClick={onCancel}>
            Batal
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </form>
  );
}
