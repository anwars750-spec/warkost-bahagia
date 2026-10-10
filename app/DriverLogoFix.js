"use client";

import { useEffect } from "react";

const DRIVER_LOGO = "/warkost-bahagia-logo-transparent.png";

export default function DriverLogoFix() {
  useEffect(() => {
    const repair = () => {
      document.querySelectorAll(".driver-v2-brand img").forEach((img) => {
        if (img.getAttribute("src") !== DRIVER_LOGO) {
          img.setAttribute("src", DRIVER_LOGO);
        }
        img.style.display = "block";
        img.classList.add("driver-v2-logo-ready");
      });
    };

    repair();
    const observer = new MutationObserver(repair);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
