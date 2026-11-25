"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PUSH_ROLES = ["CUSTOMER", "ADMIN", "KITCHEN", "DRIVER"];

async function api(body) {
  const response = await fetch("/api/push", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Notifikasi belum dapat diperbarui");
  return data;
}

function applicationKey(value) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0),
  );
}

function promptDismissedKey(userId) {
  return `warkost:push-prompt-dismissed:${userId}`;
}

export default function PushNotificationSettings({ user, onOpen }) {
  const [config, setConfig] = useState(null),
    [active, setActive] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [promptVisible, setPromptVisible] = useState(false),
    [accountHost, setAccountHost] = useState(null);
  const locked = useRef(false),
    identity = useRef(user?.id);
  identity.current = user?.id;

  const supported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const roleSupported = Boolean(user && PUSH_ROLES.includes(user.role));

  async function activate(data = config, { userGesture = false } = {}) {
    if (!data?.enabled || locked.current || !user) return false;
    const id = user.id;
    locked.current = true;
    if (userGesture) setBusy(true);
    setMessage("");
    try {
      // The browser permission request must stay directly behind a user gesture.
      const permission =
        userGesture && Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        if (identity.current === id) {
          setPromptVisible(false);
          setMessage(
            "Izin notifikasi diblokir. Ubah izin situs di pengaturan browser untuk mengaktifkan kembali.",
          );
        }
        return false;
      }
      if (identity.current !== id) return false;
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      let createdSubscription = false;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(data.publicKey),
        });
        createdSubscription = true;
      }
      if (identity.current !== id) {
        if (createdSubscription) await subscription.unsubscribe();
        return false;
      }
      try {
        await api({ action: "subscribe", subscription: subscription.toJSON() });
      } catch (error) {
        // Never leave a browser-only subscription claiming to be active.
        await subscription.unsubscribe();
        throw error;
      }
      if (identity.current === id) {
        setActive(true);
        setPromptVisible(false);
        setMessage("Notifikasi aktif.");
      }
      return true;
    } catch (error) {
      if (identity.current === id)
        setMessage(
          error.message || "Notifikasi belum dapat diaktifkan. Coba kembali.",
        );
      return false;
    } finally {
      locked.current = false;
      if (userGesture) setBusy(false);
    }
  }

  async function disable() {
    if (locked.current || !user) return;
    const id = user.id;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      // Revoke server first; failure remains visible and can be retried.
      if (subscription) {
        await api({ action: "unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      if (identity.current === id) {
        setActive(false);
        setMessage("Notifikasi dinonaktifkan.");
      }
    } catch (error) {
      if (identity.current === id)
        setMessage(
          error.message || "Notifikasi belum dapat dinonaktifkan. Coba kembali.",
        );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function toggle() {
    if (active) return disable();
    return activate(config, { userGesture: true });
  }

  function dismissPrompt() {
    if (user?.id) {
      try {
        sessionStorage.setItem(promptDismissedKey(user.id), "1");
      } catch {}
    }
    setPromptVisible(false);
  }

  useEffect(() => {
    if (!roleSupported || !supported) {
      setConfig(null);
      setActive(false);
      setPromptVisible(false);
      return;
    }
    let cancelled = false;
    setActive(false);
    setMessage("");
    setPromptVisible(false);
    api()
      .then(async (data) => {
        if (cancelled) return;
        setConfig(data);
        if (!data.enabled) return;

        const permission = Notification.permission;
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const state = await api({
            action: "status",
            endpoint: subscription.endpoint,
          });
          if (cancelled) return;
          if (state.active && permission === "granted") {
            setActive(true);
            return;
          }
        }

        // Permission was already granted previously: silently repair/register the
        // subscription on login. This never opens a browser permission dialog.
        if (permission === "granted") {
          await activate(data, { userGesture: false });
          return;
        }

        if (permission === "denied") {
          setMessage(
            "Izin notifikasi diblokir. Ubah izin situs di pengaturan browser untuk mengaktifkan kembali.",
          );
          return;
        }

        let dismissed = false;
        try {
          dismissed =
            sessionStorage.getItem(promptDismissedKey(user.id)) === "1";
        } catch {}
        if (!dismissed && !cancelled) setPromptVisible(true);
      })
      .catch(() => {
        if (!cancelled)
          setMessage("Status notifikasi belum dapat diperiksa. Coba kembali.");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, supported]);

  useEffect(() => {
    if (!roleSupported || typeof document === "undefined") {
      setAccountHost(null);
      return;
    }
    const syncHost = () =>
      setAccountHost(document.querySelector(".quick-account-menu"));
    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      setAccountHost(null);
    };
  }, [user?.id, user?.role, roleSupported]);

  useEffect(() => {
    if (!user || !supported) return;
    const ended = () => {
      void navigator.serviceWorker
        .getRegistration("/")
        .then((reg) =>
          reg?.active?.postMessage({ type: "WARKOST_SESSION_ENDED" }),
        );
      setActive(false);
      setPromptVisible(false);
    };
    window.addEventListener("warkost:session-ended", ended);
    const id = Number(
      new URL(window.location.href).searchParams.get("pushOrder"),
    );
    if (Number.isSafeInteger(id) && id > 0) {
      onOpen?.(id);
      const url = new URL(window.location.href);
      url.searchParams.delete("pushOrder");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    return () => window.removeEventListener("warkost:session-ended", ended);
  }, [user?.id, supported]);

  if (!roleSupported) return null;

  const accountControl = accountHost
    ? createPortal(
        <div className="push-account-setting" aria-label="Pengaturan notifikasi">
          <div>
            <strong>Notifikasi perangkat</strong>
            <small>
              {!supported
                ? "Tidak didukung di browser ini"
                : active
                  ? "Aktif"
                  : Notification.permission === "denied"
                    ? "Izin browser diblokir"
                    : "Nonaktif"}
            </small>
          </div>
          {supported && config?.enabled && Notification.permission !== "denied" && (
            <button type="button" disabled={busy} onClick={toggle}>
              {busy
                ? "Memproses…"
                : active
                  ? "Nonaktifkan Notifikasi"
                  : "Aktifkan Notifikasi"}
            </button>
          )}
          {message && <p role="status">{message}</p>}
          {!supported && (
            <p role="status">
              Pada iPhone/iPad, tambahkan Warkost ke Layar Utama lalu buka dari
              ikon aplikasi.
            </p>
          )}
        </div>,
        accountHost,
      )
    : null;

  return (
    <Fragment>
      {promptVisible && supported && config?.enabled && (
        <aside
          className="push-permission-prompt"
          role="dialog"
          aria-label="Aktifkan notifikasi Warkost"
        >
          <button
            className="push-permission-close"
            type="button"
            aria-label="Nanti"
            onClick={dismissPrompt}
          >
            ×
          </button>
          <span className="push-permission-icon" aria-hidden="true">
            🔔
          </span>
          <div>
            <strong>Aktifkan notifikasi Warkost?</strong>
            <p>
              Dapatkan update pesanan dan pembayaran meski Warkost sedang di
              latar belakang.
            </p>
          </div>
          <div className="push-permission-actions">
            <button type="button" disabled={busy} onClick={toggle}>
              {busy ? "Memproses…" : "Aktifkan"}
            </button>
            <button type="button" disabled={busy} onClick={dismissPrompt}>
              Nanti
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </aside>
      )}
      {accountControl}
    </Fragment>
  );
}
