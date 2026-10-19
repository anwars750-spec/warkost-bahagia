"use client";

import { useEffect } from "react";
import QRCode from "qrcode";

const STYLE_ID = "warkost-qris-runtime-style";
const RUNTIME_CLASS = "qris-runtime-view";

function orderIdFromPayload(payload) {
  const match = String(payload || "").match(
    /^WARKOST-LOCAL-QRIS\|WB-QRIS-(\d+)-/,
  );
  return match ? Number(match[1]) : null;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .qris-payment-panel > code[data-qris-runtime-hidden="true"] {
      display: none !important;
    }
    .${RUNTIME_CLASS} {
      margin-top: 14px;
      display: grid;
      justify-items: center;
      gap: 10px;
      padding: 16px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      border-radius: 18px;
      background: #fff;
    }
    .${RUNTIME_CLASS} canvas {
      display: block;
      width: min(220px, 76vw) !important;
      height: auto !important;
      max-width: 100%;
      border-radius: 12px;
    }
    .${RUNTIME_CLASS} .qris-runtime-title {
      margin: 0;
      font-weight: 800;
      font-size: 14px;
      text-align: center;
    }
    .${RUNTIME_CLASS} .qris-runtime-note {
      margin: 0;
      max-width: 290px;
      font-size: 12px;
      line-height: 1.45;
      text-align: center;
      color: #64748b;
    }
    .${RUNTIME_CLASS} .qris-runtime-demo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .04em;
      background: #fff7ed;
      color: #c2410c;
      border: 1px solid #fed7aa;
    }
    .${RUNTIME_CLASS} .qris-runtime-demo-button {
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 11px 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      background: #111827;
      color: #fff;
    }
    .${RUNTIME_CLASS} .qris-runtime-demo-button:disabled {
      opacity: .65;
      cursor: default;
    }
    .${RUNTIME_CLASS} .qris-runtime-error {
      margin: 0;
      color: #b91c1c;
      font-size: 12px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

async function demoModeEnabled() {
  try {
    const response = await fetch("/api/payment/demo-complete", {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.enabled === true;
  } catch {
    return false;
  }
}

export default function CustomerQrisRuntime() {
  useEffect(() => {
    let active = true;
    let observer;
    let demoEnabled = false;

    ensureStyles();

    const renderPanel = async (code) => {
      if (!active || code.dataset.qrisRuntimeProcessed === "true") return;
      const payload = String(code.textContent || "").trim();
      if (!payload) return;

      code.dataset.qrisRuntimeProcessed = "true";
      code.dataset.qrisRuntimeHidden = "true";

      const container = document.createElement("div");
      container.className = RUNTIME_CLASS;
      container.dataset.qrisPayload = payload;

      const title = document.createElement("p");
      title.className = "qris-runtime-title";
      title.textContent = "Scan QR untuk pembayaran";

      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-label", "QR pembayaran");

      const note = document.createElement("p");
      note.className = "qris-runtime-note";
      note.textContent = demoEnabled
        ? "QR ini khusus simulasi UAT dan tidak dapat dibayar melalui aplikasi bank atau e-wallet."
        : "Pindai QR menggunakan aplikasi pembayaran yang mendukung QRIS.";

      container.append(title, canvas, note);

      try {
        await QRCode.toCanvas(canvas, payload, {
          width: 240,
          margin: 2,
          errorCorrectionLevel: "M",
        });
      } catch (error) {
        code.dataset.qrisRuntimeHidden = "false";
        code.dataset.qrisRuntimeProcessed = "false";
        container.remove();
        console.error("QRIS render gagal", error);
        return;
      }

      if (demoEnabled) {
        const badge = document.createElement("span");
        badge.className = "qris-runtime-demo-badge";
        badge.textContent = "SIMULASI UAT";
        container.insertBefore(badge, title);

        const orderId = orderIdFromPayload(payload);
        if (Number.isSafeInteger(orderId) && orderId > 0) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "qris-runtime-demo-button";
          button.textContent = "Simulasikan pembayaran berhasil";
          button.addEventListener("click", async () => {
            if (button.disabled) return;
            button.disabled = true;
            button.textContent = "Memproses pembayaran…";
            container.querySelector(".qris-runtime-error")?.remove();
            try {
              const response = await fetch("/api/payment/demo-complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
                cache: "no-store",
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(result.error || "Pembayaran demo gagal");
              button.textContent = "Pembayaran berhasil ✓";
              window.dispatchEvent(
                new CustomEvent("warkost:qris-demo-paid", {
                  detail: { orderId, payment: result.payment || null },
                }),
              );
            } catch (error) {
              button.disabled = false;
              button.textContent = "Coba simulasi pembayaran lagi";
              const message = document.createElement("p");
              message.className = "qris-runtime-error";
              message.textContent = error.message || "Pembayaran demo gagal";
              container.appendChild(message);
            }
          });
          container.appendChild(button);
        }
      }

      code.insertAdjacentElement("afterend", container);
    };

    const scan = () => {
      document
        .querySelectorAll(
          '.qris-payment-panel > code:not([data-qris-runtime-processed="true"])',
        )
        .forEach((code) => void renderPanel(code));
    };

    demoModeEnabled().then((enabled) => {
      if (!active) return;
      demoEnabled = enabled;
      scan();
      observer = new MutationObserver(scan);
      observer.observe(document.body, { childList: true, subtree: true });
    });

    return () => {
      active = false;
      observer?.disconnect();
      document.querySelectorAll(`.${RUNTIME_CLASS}`).forEach((node) => node.remove());
      document
        .querySelectorAll('[data-qris-runtime-hidden="true"]')
        .forEach((code) => {
          delete code.dataset.qrisRuntimeHidden;
          delete code.dataset.qrisRuntimeProcessed;
        });
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
