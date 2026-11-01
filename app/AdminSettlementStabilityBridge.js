"use client";

import { useEffect } from "react";

export default function AdminSettlementStabilityBridge() {
  useEffect(() => {
    let lastShiftActive = false;
    let submitWatchdog = null;

    const dispatchShiftStartedIfNeeded = () => {
      const active = Boolean(document.querySelector(".admin-cash-live"));
      if (active && !lastShiftActive) {
        lastShiftActive = true;
        window.dispatchEvent(new CustomEvent("warkost:admin-shift-started"));
      } else if (!active) {
        lastShiftActive = false;
      }
    };

    const finishSubmitting = () => {
      document.body.classList.remove("admin-shift-settlement-submitting");
      window.dispatchEvent(
        new CustomEvent("warkost:admin-shift-submitting", {
          detail: { active: false },
        }),
      );
      if (submitWatchdog) {
        window.clearTimeout(submitWatchdog);
        submitWatchdog = null;
      }
    };

    const startSubmitting = () => {
      document.body.classList.add("admin-shift-settlement-submitting");
      window.dispatchEvent(
        new CustomEvent("warkost:admin-shift-submitting", {
          detail: { active: true },
        }),
      );
      if (submitWatchdog) window.clearTimeout(submitWatchdog);
      // Never leave the UI globally marked as submitting forever if a browser
      // request is aborted or a modal is destroyed unexpectedly.
      submitWatchdog = window.setTimeout(finishSubmitting, 22000);
    };

    const onClick = (event) => {
      const button = event.target.closest(".admin-shift-settlement-primary");
      if (!button || button.disabled) return;
      startSubmitting();
    };

    const reconcile = () => {
      dispatchShiftStartedIfNeeded();

      const panel = document.querySelector(".admin-shift-settlement-panel");
      const primary = panel?.querySelector(".admin-shift-settlement-primary");
      const busy = Boolean(
        primary?.disabled &&
          /menyimpan|membuat|memproses|setoran/i.test(primary?.textContent || ""),
      );

      if (!panel || !busy) {
        if (document.body.classList.contains("admin-shift-settlement-submitting")) {
          finishSubmitting();
        }
      }
    };

    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "class"],
    });
    reconcile();

    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      if (submitWatchdog) window.clearTimeout(submitWatchdog);
      document.body.classList.remove("admin-shift-settlement-submitting");
    };
  }, []);

  return null;
}
