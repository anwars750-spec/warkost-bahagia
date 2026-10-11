"use client";

import { useEffect } from "react";

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const fallbackImage = (name) => {
  const normalized = normalizeName(name);
  if (normalized.includes("nasi goreng"))
    return "/demo/nasi-goreng-warkost.webp";
  if (normalized.includes("mie ayam")) return "/demo/mie-ayam-bahagia.webp";
  if (normalized.includes("kopi susu")) return "/demo/kopi-susu-rumah.webp";
  return "";
};

function isKitchenStockView() {
  return document.body.classList.contains("kitchen-stock-modern-active");
}

export default function KitchenStockImageSync() {
  useEffect(() => {
    let productsByName = new Map();
    let controller = null;
    let observer = null;
    let frame = 0;
    let disposed = false;

    const applyImages = () => {
      if (disposed || !isKitchenStockView()) return;

      document.querySelectorAll(".kitchen-stock-row").forEach((row) => {
        const name = row
          .querySelector(".kitchen-stock-product strong")
          ?.textContent?.trim();
        const imageHost = row.querySelector(".kitchen-stock-product-icon");
        if (!name || !imageHost) return;

        const product = productsByName.get(normalizeName(name));
        const imageUrl = product?.image_url || fallbackImage(name);

        if (!imageUrl) {
          imageHost.removeAttribute("data-synced-image");
          imageHost.style.removeProperty("background-image");
          return;
        }

        imageHost.dataset.syncedImage = "true";
        imageHost.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
        imageHost.setAttribute("aria-label", `Gambar ${name}`);
      });
    };

    const scheduleApply = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyImages);
    };

    const loadMenuImages = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/menu", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const products = Array.isArray(data.products) ? data.products : [];
        productsByName = new Map(
          products.map((product) => [normalizeName(product.name), product]),
        );
        scheduleApply();
      } catch (error) {
        if (error?.name !== "AbortError") scheduleApply();
      }
    };

    const main = document.querySelector("main");
    if (main) {
      observer = new MutationObserver(scheduleApply);
      observer.observe(main, { childList: true, subtree: true });
    }

    const onFocus = () => {
      if (isKitchenStockView()) void loadMenuImages();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && isKitchenStockView())
        void loadMenuImages();
    };
    const onClick = (event) => {
      if (
        event.target.closest?.(".kitchen-stock-refresh") ||
        event.target.closest?.("header.top nav button")
      ) {
        window.setTimeout(() => {
          if (isKitchenStockView()) void loadMenuImages();
        }, 80);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onClick, true);

    void loadMenuImages();

    return () => {
      disposed = true;
      controller?.abort();
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
