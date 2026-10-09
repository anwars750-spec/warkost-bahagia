"use client";

import { useEffect } from "react";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactWeight(value) {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return "";
  if (quantity >= 1000 && quantity % 1000 === 0) {
    return `${quantity / 1000} kg`;
  }
  if (quantity >= 1000) {
    return `${String(quantity / 1000).replace(".", ",")} kg`;
  }
  return `${quantity}g`;
}

function normalizeVisibleQuantity(text, stockUnit) {
  const current = cleanText(text);
  if (stockUnit === "GRAM") {
    const kg = current.match(/^([\d.,]+)\s*kg$/i);
    if (kg) return `${kg[1]} kg`;
    const gram = current.match(/^([\d.,]+)\s*g$/i);
    if (gram) return `${gram[1]}g`;
    return current.replace(/\s+/g, "");
  }
  return current.replace(/\s*pcs\b/gi, "").trim();
}

function compactRawMaterialMeta(card) {
  for (const node of card.querySelectorAll(".product-price-stack > small")) {
    const text = cleanText(node.textContent);
    const minimal = text.match(/^Minimal\s+([\d.,]+)\s*g$/i);
    if (minimal) node.textContent = `Minimal ${minimal[1]}g`;
  }
}

function applyQuantityPolish(menuData) {
  const catalog = document.querySelector(".customer-catalog");
  if (!catalog) return;

  const products = new Map(
    (menuData?.products || []).map((product) => [
      cleanText(product.name).toLowerCase(),
      product,
    ]),
  );

  for (const card of catalog.querySelectorAll("article.customer-product")) {
    const name = cleanText(card.querySelector(".product-body h2")?.textContent).toLowerCase();
    const product = products.get(name);
    const quantity = card.querySelector(".qty");
    if (!quantity) continue;

    const valueNode = quantity.querySelector(":scope > span");
    const actionNode = quantity.querySelector(":scope > small");
    const stockUnit = product?.stock_unit || (valueNode?.textContent?.toLowerCase().includes("g") ? "GRAM" : "PCS");
    const weighted = stockUnit === "GRAM";

    card.classList.toggle("weighted-product", weighted);
    quantity.classList.toggle("weighted-qty", weighted);
    quantity.classList.toggle("piece-qty", !weighted);

    if (valueNode) {
      const next = normalizeVisibleQuantity(valueNode.textContent, stockUnit);
      if (next && valueNode.textContent !== next) valueNode.textContent = next;
      valueNode.setAttribute("aria-label", `Jumlah ${next}`);
    }

    if (weighted) compactRawMaterialMeta(card);

    if (actionNode) {
      const empty = quantity.classList.contains("is-empty");
      const label = weighted
        ? empty
          ? "Pesan"
          : `+${compactWeight(Number(product?.order_step_quantity || 100))}`
        : empty
          ? "Pesan"
          : "+1";
      actionNode.textContent = label;
      actionNode.dataset.actionLabel = label;
      actionNode.setAttribute(
        "aria-label",
        weighted && !empty
          ? `Tambah ${compactWeight(Number(product?.order_step_quantity || 100))}`
          : empty
            ? `Pesan ${product?.name || "produk"}`
            : "Tambah 1",
      );
    }
  }
}

export default function CustomerQuantityUnitPolish() {
  useEffect(() => {
    let menuData = null;
    let observer;
    let frame = 0;

    const observe = () => {
      observer?.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };

    const run = () => {
      frame = 0;
      observer?.disconnect();
      try {
        applyQuantityPolish(menuData);
      } finally {
        observe();
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(run);
    };

    observer = new MutationObserver(schedule);
    observe();
    schedule();

    fetch("/api/menu", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        menuData = data;
        schedule();
      })
      .catch(() => {});

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return null;
}
