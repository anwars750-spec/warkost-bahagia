"use client";

import { useEffect } from "react";

const STYLE_ID = "warkost-customer-loyalty-picker-style";
const BACKDROP_CLASS = "warkost-loyalty-picker-backdrop";
const BODY_LOCK_CLASS = "warkost-loyalty-picker-lock";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .loyalty-checkout-card .loyalty-summary {
      position: relative !important;
      display: grid !important;
      grid-template-columns: auto minmax(0, 1fr) auto !important;
      align-items: center !important;
      gap: 14px !important;
    }

    .warkost-loyalty-picker-trigger {
      flex: 0 0 auto;
      min-width: 118px;
      min-height: 42px;
      padding: 10px 16px;
      border-color: #d6aa4f !important;
      border-radius: 12px !important;
      background: linear-gradient(135deg, #fff9e8, #ffefbd) !important;
      color: #81570a !important;
      font-size: 12px;
      font-weight: 850;
      box-shadow: 0 6px 16px rgba(151, 103, 20, .11) !important;
    }

    .warkost-loyalty-picker-trigger:hover {
      border-color: #bd8725 !important;
      background: linear-gradient(135deg, #fff4d4, #ffe69f) !important;
      transform: translateY(-1px);
    }

    .warkost-loyalty-picker-trigger.has-selection {
      border-color: #2f7d4a !important;
      background: linear-gradient(135deg, #f2fbf5, #e5f5ea) !important;
      color: #24673d !important;
      box-shadow: 0 6px 16px rgba(47, 125, 74, .1) !important;
    }

    .warkost-loyalty-selected-summary {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-top: 11px;
      padding: 12px 14px;
      border: 1px solid #a8d0b4;
      border-radius: 14px;
      background: linear-gradient(135deg, #fffdf9, #f1faf4);
    }

    .warkost-loyalty-selected-summary.is-visible {
      display: flex;
    }

    .warkost-loyalty-selected-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .warkost-loyalty-selected-copy strong {
      color: #24673d;
      font-size: 13px;
      line-height: 1.35;
    }

    .warkost-loyalty-selected-copy small {
      color: #6e776f;
      font-size: 11px;
      line-height: 1.4;
    }

    .loyalty-checkout-card .loyalty-reward-list.warkost-loyalty-picker-list {
      display: none !important;
    }

    .loyalty-checkout-card.is-loyalty-picker-open .loyalty-reward-list.warkost-loyalty-picker-list {
      position: fixed !important;
      z-index: 134 !important;
      top: 50% !important;
      left: 50% !important;
      display: grid !important;
      width: min(640px, calc(100vw - 36px)) !important;
      max-height: min(74vh, 680px) !important;
      margin: 0 !important;
      padding: 76px 20px 22px !important;
      overflow-y: auto !important;
      transform: translate(-50%, -50%) !important;
      border: 1px solid #e6d7cb !important;
      border-radius: 24px !important;
      background: #fffdf9 !important;
      box-shadow: 0 30px 90px rgba(48, 27, 20, .28) !important;
    }

    .loyalty-checkout-card.is-loyalty-picker-open .loyalty-reward-list.warkost-loyalty-picker-list::before {
      content: "Redeem Poin";
      position: absolute;
      top: 19px;
      left: 21px;
      color: #35241f;
      font-size: 20px;
      font-weight: 850;
      letter-spacing: -.025em;
    }

    .loyalty-checkout-card.is-loyalty-picker-open .loyalty-reward-list.warkost-loyalty-picker-list::after {
      content: "Pilih satu reward sesuai saldo poin. Reward loyalty tidak dapat digabung dengan promo biasa.";
      position: absolute;
      top: 46px;
      left: 21px;
      right: 21px;
      color: #786960;
      font-size: 11px;
      line-height: 1.35;
    }

    .${BACKDROP_CLASS} {
      position: fixed;
      inset: 0;
      z-index: 133;
      display: none;
      background: rgba(36, 24, 20, .48);
      backdrop-filter: blur(4px);
    }

    .${BACKDROP_CLASS}.is-open {
      display: block;
    }

    body.${BODY_LOCK_CLASS} {
      overflow: hidden !important;
    }

    @media (max-width: 620px) {
      .loyalty-checkout-card .loyalty-summary {
        grid-template-columns: auto minmax(0, 1fr) !important;
      }

      .warkost-loyalty-picker-trigger {
        grid-column: 1 / -1;
        width: 100%;
        margin-top: 2px;
      }

      .warkost-loyalty-selected-summary.is-visible {
        align-items: flex-start;
        flex-direction: column;
      }

      .loyalty-checkout-card.is-loyalty-picker-open .loyalty-reward-list.warkost-loyalty-picker-list {
        top: auto !important;
        bottom: 0 !important;
        left: 0 !important;
        width: 100% !important;
        max-height: 78vh !important;
        padding: 74px 16px 20px !important;
        transform: none !important;
        border-radius: 24px 24px 0 0 !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function closeLoyaltyPicker(root = document) {
  root
    .querySelectorAll(".loyalty-checkout-card.is-loyalty-picker-open")
    .forEach((card) => card.classList.remove("is-loyalty-picker-open"));
  document.querySelector(`.${BACKDROP_CLASS}`)?.classList.remove("is-open");
  document.body.classList.remove(BODY_LOCK_CLASS);
}

function ensureBackdrop() {
  let backdrop = document.querySelector(`.${BACKDROP_CLASS}`);
  if (backdrop) return backdrop;

  backdrop = document.createElement("div");
  backdrop.className = BACKDROP_CLASS;
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", () => closeLoyaltyPicker(document));
  document.body.appendChild(backdrop);
  return backdrop;
}

function polishLoyaltyPicker(root = document) {
  const checkout = root.querySelector(".customer-checkout");
  const card = checkout?.querySelector(".loyalty-checkout-card");

  if (!card) {
    closeLoyaltyPicker(root);
    return;
  }

  const loyaltySummary = card.querySelector(".loyalty-summary");
  const list = card.querySelector(".loyalty-reward-list");
  const options = list ? Array.from(list.querySelectorAll(".voucher-option")) : [];

  if (!loyaltySummary || !list || !options.length) {
    loyaltySummary?.querySelector(".warkost-loyalty-picker-trigger")?.remove();
    card.querySelector(".warkost-loyalty-selected-summary")?.remove();
    list?.classList.remove("warkost-loyalty-picker-list");
    closeLoyaltyPicker(root);
    return;
  }

  list.classList.add("warkost-loyalty-picker-list");

  let trigger = loyaltySummary.querySelector(".warkost-loyalty-picker-trigger");
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "warkost-loyalty-picker-trigger";
    trigger.textContent = "Redeem Poin";
    trigger.setAttribute("aria-label", "Pilih reward loyalty untuk redeem poin");
    loyaltySummary.appendChild(trigger);
  }

  let selectedSummary = card.querySelector(".warkost-loyalty-selected-summary");
  if (!selectedSummary) {
    selectedSummary = document.createElement("div");
    selectedSummary.className = "warkost-loyalty-selected-summary";
    selectedSummary.innerHTML = `
      <span class="warkost-loyalty-selected-copy">
        <strong>Reward dipilih</strong>
        <small>Reward ini akan diterapkan pada pesananmu.</small>
      </span>
    `;
    loyaltySummary.insertAdjacentElement("afterend", selectedSummary);
  }

  const selectedOption = list.querySelector(".voucher-option.selected");
  const selectedTitle = selectedOption?.querySelector("strong")?.textContent?.trim();
  const selectedCopy = selectedSummary.querySelector(".warkost-loyalty-selected-copy");
  const selectedCopyTitle = selectedCopy?.querySelector("strong");

  selectedSummary.classList.toggle("is-visible", Boolean(selectedOption));
  trigger.classList.toggle("has-selection", Boolean(selectedOption));
  trigger.textContent = selectedOption ? "Ganti Reward" : "Redeem Poin";

  if (selectedCopyTitle)
    selectedCopyTitle.textContent = selectedTitle || "Reward dipilih";

  const backdrop = ensureBackdrop();

  if (card.dataset.warkostLoyaltyPickerReady !== "1") {
    card.dataset.warkostLoyaltyPickerReady = "1";
    card.addEventListener("click", (event) => {
      const pickerTrigger = event.target.closest(".warkost-loyalty-picker-trigger");
      if (pickerTrigger) {
        card.classList.add("is-loyalty-picker-open");
        backdrop.classList.add("is-open");
        document.body.classList.add(BODY_LOCK_CLASS);
        return;
      }

      const rewardButton = event.target.closest(
        ".loyalty-reward-list .voucher-option > button",
      );
      if (!rewardButton || rewardButton.disabled) return;
      window.setTimeout(() => closeLoyaltyPicker(document), 0);
    });
  }
}

export default function CustomerLoyaltyPickerRuntime() {
  useEffect(() => {
    let scheduled = false;
    installStyles();

    const apply = () => polishLoyaltyPicker(document);
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeLoyaltyPicker(document);
    };

    apply();
    document.addEventListener("keydown", onKeyDown);

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      closeLoyaltyPicker(document);
      document.querySelector(`.${BACKDROP_CLASS}`)?.remove();
    };
  }, []);

  return null;
}
