"use client";

import { useEffect } from "react";
import CustomerLocationVisualLock from "./CustomerLocationVisualLock";

const ACCOUNT_STYLE_ID = "wloc-account-address-style";

function setNativeValue(field, value) {
  if (!field) return;
  field.value = value ?? "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function isCoordinatePairValid(latitude, longitude) {
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

function installAccountStyles() {
  if (document.getElementById(ACCOUNT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ACCOUNT_STYLE_ID;
  style.textContent = `
    .wloc-account-location-card {
      display: grid;
      gap: 9px;
      margin: 2px 0 4px;
      padding: 13px;
      border: 1px solid #e2d9cf;
      border-radius: 15px;
      background: #fffaf4;
    }
    .wloc-account-location-card > strong {
      color: #352721;
      font-size: 13px;
    }
    .wloc-account-location-card > small {
      color: #81736b;
      font-size: 11px;
      line-height: 1.45;
    }
    .wloc-account-picker-button {
      width: 100%;
      min-height: 46px;
      border: 1px solid #a25931 !important;
      border-radius: 13px !important;
      background: #682c20 !important;
      color: #fff !important;
      font-weight: 760 !important;
      box-shadow: 0 8px 18px rgba(104, 44, 32, 0.16);
    }
    .wloc-account-picker-button:hover {
      border-color: #843e2b !important;
      background: #843e2b !important;
    }
    .wloc-account-location-status {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      min-height: 18px;
      color: #7b675c;
      font-size: 11px;
      line-height: 1.45;
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
      color: #682c20;
      font-weight: 700;
    }
    .wloc-account-location-status.is-ready::before {
      background: #a25931;
      box-shadow: 0 0 0 3px rgba(162, 89, 49, 0.12);
    }
    .wloc-account-location-status.is-error {
      color: #943b34;
      font-weight: 700;
    }
    .wloc-account-location-status.is-error::before {
      background: #b84a42;
    }
    body.wloc-account-mode .wloc-manual,
    body.wloc-account-mode .wloc-footnote {
      display: none !important;
    }
    body.wloc-account-mode .wloc-section-title span {
      color: #7c665a;
    }
    body.wloc-account-mode .wloc-empty span::after {
      content: " Pilih lokasi dari pencarian atau gunakan GPS agar titik tersimpan akurat.";
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
      const panel = document.querySelector("#account-address");
      if (!panel) return;

      const forms = panel.querySelectorAll("form");
      for (const form of forms) {
        if (form.dataset.wlocAccountReady === "1") continue;

        const labelField = form.elements.namedItem("label");
        const detailField = form.elements.namedItem("detail");
        const latitudeField = form.elements.namedItem("latitude");
        const longitudeField = form.elements.namedItem("longitude");
        if (!labelField || !detailField || !latitudeField || !longitudeField)
          continue;

        const oldLocationButton = form.querySelector(".location-button");
        if (oldLocationButton) {
          oldLocationButton.hidden = true;
          oldLocationButton.setAttribute("aria-hidden", "true");
        }

        const card = document.createElement("div");
        card.className = "wloc-account-location-card";
        card.innerHTML = `
          <strong>Titik lokasi pengantaran</strong>
          <small>Pilih titik lewat pencarian lokasi atau GPS. Koordinat akan disimpan agar driver menuju titik yang benar.</small>
        `;

        const pickerButton = document.createElement("button");
        pickerButton.type = "button";
        pickerButton.className = "wloc-account-picker-button";
        pickerButton.textContent = "Pilih titik lokasi";

        const status = document.createElement("span");
        status.className = "wloc-account-location-status";
        status.textContent = "Belum ada titik akurat yang dipilih.";

        card.append(pickerButton, status);
        if (oldLocationButton) oldLocationButton.insertAdjacentElement("beforebegin", card);
        else detailField.closest("label")?.insertAdjacentElement("afterend", card);

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
        document.body.prepend(bridgeForm);

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "quick-address-toggle wloc-account-picker-trigger";
        trigger.hidden = true;
        trigger.setAttribute("aria-hidden", "true");
        document.body.prepend(trigger);

        const applyButton = bridgeForm.querySelector(".primary");

        function resetStatus() {
          status.className = "wloc-account-location-status";
          status.textContent = "Belum ada titik akurat yang dipilih.";
          pickerButton.textContent = "Pilih titik lokasi";
          delete form.dataset.wlocPointReady;
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
              "Titik belum akurat. Pilih lokasi dari hasil pencarian atau gunakan GPS.";
            pickerButton.textContent = "Pilih ulang titik lokasi";
            return;
          }

          setNativeValue(labelField, selectedLabel || labelField.value);
          setNativeValue(detailField, selectedDetail || detailField.value);
          setNativeValue(latitudeField, Number(selectedLatitude).toFixed(6));
          setNativeValue(longitudeField, Number(selectedLongitude).toFixed(6));
          form.dataset.wlocPointReady = "1";
          status.className = "wloc-account-location-status is-ready";
          status.textContent =
            "Titik lokasi sudah tersimpan dengan koordinat akurat. Kamu bisa menyimpan alamat.";
          pickerButton.textContent = "Ubah titik lokasi";
        }

        function openPicker() {
          bridgeForm.querySelector('[name="quickAddressLabel"]').value = "";
          bridgeForm.querySelector('[name="quickAddressDetail"]').value = "";
          bridgeForm.querySelector('[name="quickAddressLatitude"]').value = "";
          bridgeForm.querySelector('[name="quickAddressLongitude"]').value = "";
          document.body.classList.add("wloc-account-mode");
          trigger.click();
        }

        function guardAccurateSubmit(event) {
          if (
            !isCoordinatePairValid(latitudeField.value, longitudeField.value)
          ) {
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

        accountInstalled.add({
          form,
          oldLocationButton,
          card,
          pickerButton,
          bridgeForm,
          trigger,
          applyButton,
          openPicker,
          handleApply,
          guardAccurateSubmit,
          resetStatus,
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
        entry.bridgeForm.remove();
        entry.trigger.remove();
        if (entry.oldLocationButton) {
          entry.oldLocationButton.hidden = false;
          entry.oldLocationButton.removeAttribute("aria-hidden");
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
