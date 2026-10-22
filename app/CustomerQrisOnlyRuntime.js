"use client";

import { useEffect } from "react";

function enforceQrisOnly(root = document) {
  const cashInputs = root.querySelectorAll(
    'input[name="method"][value="CASH"]',
  );
  const qris = root.querySelector('input[name="method"][value="QRIS"]');

  if (!cashInputs.length && !qris) return;

  cashInputs.forEach((cash) => {
    const option =
      cash.closest(".payment-method-option") || cash.closest("label");

    if (option) {
      option.hidden = true;
      option.setAttribute("aria-hidden", "true");
      option.style.setProperty("display", "none", "important");
    }

    cash.disabled = true;
    cash.tabIndex = -1;
  });

  if (qris) {
    const qrisOption =
      qris.closest(".payment-method-option") || qris.closest("label");

    if (qrisOption) {
      qrisOption.style.setProperty("display", "", "");
      qrisOption.removeAttribute("aria-hidden");
    }

    if (!qris.checked) qris.click();
  }
}

export default function CustomerQrisOnlyRuntime() {
  useEffect(() => {
    let scheduled = false;

    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        enforceQrisOnly(document);
      });
    };

    enforceQrisOnly(document);

    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["checked", "class"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
