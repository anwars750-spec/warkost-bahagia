"use client";

import { useEffect } from "react";

const AUTOPLAY_MS = 5500;
const SWIPE_THRESHOLD_PX = 45;
const INTERACTIVE_SELECTOR = "button,a,input,select,textarea,label";

function promoDots() {
  return Array.from(
    document.querySelectorAll(".home-promo .promo-dots button"),
  );
}

function hideLegacyArrows() {
  document
    .querySelectorAll(
      '.home-promo .promo-controls > button[aria-label="Promo sebelumnya"], .home-promo .promo-controls > button[aria-label="Promo berikutnya"]',
    )
    .forEach((button) => {
      button.hidden = true;
      button.tabIndex = -1;
      button.setAttribute("aria-hidden", "true");
    });

  document.querySelectorAll(".home-promo .promo-card").forEach((card) => {
    card.dataset.promoSlideshow = "true";
  });
}

export default function CustomerPromoSlideshowRuntime() {
  useEffect(() => {
    let lastInteractionAt = Date.now();
    let suppressClickUntil = 0;
    let drag = null;
    let decorateFrame = null;

    const scheduleDecorate = () => {
      if (decorateFrame !== null) return;
      decorateFrame = window.requestAnimationFrame(() => {
        decorateFrame = null;
        hideLegacyArrows();
      });
    };

    const movePromo = (direction, manual = false) => {
      const dots = promoDots();
      if (dots.length < 2) return false;
      let index = dots.findIndex((dot) => dot.classList.contains("active"));
      if (index < 0) index = 0;
      const next = (index + direction + dots.length) % dots.length;
      if (manual) lastInteractionAt = Date.now();
      dots[next]?.click();
      scheduleDecorate();
      return true;
    };

    const resetDragVisual = (card) => {
      if (!card) return;
      card.classList.remove("is-promo-dragging");
      card.style.removeProperty("--promo-drag-x");
      card.style.removeProperty("--promo-drag-opacity");
    };

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const card = event.target.closest?.(".home-promo .promo-card");
      if (!card || event.target.closest?.(INTERACTIVE_SELECTOR)) return;
      drag = {
        card,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      lastInteractionAt = Date.now();
      card.classList.add("is-promo-dragging");
      try {
        card.setPointerCapture?.(event.pointerId);
      } catch {}
    };

    const onPointerMove = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) < 5 || Math.abs(dx) <= Math.abs(dy)) return;
      if (event.cancelable) event.preventDefault();
      drag.card.style.setProperty("--promo-drag-x", `${dx * 0.32}px`);
      drag.card.style.setProperty(
        "--promo-drag-opacity",
        String(Math.max(0.84, 1 - Math.abs(dx) / 900)),
      );
    };

    const finishDrag = (event, cancelled = false) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const current = drag;
      drag = null;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      resetDragVisual(current.card);
      lastInteractionAt = Date.now();
      if (
        !cancelled &&
        Math.abs(dx) >= SWIPE_THRESHOLD_PX &&
        Math.abs(dx) > Math.abs(dy) * 1.15
      ) {
        suppressClickUntil = Date.now() + 450;
        movePromo(dx < 0 ? 1 : -1, true);
      }
    };

    const onPointerUp = (event) => finishDrag(event, false);
    const onPointerCancel = (event) => finishDrag(event, true);

    const onClick = (event) => {
      const card = event.target.closest?.(".home-promo .promo-card");
      if (!card || event.target.closest?.(INTERACTIVE_SELECTOR)) return;
      if (Date.now() < suppressClickUntil) return;
      if (!window.matchMedia?.("(pointer: fine)").matches) return;
      movePromo(1, true);
    };

    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("click", onClick);

    scheduleDecorate();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastInteractionAt < AUTOPLAY_MS) return;
      if (movePromo(1, false)) lastInteractionAt = Date.now();
    }, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (decorateFrame !== null) window.cancelAnimationFrame(decorateFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("click", onClick);
      resetDragVisual(drag?.card);
    };
  }, []);

  return null;
}
