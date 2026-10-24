"use client";

import { useEffect } from "react";

const AUTOPLAY_MS = 5500;
const SWIPE_THRESHOLD_PX = 45;

function bannerDots() {
  return Array.from(
    document.querySelectorAll(".home-banner .banner-dots button"),
  );
}

export default function CustomerBannerCarouselRuntime() {
  useEffect(() => {
    let lastInteractionAt = Date.now();
    let drag = null;
    let suppressClickUntil = 0;

    const moveBanner = (direction, manual = false) => {
      const dots = bannerDots();
      if (dots.length < 2) return false;
      let index = dots.findIndex((dot) => dot.classList.contains("active"));
      if (index < 0) index = 0;
      if (manual) lastInteractionAt = Date.now();
      dots[(index + direction + dots.length) % dots.length]?.click();
      return true;
    };

    const resetDragVisual = (card) => {
      if (!card) return;
      card.classList.remove("is-banner-dragging");
      card.style.removeProperty("--banner-drag-x");
      card.style.removeProperty("--banner-drag-opacity");
    };

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const card = event.target.closest?.(".home-banner .banner-card");
      if (!card || bannerDots().length < 2) return;
      drag = {
        card,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      lastInteractionAt = Date.now();
      card.classList.add("is-banner-dragging");
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
      drag.card.style.setProperty("--banner-drag-x", `${dx * 0.32}px`);
      drag.card.style.setProperty(
        "--banner-drag-opacity",
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
        moveBanner(dx < 0 ? 1 : -1, true);
      }
    };

    const onPointerUp = (event) => finishDrag(event, false);
    const onPointerCancel = (event) => finishDrag(event, true);
    const onClick = (event) => {
      const card = event.target.closest?.(".home-banner .banner-card");
      if (!card || Date.now() < suppressClickUntil) return;
      if (!window.matchMedia?.("(pointer: fine)").matches) return;
      moveBanner(1, true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("click", onClick);

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastInteractionAt < AUTOPLAY_MS) return;
      if (moveBanner(1, false)) lastInteractionAt = Date.now();
    }, 1000);

    return () => {
      window.clearInterval(timer);
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
