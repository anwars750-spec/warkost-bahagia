"use client";

import { useEffect } from "react";

const STYLE_ID = "warkost-customer-location-visual-lock-v2";

const CSS = `
/* CUSTOMER LOCATION VISUAL LOCK V2 — runtime final layer */
.wloc-shell {
  --wloc-brand: #682c20 !important;
  --wloc-brand-hover: #843e2b !important;
  --wloc-accent: #a25931 !important;
  --wloc-text: #352721 !important;
  --wloc-muted: #81736b !important;
  --wloc-border: #e2d9cf !important;
  --wloc-surface: #f8f5ef !important;
  --wloc-soft: #fffaf4 !important;
  --wloc-warm: #f3dfcf !important;
  background: rgba(45, 29, 23, .46) !important;
}

.wloc-sheet {
  background: var(--wloc-surface) !important;
  color: var(--wloc-text) !important;
  box-shadow: 0 -20px 60px rgba(74, 37, 25, .18) !important;
}

.wloc-header {
  min-height: 70px !important;
  gap: 12px !important;
  padding: 13px 16px !important;
  background: rgba(255, 252, 248, .985) !important;
  border-bottom: 1px solid var(--wloc-border) !important;
}

.wloc-header strong { color: var(--wloc-text) !important; font-weight: 760 !important; }
.wloc-header small { color: var(--wloc-muted) !important; }

/* Exact back icon geometry — no font glyph dependency. */
.wloc-back {
  position: relative !important;
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  padding: 0 !important;
  display: block !important;
  border: 1px solid var(--wloc-border) !important;
  border-radius: 13px !important;
  background: #fffdfb !important;
  color: var(--wloc-brand) !important;
  font-size: 0 !important;
  line-height: 0 !important;
  box-shadow: 0 3px 10px rgba(74, 37, 25, .05) !important;
}
.wloc-back::before {
  content: "" !important;
  position: absolute !important;
  left: 13px !important;
  top: 50% !important;
  width: 9px !important;
  height: 9px !important;
  border-left: 2px solid currentColor !important;
  border-bottom: 2px solid currentColor !important;
  transform: translateY(-50%) rotate(45deg) !important;
  box-sizing: border-box !important;
}
.wloc-back::after {
  content: "" !important;
  position: absolute !important;
  left: 14px !important;
  top: 50% !important;
  width: 14px !important;
  height: 2px !important;
  border-radius: 99px !important;
  background: currentColor !important;
  transform: translateY(-50%) !important;
}

.wloc-body { background: var(--wloc-surface) !important; }

.wloc-search-box {
  grid-template-columns: 24px minmax(0, 1fr) 32px !important;
  min-height: 54px !important;
  border: 1px solid var(--wloc-border) !important;
  background: #fffdfb !important;
  box-shadow: 0 10px 28px rgba(74, 37, 25, .075) !important;
}
.wloc-search-box:focus-within {
  border-color: #b98063 !important;
  box-shadow: 0 0 0 3px rgba(162, 89, 49, .11) !important;
}
.wloc-search-box input { color: var(--wloc-text) !important; }
.wloc-search-box input::placeholder { color: #9b8d83 !important; }

/* Exact search icon geometry. */
.wloc-search-box > span:first-child {
  position: relative !important;
  width: 24px !important;
  height: 24px !important;
  display: block !important;
  color: var(--wloc-brand) !important;
  font-size: 0 !important;
  transform: none !important;
}
.wloc-search-box > span:first-child::before {
  content: "" !important;
  position: absolute !important;
  left: 3px !important;
  top: 3px !important;
  width: 11px !important;
  height: 11px !important;
  border: 2px solid currentColor !important;
  border-radius: 50% !important;
  box-sizing: content-box !important;
}
.wloc-search-box > span:first-child::after {
  content: "" !important;
  position: absolute !important;
  left: 14px !important;
  top: 15px !important;
  width: 7px !important;
  height: 2px !important;
  border-radius: 99px !important;
  background: currentColor !important;
  transform: rotate(45deg) !important;
  transform-origin: left center !important;
}

/* Exact clear X geometry. */
.wloc-search-box button[aria-label="Hapus pencarian"] {
  position: relative !important;
  width: 30px !important;
  height: 30px !important;
  min-width: 30px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 50% !important;
  background: #f3e7de !important;
  color: #6f5042 !important;
  font-size: 0 !important;
  line-height: 0 !important;
}
.wloc-search-box button[aria-label="Hapus pencarian"]::before,
.wloc-search-box button[aria-label="Hapus pencarian"]::after {
  content: "" !important;
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  width: 12px !important;
  height: 2px !important;
  border-radius: 99px !important;
  background: currentColor !important;
  transform-origin: center !important;
}
.wloc-search-box button[aria-label="Hapus pencarian"]::before { transform: translate(-50%, -50%) rotate(45deg) !important; }
.wloc-search-box button[aria-label="Hapus pencarian"]::after { transform: translate(-50%, -50%) rotate(-45deg) !important; }

.wloc-current,
.wloc-results,
.wloc-result,
.wloc-map-card,
.wloc-place-card,
.wloc-form-card,
.wloc-manual {
  border-color: var(--wloc-border) !important;
}
.wloc-current,
.wloc-result,
.wloc-map-card,
.wloc-place-card,
.wloc-form-card { background: #fffdfb !important; color: var(--wloc-text) !important; }
.wloc-current-icon,
.wloc-pin,
.wloc-saved-icon { background: var(--wloc-warm) !important; color: var(--wloc-brand) !important; }
.wloc-current small,
.wloc-result small,
.wloc-place-title small,
.wloc-footnote { color: var(--wloc-muted) !important; }
.wloc-section-title { color: #7c665a !important; }
.wloc-section-title small { color: var(--wloc-accent) !important; }
.wloc-result:hover,
.wloc-result:active { background: #fff8f2 !important; }

.wloc-manual {
  background: #fffaf5 !important;
  color: var(--wloc-brand) !important;
  border-color: #cba891 !important;
}
.wloc-manual:hover { background: #f8eadc !important; border-color: var(--wloc-accent) !important; }

.wloc-map-placeholder {
  background:
    linear-gradient(90deg, rgba(125,79,57,.055) 1px, transparent 1px),
    linear-gradient(rgba(125,79,57,.055) 1px, transparent 1px),
    #f4ede6 !important;
  background-size: 28px 28px !important;
}
.wloc-map-road { background: #e2d6cc !important; border-color: #fffaf6 !important; }
.wloc-map-pin { background: var(--wloc-brand) !important; border-color: #fffaf6 !important; box-shadow: 0 8px 22px rgba(104,44,32,.26) !important; }

.wloc-quote-grid > div { background: #f7efe8 !important; }
.wloc-quote-grid span,
.wloc-field > span,
.wloc-label-block > span { color: #7c685d !important; }
.wloc-quote-grid strong { color: var(--wloc-text) !important; }
.wloc-quote-grid strong.is-free { color: var(--wloc-brand) !important; }
.wloc-free-badge { background: #f7e7dc !important; color: var(--wloc-brand) !important; border: 1px solid #dfc1ae !important; }

.wloc-field textarea,
.wloc-custom-label {
  border-color: var(--wloc-border) !important;
  background: #fffdfb !important;
  color: var(--wloc-text) !important;
}
.wloc-field textarea:focus,
.wloc-custom-label:focus {
  border-color: #b98063 !important;
  box-shadow: 0 0 0 3px rgba(162,89,49,.11) !important;
}

.wloc-chips button { border-color: var(--wloc-border) !important; background: #fffdfb !important; color: #665046 !important; }
.wloc-chips button.is-selected { border-color: #a86546 !important; background: #f3dfcf !important; color: var(--wloc-brand) !important; }

.wloc-confirm-actions { border-top-color: var(--wloc-border) !important; background: rgba(255,252,248,.985) !important; }
.wloc-primary { border: 1px solid var(--wloc-brand) !important; background: var(--wloc-brand) !important; color: #fff !important; box-shadow: 0 10px 24px rgba(104,44,32,.23) !important; }
.wloc-primary:hover { background: var(--wloc-brand-hover) !important; border-color: var(--wloc-brand-hover) !important; }
.wloc-secondary { border-color: #c9aa96 !important; background: #fffdfb !important; color: var(--wloc-brand) !important; }

/* Checkout launcher also follows parent Warkost palette. */
.wloc-location-launcher {
  border-color: #cba891 !important;
  background: #fffaf5 !important;
  color: #682c20 !important;
  font-weight: 760 !important;
}
.wloc-location-launcher:hover { border-color: #a25931 !important; background: #f8eadc !important; color: #682c20 !important; }
`;

export default function CustomerLocationVisualLock() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
    document.documentElement.dataset.wlocVisual = "v2";

    return () => {
      document.documentElement.removeAttribute("data-wloc-visual");
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
