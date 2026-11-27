"use client";
import { useState } from "react";
export default function PrintBridgePairing() {
  const [station, setStation] = useState("ADMIN");
  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/print-bridge/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station, deviceId }),
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok)
        throw Error("Akses Owner/HTTPS diperlukan atau permintaan ditolak.");
      setMessage(
        value.code
          ? `Kode ${value.station}: ${value.code} (5 menit, satu kali). Jangan bagikan lewat chat/log.`
          : "Perangkat dicabut.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <h1>Pairing Android Print Bridge</h1>
      <p>
        Login Owner pada aplikasi yang sama dahulu. Pairing tidak mengaktifkan
        printer; konfigurasi perangkat memerlukan approval operasional.
      </p>
      <label>
        Stasiun{" "}
        <select value={station} onChange={(e) => setStation(e.target.value)}>
          <option>ADMIN</option>
          <option>KITCHEN</option>
        </select>
      </label>
      <button disabled={busy} onClick={() => act("enrollment")}>
        Buat kode satu kali
      </button>
      <p role="status" style={{ overflowWrap: "anywhere" }}>
        {message}
      </p>
      <label>
        Device ID untuk pencabutan{" "}
        <input
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button disabled={busy} onClick={() => act("revoke")}>
        Cabut perangkat
      </button>
    </main>
  );
}
