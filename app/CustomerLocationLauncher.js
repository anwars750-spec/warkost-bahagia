"use client";

import { useEffect } from "react";
import CustomerLocationVisualLock from "./CustomerLocationVisualLock";

const ACCOUNT_STYLE_ID = "wloc-account-address-style";
const ACCOUNT_PICKER_EVENT = "warkost:location-picker-open";

function setNativeValue(field, value) {
  if (!field) return;
  field.value = value ?? "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function isCoordinatePairValid(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    String(latitude).trim() === "" ||
    String(longitude).trim() === ""
  )
    return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function findAddressFormCandidates() {
  return Array.from(document.querySelectorAll("form")).filter((form) => {
    const names = ["label", "detail", "latitude", "longitude"];
    return names.every((name) => form.elements?.namedItem(name));
  });
}

function findLegacyLocationButton(form) {
  const byClass = form.querySelector(".location-button");
  if (byClass) return byClass;
  return Array.from(
    form.querySelectorAll('button[type="button"], button:not([type])'),
  ).find((button) =>
    String(button.textContent || "")
      .trim()
      .toLowerCase()
      .includes("gunakan lokasi perangkat"),
  );
}

function replaceLabelCaption(labelElement, text) {
  if (!labelElement) return;
  const textNode = Array.from(labelElement.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );
  if (textNode) textNode.textContent = `${text}\n`;
}

function installAccountStyles() {
  if (document.getElementById(ACCOUNT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ACCOUNT_STYLE_ID;
  style.textContent = `
    form.wloc-account-location-first {
      display: grid !important;
      gap: 14px !important;
    }
    form.wloc-account-location-first > h2 { order: 0; }
    form.wloc-account-location-first > .wloc-account-location-card { order: 1; }
    form.wloc-account-location-first > .wloc-account-detail-field { order: 2; }
    form.wloc-account-location-first > .wloc-account-label-field { order: 3; }
    form.wloc-account-location-first > .wloc-account-default-zone { order: 4; }
    form.wloc-account-location-first > .wloc-account-save-actions { order: 5; }

    .wloc-account-location-card {
      display: grid !important;
      gap: 11px !important;
      margin: 2px 0 4px !important;
      padding: 15px !important;
      border: 1px solid #e2d9cf !important;
      border-radius: 17px !important;
      background: #fffaf4 !important;
      box-shadow: 0 7px 20px rgba(74,37,25,.06) !important;
    }
    .wloc-account-location-step {
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
    }
    .wloc-account-step-number {
      display: grid !important;
      width: 27px !important;
      height: 27px !important;
      flex: 0 0 27px !important;
      place-items: center !important;
      border-radius: 9px !important;
      background: #682c20 !important;
      color: #fff !important;
      font-size: 11px !important;
      font-weight: 850 !important;
    }
    .wloc-account-location-step strong {
      display: block !important;
      color: #352721 !important;
      font-size: 14px !important;
    }
    .wloc-account-location-card > small,
    .wloc-account-location-step small {
      color: #81736b !important;
      font-size: 11px !important;
      line-height: 1.5 !important;
    }
    .wloc-account-point-summary {
      display: none !important;
      gap: 4px !important;
      padding: 11px 12px !important;
      border: 1px solid #dfc9ba !important;
      border-radius: 13px !important;
      background: #fff !important;
    }
    .wloc-account-point-summary.is-ready { display: grid !important; }
    .wloc-account-point-summary strong {
      color: #682c20 !important;
      font-size: 11px !important;
      letter-spacing: .02em !important;
      text-transform: uppercase !important;
    }
    .wloc-account-point-summary span {
      color: #59463d !important;
      font-size: 12px !important;
      line-height: 1.5 !important;
      overflow-wrap: anywhere !important;
    }
    .wloc-account-picker-button {
      width: 100% !important;
      min-height: 47px !important;
      margin: 0 !important;
      border: 1px solid #682c20 !important;
      border-radius: 13px !important;
      background: #682c20 !important;
      color: #fff !important;
      font-weight: 780 !important;
      box-shadow: 0 8px 18px rgba(104,44,32,.16) !important;
    }
    .wloc-account-picker-button:hover {
      border-color: #843e2b !important;
      background: #843e2b !important;
    }
    .wloc-account-location-status {
      display: flex !important;
      align-items: flex-start !important;
      gap: 7px !important;
      min-height: 18px !important;
      color: #7b675c !important;
      font-size: 11px !important;
      line-height: 1.45 !important;
    }
    .wloc-account-location-status::before {
      content: "";
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
      margin-top: 4px;
      border-radius: 50%;
      background: #c7b8ad;
    }
    .wloc-account-location-status.is-ready {
      color: #682c20 !important;
      font-weight: 700 !important;
    }
    .wloc-account-location-status.is-ready::before {
      background: #a25931;
      box-shadow: 0 0 0 3px rgba(162,89,49,.12);
    }
    .wloc-account-location-status.is-error {
      color: #943b34 !important;
      font-weight: 700 !important;
    }
    .wloc-account-location-status.is-error::before { background: #b84a42; }

    .wloc-account-detail-field,
    .wloc-account-label-field,
    .wloc-account-default-zone,
    .wloc-account-save-actions {
      transition: opacity 160ms ease, filter 160ms ease !important;
    }
    form.wloc-account-location-first:not([data-wloc-point-ready="1"]) .wloc-account-detail-field,
    form.wloc-account-location-first:not([data-wloc-point-ready="1"]) .wloc-account-label-field,
    form.wloc-account-location-first:not([data-wloc-point-ready="1"]) .wloc-account-default-zone,
    form.wloc-account-location-first:not([data-wloc-point-ready="1"]) .wloc-account-save-actions {
      opacity: .48 !important;
      filter: grayscale(.15) !important;
    }
    .wloc-account-field-hint {
      display: block !important;
      margin-top: -2px !important;
      color: #8a786e !important;
      font-size: 10.5px !important;
      font-weight: 500 !important;
      line-height: 1.45 !important;
    }
    .wloc-account-default-zone {
      padding: 12px 13px !important;
      border: 1px solid #eee3da !important;
      border-radius: 14px !important;
      background: #fffdf9 !important;
    }
    .wloc-account-default-zone > .location-card-heading,
    .wloc-account-default-zone > .location-button,
    .wloc-account-default-zone > small {
      display: none !important;
    }
    .wloc-account-default-zone .consent-field {
      margin: 0 !important;
    }
    .wloc-account-save-actions .primary {
      min-height: 48px !important;
      border-color: #682c20 !important;
      background: #682c20 !important;
    }
    .wloc-account-location-legacy-hidden { display: none !important; }
    body.wloc-account-mode .wloc-manual,
    body.wloc-account-mode .wloc-footnote { display: none !important; }

    @media (max-width: 620px) {
      .wloc-account-location-card { padding: 13px !important; }
      .wloc-account-save-actions {
        display: grid !important;
        grid-template-columns: 1fr !important;
      }
      .wloc-account-save-actions button { width: 100% !important; }
    }
  `;
  document.head.appendChild(style);
}

export default function CustomerLocationLauncher() {
  useEffect(() => {
    const checkoutInstalled = new Set();
    const accountInstalled = new Set();
    installAccountStyles();

    function installCheckoutLauncher() {
      const actions = document.querySelectorAll(".checkout-address-actions");
      for (const container of actions) {
        if (container.dataset.wlocLauncherReady === "1") continue;
        const original = container.querySelector(
          ".quick-address-toggle:not(.wloc-location-launcher)",
        );
        if (!original) continue;

        const launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "quick-address-toggle wloc-location-launcher";
        launcher.textContent = "+ Tambah lokasi lain";
        launcher.setAttribute("aria-expanded", "false");
        launcher.setAttribute("aria-label", "Pilih lokasi pengantaran");

        original.hidden = true;
        original.setAttribute("aria-hidden", "true");
        original.insertAdjacentElement("afterend", launcher);
        container.dataset.wlocLauncherReady = "1";
        checkoutInstalled.add({ container, original, launcher });
      }

      const legacyForms = document.querySelectorAll(
        ".checkout-quick-address:not(.wloc-account-bridge-form)",
      );
      for (const form of legacyForms) {
        if (!form.dataset.wlocLegacyHidden) {
          form.dataset.wlocLegacyHidden = "1";
          form.style.display = "none";
        }
      }
    }

    function installAccountAddressPicker() {
      for (const form of findAddressFormCandidates()) {
        if (form.dataset.wlocAccountReady === "1") continue;

        const labelField = form.elements.namedItem("label");
        const detailField = form.elements.namedItem("detail");
        const latitudeField = form.elements.namedItem("latitude");
        const longitudeField = form.elements.namedItem("longitude");
        const defaultField = form.elements.namedItem("isDefault");
        const oldLocationButton = findLegacyLocationButton(form);
        const heading = Array.from(form.querySelectorAll("h1,h2,h3,strong")).find(
          (node) => /alamat/i.test(String(node.textContent || "")),
        );
        if (!oldLocationButton && !heading) continue;

        const labelWrap = labelField.closest("label");
        const detailWrap = detailField.closest("label");
        const defaultZone = defaultField?.closest(".location-card") || null;
        const saveActions = Array.from(form.querySelectorAll(".actions")).find(
          (node) => node.querySelector('button[type="submit"], button:not([type])'),
        );

        form.classList.add("wloc-account-location-first");
        labelWrap?.classList.add("wloc-account-label-field");
        detailWrap?.classList.add("wloc-account-detail-field");
        defaultZone?.classList.add("wloc-account-default-zone");
        saveActions?.classList.add("wloc-account-save-actions");

        replaceLabelCaption(labelWrap, "Label alamat");
        replaceLabelCaption(detailWrap, "Alamat & detail pengantaran");
        labelField.placeholder = "Rumah / Kantor / Kos / Lainnya";
        detailField.placeholder =
          "Alamat dari titik akan terisi otomatis. Tambahkan nomor rumah, RT/RW, lantai, atau patokan bila perlu.";

        const detailHint = document.createElement("small");
        detailHint.className = "wloc-account-field-hint";
        detailHint.textContent =
          "Alamat dasar berasal dari titik yang dipilih. Kamu boleh menambahkan detail agar driver lebih mudah menemukan lokasi.";
        detailWrap?.append(detailHint);

        if (oldLocationButton) {
          oldLocationButton.hidden = true;
          oldLocationButton.setAttribute("aria-hidden", "true");
          oldLocationButton.classList.add("wloc-account-location-legacy-hidden");
        }

        const card = document.createElement("div");
        card.className = "wloc-account-location-card";
        card.innerHTML = `
          <div class="wloc-account-location-step">
            <span class="wloc-account-step-number">1</span>
            <span>
              <strong>Pilih titik lokasi pengantaran</strong>
              <small>Cari alamat/tempat atau gunakan GPS agar driver menuju titik yang benar.</small>
            </span>
          </div>
          <div class="wloc-account-point-summary">
            <strong>Lokasi terpilih</strong>
            <span></span>
          </div>
        `;

        const pointSummary = card.querySelector(".wloc-account-point-summary");
        const pointSummaryText = pointSummary.querySelector("span");
        const pickerButton = document.createElement("button");
        pickerButton.type = "button";
        pickerButton.className =
          "wloc-account-picker-button wloc-account-picker-trigger";
        pickerButton.textContent = "Pilih titik lokasi";

        const status = document.createElement("span");
        status.className = "wloc-account-location-status";
        status.textContent = "Belum ada titik akurat yang dipilih.";
        card.append(pickerButton, status);

        if (heading?.parentElement === form) {
          heading.insertAdjacentElement("afterend", card);
        } else {
          form.prepend(card);
        }

        const bridgeForm = document.createElement("div");
        bridgeForm.className = "checkout-quick-address wloc-account-bridge-form";
        bridgeForm.style.display = "none";
        bridgeForm.innerHTML = `
          <input name="quickAddressLabel" />
          <textarea name="quickAddressDetail"></textarea>
          <input name="quickAddressLatitude" />
          <input name="quickAddressLongitude" />
          <div class="quick-address-buttons"><button type="button" class="primary">Apply</button></div>
        `;
        document.body.append(bridgeForm);

        const applyButton = bridgeForm.querySelector(".primary");
        const saveButton = saveActions?.querySelector(".primary") || null;

        function setFormLocked(locked) {
          labelField.disabled = locked;
          detailField.disabled = locked;
          if (defaultField) defaultField.disabled = locked;
          if (saveButton) saveButton.disabled = locked;
        }

        function resetStatus() {
          status.className = "wloc-account-location-status";
          status.textContent = "Belum ada titik akurat yang dipilih.";
          pickerButton.textContent = "Pilih titik lokasi";
          pointSummary.classList.remove("is-ready");
          pointSummaryText.textContent = "";
          delete form.dataset.wlocPointReady;
          setFormLocked(true);
        }

        function handleApply() {
          const selectedLabel = bridgeForm.querySelector(
            '[name="quickAddressLabel"]',
          )?.value;
          const selectedDetail = bridgeForm.querySelector(
            '[name="quickAddressDetail"]',
          )?.value;
          const selectedLatitude = bridgeForm.querySelector(
            '[name="quickAddressLatitude"]',
          )?.value;
          const selectedLongitude = bridgeForm.querySelector(
            '[name="quickAddressLongitude"]',
          )?.value;
          document.body.classList.remove("wloc-account-mode");

          if (!isCoordinatePairValid(selectedLatitude, selectedLongitude)) {
            status.className = "wloc-account-location-status is-error";
            status.textContent =
              "Titik belum akurat. Pilih hasil pencarian atau gunakan GPS.";
            pickerButton.textContent = "Pilih ulang titik lokasi";
            setFormLocked(true);
            return;
          }

          setNativeValue(labelField, selectedLabel || labelField.value || "Rumah");
          setNativeValue(detailField, selectedDetail || detailField.value);
          setNativeValue(latitudeField, Number(selectedLatitude).toFixed(6));
          setNativeValue(longitudeField, Number(selectedLongitude).toFixed(6));

          form.dataset.wlocPointReady = "1";
          pointSummary.classList.add("is-ready");
          pointSummaryText.textContent =
            selectedDetail || "Titik lokasi berhasil dipilih.";
          status.className = "wloc-account-location-status is-ready";
          status.textContent =
            "Titik akurat tersimpan. Lengkapi detail lalu simpan alamat.";
          pickerButton.textContent = "Ubah titik lokasi";
          setFormLocked(false);
          detailField.focus();
        }

        function openPicker(event) {
          event?.preventDefault();
          event?.stopPropagation();
          bridgeForm.querySelector('[name="quickAddressLabel"]').value =
            labelField.value || "";
          bridgeForm.querySelector('[name="quickAddressDetail"]').value = "";
          bridgeForm.querySelector('[name="quickAddressLatitude"]').value = "";
          bridgeForm.querySelector('[name="quickAddressLongitude"]').value = "";
          document.body.classList.add("wloc-account-mode");
          window.dispatchEvent(
            new CustomEvent(ACCOUNT_PICKER_EVENT, {
              detail: { source: "account" },
            }),
          );
        }

        function guardAccurateSubmit(event) {
          if (!isCoordinatePairValid(latitudeField.value, longitudeField.value)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            status.className = "wloc-account-location-status is-error";
            status.textContent =
              "Pilih titik lokasi terlebih dahulu agar alamat tersimpan akurat.";
            pickerButton.focus();
          }
        }

        pickerButton.addEventListener("click", openPicker);
        applyButton.addEventListener("click", handleApply);
        form.addEventListener("submit", guardAccurateSubmit, true);
        form.addEventListener("reset", resetStatus);
        form.dataset.wlocAccountReady = "1";
        setFormLocked(true);

        accountInstalled.add({
          form,
          oldLocationButton,
          card,
          detailHint,
          pickerButton,
          bridgeForm,
          applyButton,
          openPicker,
          handleApply,
          guardAccurateSubmit,
          resetStatus,
          labelWrap,
          detailWrap,
          defaultZone,
          saveActions,
        });
      }
    }

    function installAll() {
      installCheckoutLauncher();
      installAccountAddressPicker();
    }

    installAll();
    const observer = new MutationObserver(() => installAll());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.body.classList.remove("wloc-account-mode");

      for (const entry of checkoutInstalled) {
        entry.launcher.remove();
        entry.original.hidden = false;
        entry.original.removeAttribute("aria-hidden");
        delete entry.container.dataset.wlocLauncherReady;
      }

      for (const entry of accountInstalled) {
        entry.pickerButton.removeEventListener("click", entry.openPicker);
        entry.applyButton.removeEventListener("click", entry.handleApply);
        entry.form.removeEventListener("submit", entry.guardAccurateSubmit, true);
        entry.form.removeEventListener("reset", entry.resetStatus);
        entry.card.remove();
        entry.detailHint.remove();
        entry.bridgeForm.remove();
        entry.form.classList.remove("wloc-account-location-first");
        entry.labelWrap?.classList.remove("wloc-account-label-field");
        entry.detailWrap?.classList.remove("wloc-account-detail-field");
        entry.defaultZone?.classList.remove("wloc-account-default-zone");
        entry.saveActions?.classList.remove("wloc-account-save-actions");
        if (entry.oldLocationButton) {
          entry.oldLocationButton.hidden = false;
          entry.oldLocationButton.removeAttribute("aria-hidden");
          entry.oldLocationButton.classList.remove(
            "wloc-account-location-legacy-hidden",
          );
        }
        delete entry.form.dataset.wlocAccountReady;
      }

      const legacyForms = document.querySelectorAll(
        '.checkout-quick-address[data-wloc-legacy-hidden="1"]',
      );
      for (const form of legacyForms) {
        form.style.removeProperty("display");
        delete form.dataset.wlocLegacyHidden;
      }
    };
  }, []);

  return <CustomerLocationVisualLock />;
}
