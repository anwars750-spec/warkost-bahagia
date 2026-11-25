"use client";

import { useEffect } from "react";

export default function OwnerStockMobileViewportFix() {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    let raf = 0;
    let wasActive = false;

    const clear = () => {
      document.documentElement.classList.remove("owner-stock-mobile-open");
      document.body.classList.remove("owner-stock-mobile-open");
      if (wasActive) {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
        window.scrollTo(0, window.scrollY);
      }
      wasActive = false;
    };

    const sync = () => {
      const active = Boolean(document.querySelector(".oso-modal")) && media.matches;
      if (!active) {
        clear();
        return;
      }

      wasActive = true;
      document.documentElement.classList.add("owner-stock-mobile-open");
      document.body.classList.add("owner-stock-mobile-open");
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo(0, window.scrollY);

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", sync);
    media.addEventListener?.("change", sync);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      media.removeEventListener?.("change", sync);
      clear();
    };
  }, []);

  return null;
}
