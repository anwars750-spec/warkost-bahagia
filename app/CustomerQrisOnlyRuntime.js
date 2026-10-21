"use client";

import { useEffect } from "react";

function enforceQrisOnly(root = document) {
  const cash = root.querySelector('input[name="method"][value="CASH"]');
  const qris = root.querySelector('input[name="method"][value="QRIS"]');

  if (!cash && !qris) return;

  if (cash) {
    const option = cash.closest(".payment-method-option") || cash.closest("label");
    if (option) {
      option.hidden = true;
      option.setAttribute("aria-hidden", "true");
    }
    cash.disabled = true;
  }

  if (qris && !qris.checked) {
    qris.click();
  }
}

export default function CustomerQrisOnlyRuntime() {
  useEffect(() => {
    const run = () => enforceQrisOnly(document);
    run();

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
