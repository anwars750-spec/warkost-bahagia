"use client";

import { useEffect } from "react";

const STYLE_ID = "wloc-account-location-first-native-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .wloc-native-location-first {
      display: grid !important;
      gap: 14px !important;
    }
    .wloc-native-location-first > .wloc-account-location-card {
      margin: 0 !important;
    }
    .wloc-native-step-hidden {
      display: none !important;
    }
    .wloc-native-step-heading {
      display: flex !important;
      align-items: flex-start !important;
      gap: 10px !important;
      margin: 0 0 7px !important;
      color: #352721 !important;
    }
    .wloc-native-step-heading > b {
      display: grid !important;
      place-items: center !important;
      width: 26px !important;
      height: 26px !important;
      flex: 0 0 26px !important;
      border-radius: 9px !important;
      background: #682c20 !important;
      color: #fff !important;
      font-size: 11px !important;
      line-height: 1 !important;
    }
    .wloc-native-step-heading > span {
      display: grid !important;
      gap: 2px !important;
    }
    .wloc-native-step-heading strong {
      font-size: 13px !important;
      color: #352721 !important;
    }
    .wloc-native-step-heading small {
      color: #81736b !important;
      font-size: 10.5px !important;
      line-height: 1.45 !important;
      font-weight: 500 !important;
    }
    .wloc-native-detail-section,
    .wloc-native-label-section,
    .wloc-native-default-section {
      display: grid !important;
      gap: 7px !important;
    }
    .wloc-native-default-section {
      padding: 12px 13px !important;
      border: 1px solid #eee3da !important;
      border-radius: 14px !important;
      background: #fffdf9 !important;
    }
    .wloc-native-default-section .consent-field {
      margin: 0 !important;
    }
    .wloc-native-save-section {
      display: grid !important;
      gap: 8px !important;
    }
    .wloc-native-save-section .primary {
      min-height: 48px !important;
      background: #682c20 !important;
      border-color: #682c20 !important;
      color: #fff !important;
    }
    .wloc-native-locked-note {
      display: block !important;
      margin-top: 1px !important;
      color: #8a786e !important;
      font-size: 10.5px !important;
      line-height: 1.45 !important;
    }
    .wloc-native-ready-note {
      display: none !important;
      margin-top: 1px !important;
      color: #682c20 !important;
      font-size: 10.5px !important;
      line-height: 1.45 !important;
      font-weight: 700 !important;
    }
    .wloc-native-location-first[data-wloc-point-ready="1"] .wloc-native-ready-note {
      display: block !important;
    }
    .wloc-native-location-first[data-wloc-point-ready="1"] .wloc-native-locked-note {
      display: none !important;
    }
    @media (max-width: 620px) {
      .wloc-native-save-section button {
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function findAddressForm() {
  return Array.from(document.querySelectorAll("form")).find((form) =>
    ["label", "detail", "latitude", "longitude"].every((name) =>
      form.elements?.namedItem(name),
    ),
  );
}

function makeStep(number, title, description) {
  const box = document.createElement("div");
  box.className = "wloc-native-step-heading";
  box.innerHTML = `
    <b>${number}</b>
    <span>
      <strong>${title}</strong>
      <small>${description}</small>
    </span>
  `;
  return box;
}

function hasValidCoordinatePair(latitudeField, longitudeField) {
  const latitudeValue = String(latitudeField?.value ?? "").trim();
  const longitudeValue = String(longitudeField?.value ?? "").trim();
  if (!latitudeValue || !longitudeValue) return false;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function syncAccountPointReadyState(
  form,
  latitudeField,
  longitudeField,
  sections,
) {
  const ready =
    form.dataset.wlocPointReady === "1" &&
    hasValidCoordinatePair(latitudeField, longitudeField);

  const nextReady = ready ? "1" : "0";
  if (form.dataset.wlocPointReady !== nextReady) {
    form.dataset.wlocPointReady = nextReady;
  }
  for (const section of sections) {
    const hidden = !ready;
    if (section.classList.contains("wloc-native-step-hidden") !== hidden) {
      section.classList.toggle("wloc-native-step-hidden", hidden);
    }
  }
  return ready;
}

function enhance(form) {
  if (!form || form.dataset.wlocNativeLocationFirst === "1") return;

  const labelField = form.elements.namedItem("label");
  const detailField = form.elements.namedItem("detail");
  const latitudeField = form.elements.namedItem("latitude");
  const longitudeField = form.elements.namedItem("longitude");
  const defaultField = form.elements.namedItem("isDefault");
  const heading = Array.from(form.children).find(
    (node) => /^H[1-3]$/.test(node.tagName) && /alamat/i.test(node.textContent || ""),
  );
  const labelWrap = labelField?.closest("label");
  const detailWrap = detailField?.closest("label");
  const legacyLocationCard = latitudeField?.closest(".location-card");
  const consentField = defaultField?.closest(".consent-field");
  const actions = Array.from(form.children).find((node) =>
    node.classList?.contains("actions"),
  );

  if (!heading || !labelWrap || !detailWrap || !actions) return;

  const pickerCard = form.querySelector(".wloc-account-location-card");
  if (!pickerCard) return;

  form.classList.add("wloc-native-location-first");
  form.dataset.wlocNativeLocationFirst = "1";

  heading.insertAdjacentElement("afterend", pickerCard);

  const detailSection = document.createElement("section");
  detailSection.className = "wloc-native-detail-section";
  detailSection.append(
    makeStep(
      2,
      "Lengkapi detail alamat",
      "Tambahkan nomor rumah, blok, RT/RW, lantai, atau patokan agar driver lebih mudah menemukan lokasi.",
    ),
    detailWrap,
  );

  const labelSection = document.createElement("section");
  labelSection.className = "wloc-native-label-section";
  labelSection.append(
    makeStep(
      3,
      "Beri label alamat",
      "Gunakan label sederhana seperti Rumah, Kantor, Kos, atau nama lain yang mudah dikenali.",
    ),
    labelWrap,
  );

  const defaultSection = document.createElement("section");
  defaultSection.className = "wloc-native-default-section";
  defaultSection.append(
    makeStep(
      4,
      "Pilih sebagai alamat default",
      "Opsional. Alamat default akan dipilih otomatis saat checkout berikutnya.",
    ),
  );
  if (consentField) defaultSection.append(consentField);

  const saveSection = document.createElement("section");
  saveSection.className = "wloc-native-save-section";
  saveSection.append(
    makeStep(
      5,
      "Simpan alamat",
      "Alamat hanya dapat disimpan setelah titik lokasi valid dipilih.",
    ),
    actions,
  );
  const lockedNote = document.createElement("small");
  lockedNote.className = "wloc-native-locked-note";
  lockedNote.textContent = "Pilih titik lokasi pada langkah 1 untuk membuka langkah berikutnya.";
  const readyNote = document.createElement("small");
  readyNote.className = "wloc-native-ready-note";
  readyNote.textContent = "Titik lokasi sudah valid. Lengkapi detail lalu simpan alamat.";
  saveSection.append(lockedNote, readyNote);

  pickerCard.insertAdjacentElement("afterend", detailSection);
  detailSection.insertAdjacentElement("afterend", labelSection);
  labelSection.insertAdjacentElement("afterend", defaultSection);
  defaultSection.insertAdjacentElement("afterend", saveSection);

  if (legacyLocationCard) legacyLocationCard.classList.add("wloc-native-step-hidden");

  function sync() {
    syncAccountPointReadyState(form, latitudeField, longitudeField, [
      detailSection,
      labelSection,
      defaultSection,
      saveSection,
    ]);
  }

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(form, {
    attributes: true,
    attributeFilter: ["data-wloc-point-ready"],
  });

  latitudeField?.addEventListener("input", sync);
  longitudeField?.addEventListener("input", sync);
  form._wlocNativeCleanup = () => {
    observer.disconnect();
    latitudeField?.removeEventListener("input", sync);
    longitudeField?.removeEventListener("input", sync);
  };
}

export default function CustomerAccountAddressLocationFirst() {
  useEffect(() => {
    installStyles();

    function install() {
      const form = findAddressForm();
      if (form) enhance(form);
    }

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const form = findAddressForm();
      form?._wlocNativeCleanup?.();
    };
  }, []);

  return null;
}
