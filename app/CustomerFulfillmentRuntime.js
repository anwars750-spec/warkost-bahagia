"use client";

import { useEffect } from "react";

const PICKUP_LABEL = "Ambil di Warkost";

function installStyles() {
  if (document.getElementById("warkost-customer-fulfillment-style")) return;
  const style = document.createElement("style");
  style.id = "warkost-customer-fulfillment-style";
  style.textContent = `
    .customer-fulfillment-card{padding:20px 20px 18px;margin-bottom:16px}
    .customer-fulfillment-card h2{margin:0 0 6px;font-size:20px}
    .customer-fulfillment-card p{margin:0 0 14px;color:#78675f;font-size:13px;line-height:1.45}
    .customer-fulfillment-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .customer-fulfillment-option{border:1px solid #e6d8cf;background:#fffaf6;border-radius:16px;padding:14px;text-align:left;cursor:pointer;transition:.16s ease;min-height:86px}
    .customer-fulfillment-option strong{display:block;font-size:15px;margin-bottom:4px;color:#2d211c}
    .customer-fulfillment-option span{display:block;font-size:12px;line-height:1.35;color:#7b6a61}
    .customer-fulfillment-option.is-active{border-color:#9e3a1d;box-shadow:0 0 0 1px #9e3a1d inset;background:#fff4ed}
    .customer-pickup-note{display:none;margin-top:12px;padding:12px 14px;border-radius:14px;background:#eef8ee;color:#245d2d;font-size:13px;line-height:1.45}
    .customer-fulfillment-card[data-mode="PICKUP"] .customer-pickup-note{display:block}
    @media(max-width:700px){
      .customer-fulfillment-card{padding:16px;margin-bottom:12px}
      .customer-fulfillment-options{grid-template-columns:1fr}
      .customer-fulfillment-option{min-height:auto}
    }
  `;
  document.head.appendChild(style);
}

function setNativeSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, String(value));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function CustomerFulfillmentRuntime() {
  useEffect(() => {
    installStyles();

    let mode = "DELIVERY";
    let pickupAddress = null;
    let previousDeliveryAddress = "";
    let pickupRequest = null;
    let applying = false;

    const getPickupAddress = async () => {
      if (pickupAddress) return pickupAddress;
      if (pickupRequest) return pickupRequest;
      pickupRequest = fetch("/api/pickup-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Gagal menyiapkan ambil di tempat");
          pickupAddress = data;
          return data;
        })
        .finally(() => {
          pickupRequest = null;
        });
      return pickupRequest;
    };

    const updateButtons = (card) => {
      for (const button of card.querySelectorAll("[data-fulfillment-mode]")) {
        const active = button.dataset.fulfillmentMode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
      card.dataset.mode = mode;
    };

    const applyMode = async () => {
      if (applying) return;
      const deliveryCard = document.querySelector(".delivery-checkout-card");
      const card = document.querySelector(".customer-fulfillment-card");
      const select = document.querySelector('select[name="address"]');
      if (!deliveryCard || !card || !select) return;

      applying = true;
      try {
        updateButtons(card);
        if (mode === "DELIVERY") {
          deliveryCard.style.removeProperty("display");
          if (
            previousDeliveryAddress &&
            select.value !== previousDeliveryAddress &&
            [...select.options].some((option) => option.value === previousDeliveryAddress)
          ) {
            setNativeSelectValue(select, previousDeliveryAddress);
          }
          return;
        }

        if (select.value && select.selectedOptions[0]?.textContent !== PICKUP_LABEL)
          previousDeliveryAddress = select.value;

        const pickup = await getPickupAddress();
        let option = [...select.options].find(
          (item) => item.value === String(pickup.id),
        );
        if (!option) {
          option = document.createElement("option");
          option.value = String(pickup.id);
          option.textContent = PICKUP_LABEL;
          select.appendChild(option);
        }
        if (select.value !== String(pickup.id))
          setNativeSelectValue(select, pickup.id);
        deliveryCard.style.setProperty("display", "none", "important");
      } catch (error) {
        console.error("Pickup selector error", error);
        mode = "DELIVERY";
        updateButtons(card);
        deliveryCard.style.removeProperty("display");
      } finally {
        applying = false;
      }
    };

    const ensureUi = () => {
      const deliveryCard = document.querySelector(".delivery-checkout-card");
      if (!deliveryCard) return;

      let card = document.querySelector(".customer-fulfillment-card");
      if (!card) {
        card = document.createElement("section");
        card.className = "checkout-card customer-fulfillment-card";
        card.dataset.mode = mode;
        card.innerHTML = `
          <h2>Cara menerima pesanan</h2>
          <p>Pilih ambil sendiri di Warkost atau kirim ke alamat kamu.</p>
          <div class="customer-fulfillment-options" role="group" aria-label="Cara menerima pesanan">
            <button type="button" class="customer-fulfillment-option" data-fulfillment-mode="PICKUP">
              <strong>🏪 Ambil di tempat</strong>
              <span>Ambil langsung di Warkost. Tanpa ongkir dan tanpa alamat pengantaran.</span>
            </button>
            <button type="button" class="customer-fulfillment-option is-active" data-fulfillment-mode="DELIVERY" aria-pressed="true">
              <strong>🛵 Dikirim ke lokasi</strong>
              <span>Pilih alamat, hitung jarak, dan ongkir otomatis seperti biasa.</span>
            </button>
          </div>
          <div class="customer-pickup-note">Pesanan akan disiapkan untuk diambil langsung di Warkost. Ongkir Rp0.</div>
        `;
        const cartCard = document.querySelector(".cart-checkout-card");
        const anchor = cartCard || deliveryCard;
        anchor.parentNode?.insertBefore(card, anchor);
        card.addEventListener("click", (event) => {
          const button = event.target.closest("[data-fulfillment-mode]");
          if (!button) return;
          mode = button.dataset.fulfillmentMode;
          void applyMode();
        });
      }
      void applyMode();
    };

    ensureUi();
    const observer = new MutationObserver(ensureUi);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
