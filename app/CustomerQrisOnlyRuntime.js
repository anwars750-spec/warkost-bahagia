"use client";

import { useEffect } from "react";

const FULFILLMENT_STYLE_ID = "warkost-fulfillment-choice-polish";

function installFulfillmentStyles() {
  if (document.getElementById(FULFILLMENT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = FULFILLMENT_STYLE_ID;
  style.textContent = `
    .customer-fulfillment-option {
      position: relative !important;
      min-height: 92px !important;
      padding-left: 76px !important;
      text-align: left !important;
    }

    .customer-fulfillment-option::before {
      content: "";
      position: absolute;
      left: 18px;
      top: 50%;
      width: 42px;
      height: 42px;
      transform: translateY(-50%);
      border: 1px solid rgba(164, 61, 30, .16);
      border-radius: 13px;
      background-color: #fff7f1;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 23px 23px;
      box-shadow: 0 7px 18px rgba(104, 44, 32, .08);
    }

    .customer-fulfillment-option:first-child::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239a341f' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10h16l-1.6-5H5.6L4 10Z'/%3E%3Cpath d='M6 10v9h12v-9'/%3E%3Cpath d='M9 19v-5h6v5'/%3E%3Cpath d='M4 10c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2'/%3E%3C/svg%3E");
    }

    .customer-fulfillment-option:nth-child(2)::before {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239a341f' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h11v10H3z'/%3E%3Cpath d='M14 10h4l3 3v3h-7z'/%3E%3Ccircle cx='7' cy='18' r='2'/%3E%3Ccircle cx='18' cy='18' r='2'/%3E%3Cpath d='M14 18h2M3 18h2'/%3E%3C/svg%3E");
    }

    .customer-fulfillment-option.is-active::before {
      border-color: rgba(164, 61, 30, .42);
      background-color: #fff0e6;
      box-shadow: 0 8px 20px rgba(154, 52, 31, .14);
    }

    .customer-benefit-action {
      min-width: 96px !important;
      min-height: 42px !important;
      padding: 10px 15px !important;
      border-radius: 12px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      letter-spacing: .01em !important;
      box-shadow: 0 5px 14px rgba(73, 42, 29, .07) !important;
      transition:
        transform 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease,
        box-shadow 160ms ease !important;
    }

    .customer-benefit-action.is-voucher.is-available {
      border-color: #d9987c !important;
      background: #fff8f3 !important;
      color: #9a3d24 !important;
    }

    .customer-benefit-action.is-voucher.is-available:hover {
      border-color: #b95c3d !important;
      background: #fff0e8 !important;
      box-shadow: 0 7px 18px rgba(154, 61, 36, .13) !important;
      transform: translateY(-1px);
    }

    .customer-benefit-action.is-loyalty.is-available {
      border-color: #dfba6a !important;
      background: #fff9e8 !important;
      color: #8a5a08 !important;
    }

    .customer-benefit-action.is-loyalty.is-available:hover {
      border-color: #c9962d !important;
      background: #fff3cf !important;
      box-shadow: 0 7px 18px rgba(161, 112, 18, .14) !important;
      transform: translateY(-1px);
    }

    .customer-benefit-action.is-claim {
      border-color: #d7a84c !important;
      background: linear-gradient(135deg, #fff7dc, #ffedb6) !important;
      color: #795008 !important;
      box-shadow: 0 6px 16px rgba(157, 108, 18, .12) !important;
    }

    .customer-benefit-action.is-claim:hover {
      border-color: #bb8622 !important;
      background: linear-gradient(135deg, #fff2c6, #ffe49a) !important;
      transform: translateY(-1px);
    }

    .customer-benefit-action.is-selected {
      border-color: #2f7d4a !important;
      background: linear-gradient(135deg, #2f7d4a, #24673d) !important;
      color: #fff !important;
      box-shadow: 0 7px 18px rgba(47, 125, 74, .22) !important;
    }

    .customer-benefit-action.is-selected:hover {
      border-color: #245f3a !important;
      background: linear-gradient(135deg, #2a7345, #205b36) !important;
    }

    .customer-benefit-action:disabled,
    .customer-benefit-action.is-disabled {
      border-color: #e4ddd5 !important;
      background: #f7f4ef !important;
      color: #a29991 !important;
      box-shadow: none !important;
      opacity: 1 !important;
      transform: none !important;
    }

    .voucher-option.selected {
      border-color: #9bc8aa !important;
      background: linear-gradient(135deg, #fffdf9, #f2fbf5) !important;
      box-shadow: 0 0 0 2px rgba(47, 125, 74, .08) !important;
    }

    .warkost-voucher-picker-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: 12px;
      padding: 14px 15px;
      border: 1px solid #eadfd6;
      border-radius: 15px;
      background: linear-gradient(135deg, #fffdf9, #fff7ef);
    }

    .warkost-voucher-picker-summary.has-selection {
      border-color: #a8d0b4;
      background: linear-gradient(135deg, #fffdf9, #f1faf4);
    }

    .warkost-voucher-picker-copy {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .warkost-voucher-picker-copy strong {
      color: #3b2922;
      font-size: 14px;
      line-height: 1.3;
    }

    .warkost-voucher-picker-summary.has-selection .warkost-voucher-picker-copy strong {
      color: #24673d;
    }

    .warkost-voucher-picker-copy small {
      color: #7a6b63;
      font-size: 11px;
      line-height: 1.45;
    }

    .warkost-voucher-picker-trigger {
      flex: 0 0 auto;
      min-height: 42px;
      padding: 10px 16px;
      border-color: #a94a2d !important;
      background: #fff8f3 !important;
      color: #943a23 !important;
      font-size: 12px;
      font-weight: 800;
    }

    .warkost-voucher-picker-trigger:hover {
      background: #fff0e8 !important;
      border-color: #8f331f !important;
    }

    .voucher-checkout-card .voucher-list.warkost-voucher-picker-list {
      display: none !important;
    }

    .voucher-checkout-card.is-voucher-picker-open .voucher-list.warkost-voucher-picker-list {
      position: fixed !important;
      z-index: 132 !important;
      top: 50% !important;
      left: 50% !important;
      display: grid !important;
      width: min(640px, calc(100vw - 36px)) !important;
      max-height: min(74vh, 680px) !important;
      margin: 0 !important;
      padding: 74px 20px 22px !important;
      overflow-y: auto !important;
      transform: translate(-50%, -50%) !important;
      border: 1px solid #e6d7cb !important;
      border-radius: 24px !important;
      background: #fffdf9 !important;
      box-shadow: 0 30px 90px rgba(48, 27, 20, .28) !important;
    }

    .voucher-checkout-card.is-voucher-picker-open .voucher-list.warkost-voucher-picker-list::before {
      content: "Pilih Promo";
      position: absolute;
      top: 19px;
      left: 21px;
      color: #35241f;
      font-size: 20px;
      font-weight: 850;
      letter-spacing: -.025em;
    }

    .voucher-checkout-card.is-voucher-picker-open .voucher-list.warkost-voucher-picker-list::after {
      content: "Pilih satu promo yang paling sesuai. Promo tidak dapat digabungkan.";
      position: absolute;
      top: 46px;
      left: 21px;
      right: 21px;
      color: #786960;
      font-size: 11px;
      line-height: 1.35;
    }

    .warkost-voucher-picker-backdrop {
      position: fixed;
      inset: 0;
      z-index: 131;
      display: none;
      background: rgba(36, 24, 20, .48);
      backdrop-filter: blur(4px);
    }

    .warkost-voucher-picker-backdrop.is-open {
      display: block;
    }

    body.warkost-voucher-picker-lock {
      overflow: hidden !important;
    }

    @media (max-width: 620px) {
      .customer-fulfillment-option {
        min-height: 86px !important;
        padding-left: 68px !important;
      }

      .customer-fulfillment-option::before {
        left: 14px;
        width: 38px;
        height: 38px;
        background-size: 21px 21px;
      }

      .customer-benefit-action {
        min-width: 94px !important;
        min-height: 40px !important;
        padding: 9px 13px !important;
      }

      .warkost-voucher-picker-summary {
        align-items: stretch;
        flex-direction: column;
        gap: 11px;
      }

      .warkost-voucher-picker-trigger {
        width: 100%;
      }

      .voucher-checkout-card.is-voucher-picker-open .voucher-list.warkost-voucher-picker-list {
        top: auto !important;
        bottom: 0 !important;
        left: 0 !important;
        width: 100% !important;
        max-height: 78vh !important;
        padding: 72px 16px 20px !important;
        transform: none !important;
        border-radius: 24px 24px 0 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeCheckoutAddressActions(root = document) {
  const checkout = root.querySelector(".customer-checkout");
  const fulfillmentCard = checkout?.querySelector(
    ".customer-fulfillment-card[data-mode]",
  );
  if (!checkout || !fulfillmentCard) return;

  const mode = String(fulfillmentCard.dataset.mode || "").toUpperCase();
  const actions = checkout.querySelectorAll(".checkout-address-actions");

  for (const container of actions) {
    const launchers = Array.from(
      container.querySelectorAll(".wloc-location-launcher"),
    );
    const originals = Array.from(
      container.querySelectorAll(
        ".quick-address-toggle:not(.wloc-location-launcher)",
      ),
    );

    if (mode === "PICKUP") {
      container.style.setProperty("display", "none", "important");
      container.setAttribute("aria-hidden", "true");
      continue;
    }

    container.style.removeProperty("display");
    container.removeAttribute("aria-hidden");

    if (launchers.length) {
      originals.forEach((button) => {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
        button.style.setProperty("display", "none", "important");
      });

      const [primaryLauncher, ...duplicates] = launchers;
      primaryLauncher.hidden = false;
      primaryLauncher.removeAttribute("aria-hidden");
      primaryLauncher.style.removeProperty("display");
      duplicates.forEach((button) => button.remove());
    } else {
      const [primaryOriginal, ...duplicates] = originals;
      if (primaryOriginal) {
        primaryOriginal.hidden = false;
        primaryOriginal.removeAttribute("aria-hidden");
        primaryOriginal.style.removeProperty("display");
      }
      duplicates.forEach((button) => button.remove());
    }
  }

  if (mode === "PICKUP") {
    checkout.querySelectorAll(".wloc-location-launcher").forEach((button) => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.style.setProperty("display", "none", "important");
    });
  }
}

function polishBenefitActions(root = document) {
  const checkout = root.querySelector(".customer-checkout");
  if (!checkout) return;

  const loyaltyButtons = checkout.querySelectorAll(
    ".loyalty-checkout-card .voucher-option > button",
  );

  loyaltyButtons.forEach((button) => {
    const option = button.closest(".voucher-option");
    const selected = option?.classList.contains("selected") ?? false;

    button.classList.add("customer-benefit-action", "is-loyalty");
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-available", !selected && !button.disabled);
    button.classList.toggle("is-disabled", button.disabled);
    button.setAttribute("aria-pressed", selected ? "true" : "false");

    if (selected && button.textContent?.trim() !== "✓ Dipakai") {
      button.textContent = "✓ Dipakai";
    } else if (
      !selected &&
      !button.disabled &&
      ["Dipilih", "Dipakai", "✓ Dipakai"].includes(button.textContent?.trim())
    ) {
      button.textContent = "Pakai";
    }
  });

  const voucherButtons = checkout.querySelectorAll(
    ".voucher-checkout-card .voucher-option > button",
  );

  voucherButtons.forEach((button) => {
    const option = button.closest(".voucher-option");
    const selected = option?.classList.contains("selected") ?? false;
    const label = button.textContent?.trim() || "";
    const claim = label === "Klaim";

    button.classList.add("customer-benefit-action", "is-voucher");
    button.classList.toggle("is-claim", claim && !button.disabled);
    button.classList.toggle("is-selected", selected);
    button.classList.toggle(
      "is-available",
      !claim && !selected && !button.disabled,
    );
    button.classList.toggle("is-disabled", button.disabled);
    button.setAttribute("aria-pressed", selected ? "true" : "false");

    if (selected && button.textContent?.trim() !== "✓ Dipakai") {
      button.textContent = "✓ Dipakai";
    } else if (
      !selected &&
      !button.disabled &&
      !claim &&
      ["Dipilih", "Dipakai", "✓ Dipakai"].includes(button.textContent?.trim())
    ) {
      button.textContent = "Pakai";
    }
  });
}

function closeVoucherPicker(root = document) {
  root
    .querySelectorAll(".voucher-checkout-card.is-voucher-picker-open")
    .forEach((card) => card.classList.remove("is-voucher-picker-open"));
  document
    .querySelector(".warkost-voucher-picker-backdrop")
    ?.classList.remove("is-open");
  document.body.classList.remove("warkost-voucher-picker-lock");
}

function polishVoucherPicker(root = document) {
  const checkout = root.querySelector(".customer-checkout");
  const card = checkout?.querySelector(".voucher-checkout-card");

  if (!card) {
    closeVoucherPicker(root);
    return;
  }

  const list = card.querySelector(".voucher-list");
  const options = list ? Array.from(list.querySelectorAll(".voucher-option")) : [];

  if (!list || !options.length) {
    card.querySelector(".warkost-voucher-picker-summary")?.remove();
    list?.classList.remove("warkost-voucher-picker-list");
    closeVoucherPicker(root);
    return;
  }

  list.classList.add("warkost-voucher-picker-list");

  let summary = card.querySelector(".warkost-voucher-picker-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "warkost-voucher-picker-summary";
    summary.innerHTML = `
      <span class="warkost-voucher-picker-copy">
        <strong>Promo tersedia</strong>
        <small>Pilih satu promo yang ingin digunakan.</small>
      </span>
      <button type="button" class="warkost-voucher-picker-trigger">Pilih Promo</button>
    `;
    list.insertAdjacentElement("beforebegin", summary);
  }

  const selectedOption = list.querySelector(".voucher-option.selected");
  const selectedTitle = selectedOption?.querySelector("strong")?.textContent?.trim();
  const copy = summary.querySelector(".warkost-voucher-picker-copy");
  const trigger = summary.querySelector(".warkost-voucher-picker-trigger");

  summary.classList.toggle("has-selection", Boolean(selectedOption));
  if (copy) {
    const title = copy.querySelector("strong");
    const detail = copy.querySelector("small");
    if (title)
      title.textContent = selectedTitle || `${options.length} promo tersedia`;
    if (detail)
      detail.textContent = selectedOption
        ? "Promo ini sedang dipakai pada pesananmu."
        : "Pilih satu promo yang paling menguntungkan untuk pesanan ini.";
  }
  if (trigger)
    trigger.textContent = selectedOption ? "Ganti Promo" : "Pilih Promo";

  let backdrop = document.querySelector(".warkost-voucher-picker-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "warkost-voucher-picker-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("click", () => closeVoucherPicker(document));
    document.body.appendChild(backdrop);
  }

  if (card.dataset.warkostVoucherPickerReady !== "1") {
    card.dataset.warkostVoucherPickerReady = "1";
    card.addEventListener("click", (event) => {
      const pickerTrigger = event.target.closest(".warkost-voucher-picker-trigger");
      if (pickerTrigger) {
        card.classList.add("is-voucher-picker-open");
        document
          .querySelector(".warkost-voucher-picker-backdrop")
          ?.classList.add("is-open");
        document.body.classList.add("warkost-voucher-picker-lock");
        return;
      }

      const benefitButton = event.target.closest(".voucher-option > button");
      if (!benefitButton) return;
      const label = benefitButton.textContent?.trim() || "";
      if (label === "Klaim") return;
      window.setTimeout(() => closeVoucherPicker(document), 0);
    });
  }
}

function enforceQrisOnly(root = document) {
  const cashInputs = root.querySelectorAll(
    'input[name="method"][value="CASH"]',
  );
  const qris = root.querySelector('input[name="method"][value="QRIS"]');

  if (!cashInputs.length && !qris) return;

  cashInputs.forEach((cash) => {
    const option =
      cash.closest(".payment-method-option") || cash.closest("label");

    if (option) {
      option.hidden = true;
      option.setAttribute("aria-hidden", "true");
      option.style.setProperty("display", "none", "important");
    }

    cash.disabled = true;
    cash.tabIndex = -1;
  });

  if (qris) {
    const qrisOption =
      qris.closest(".payment-method-option") || qris.closest("label");

    if (qrisOption) {
      qrisOption.style.setProperty("display", "", "");
      qrisOption.removeAttribute("aria-hidden");
    }

    if (!qris.checked) qris.click();
  }
}

export default function CustomerQrisOnlyRuntime() {
  useEffect(() => {
    let scheduled = false;

    installFulfillmentStyles();

    const apply = () => {
      enforceQrisOnly(document);
      normalizeCheckoutAddressActions(document);
      polishBenefitActions(document);
      polishVoucherPicker(document);
    };

    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeVoucherPicker(document);
    };

    apply();
    document.addEventListener("keydown", onKeyDown);

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["checked", "class", "data-mode", "disabled"],
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      closeVoucherPicker(document);
    };
  }, []);

  return null;
}
