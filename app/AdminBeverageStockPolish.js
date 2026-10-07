"use client";

import { useEffect } from "react";

const fallbackProductImage = (name) => {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("nasi goreng")) return "/demo/nasi-goreng-warkost.webp";
  if (normalized.includes("mie ayam")) return "/demo/mie-ayam-bahagia.webp";
  if (normalized.includes("kopi susu")) return "/demo/kopi-susu-rumah.webp";
  return "/demo/promo-warkost.webp";
};

const safeImageUrl = (product) =>
  String(product?.image_url || product?.imageUrl || "").trim() ||
  fallbackProductImage(product?.name);

export default function AdminBeverageStockPolish() {
  useEffect(() => {
    let stopped = false;
    let productsByName = new Map();
    let rootObserver = null;
    let bodyObserver = null;
    let decorating = false;

    const escapeSelectorValue = (value) => String(value || "").trim();

    const loadProducts = async () => {
      try {
        const response = await fetch("/api/menu", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || stopped) return;
        productsByName = new Map(
          (Array.isArray(payload.products) ? payload.products : []).map((product) => [
            escapeSelectorValue(product.name).toLowerCase(),
            product,
          ]),
        );
        decorate();
      } catch {
        // The stock shell already owns its load/error state. Image polish is non-blocking.
      }
    };

    const decorateCard = (card) => {
      const title = card.querySelector(".admin-beverage-stock-card-head h3");
      if (!title) return;
      const product = productsByName.get(title.textContent.trim().toLowerCase());
      if (!product) return;

      const head = card.querySelector(".admin-beverage-stock-card-head");
      if (!head) return;

      let media = head.querySelector(".admin-beverage-stock-product-media");
      if (!media) {
        media = document.createElement("div");
        media.className = "admin-beverage-stock-product-media";
        head.prepend(media);
      }

      const imageUrl = safeImageUrl(product);
      if (media.dataset.imageUrl === imageUrl) return;
      media.dataset.imageUrl = imageUrl;
      media.innerHTML = "";

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = product.name || "Foto minuman";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        const fallback = fallbackProductImage(product.name);
        if (image.src.endsWith(fallback)) return;
        image.src = fallback;
      });
      media.appendChild(image);

      card.dataset.productId = String(product.id || "");
      card.dataset.syncedImage = "true";
    };

    const decorateHero = (root) => {
      const hero = root.querySelector(".admin-beverage-stock-hero");
      if (!hero) return;
      hero.classList.add("admin-beverage-stock-hero-polished");
      const badge = hero.querySelector(".admin-beverage-readonly");
      if (badge) {
        badge.innerHTML = '<span class="admin-beverage-readonly-dot" aria-hidden="true"></span><span>Read only</span>';
        badge.setAttribute("title", "Admin hanya dapat melihat stok minuman");
      }
    };

    function decorate() {
      if (stopped || decorating) return;
      const root = document.getElementById("admin-beverage-stock-v1");
      if (!root) return;
      decorating = true;
      try {
        decorateHero(root);
        root.querySelectorAll(".admin-beverage-stock-card").forEach(decorateCard);
      } finally {
        decorating = false;
      }
    }

    const observeRoot = () => {
      const root = document.getElementById("admin-beverage-stock-v1");
      if (!root) return false;
      rootObserver?.disconnect();
      rootObserver = new MutationObserver(() => requestAnimationFrame(decorate));
      rootObserver.observe(root, { childList: true, subtree: true });
      decorate();
      return true;
    };

    loadProducts();
    if (!observeRoot()) {
      bodyObserver = new MutationObserver(() => {
        if (observeRoot()) {
          bodyObserver?.disconnect();
          bodyObserver = null;
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      stopped = true;
      rootObserver?.disconnect();
      bodyObserver?.disconnect();
    };
  }, []);

  return null;
}
