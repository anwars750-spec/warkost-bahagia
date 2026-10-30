"use client";

import { useEffect, useRef, useState } from "react";
import {
  orderStatusLabel,
  paymentGuidance,
  paymentMethodLabel,
  paymentStatusLabel,
} from "./conversationDisplay.mjs";

const money = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const timeLabel = (value) => {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const ChatIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M7 18l-4 3v-5.5A8 8 0 0 1 3 4h12a6 6 0 0 1 6 6v1a7 7 0 0 1-7 7H7Z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
  </svg>
);

const SupportChatStyles = () => (
  <style>{`
    .conversation-screen.support-chat {
      width: min(840px, calc(100vw - 48px));
      height: min(720px, calc(100dvh - 48px));
      max-height: none;
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      border: 1px solid #e6d7c6;
      border-radius: 24px;
      background: #fbf7f2;
      box-shadow: 0 30px 90px rgba(52, 30, 18, 0.28);
    }

    .support-chat .conversation-header {
      min-height: 76px;
      padding: 12px 18px;
      column-gap: 11px;
      border-bottom-color: rgba(255, 255, 255, 0.08);
      background: linear-gradient(135deg, #55301f 0%, #6a3a23 100%);
    }

    .support-chat .conversation-header-action {
      width: 40px;
      height: 40px;
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }

    .support-chat .conversation-header-action:hover {
      border-color: rgba(255, 255, 255, 0.42);
      background: rgba(255, 255, 255, 0.14);
    }

    .support-chat .conversation-avatar {
      width: 42px;
      height: 42px;
      border: 0;
      background: #fff4e7;
      color: #60351f;
      box-shadow: none;
    }

    .support-chat .conversation-identity {
      gap: 3px;
    }

    .support-chat .conversation-identity strong {
      font-size: 1rem;
      font-weight: 800;
    }

    .support-chat .conversation-identity span {
      color: #ead7c8;
      font-size: 0.75rem;
    }

    .support-chat .conversation-messages {
      min-height: 0;
      gap: 12px;
      padding: 22px 24px;
      background:
        radial-gradient(circle at 92% 8%, rgba(176, 113, 70, 0.08), transparent 32%),
        #fbf7f2;
    }

    .support-chat .conversation-empty {
      min-height: 0;
      max-width: 420px;
      margin: auto;
      padding: 28px 22px;
      color: #7c695c;
    }

    .support-chat .conversation-empty-icon {
      width: 50px;
      height: 50px;
      margin-bottom: 12px;
      border-color: #e8d7c4;
      border-radius: 16px;
      background: #fff;
      color: #6a3a23;
      box-shadow: 0 8px 22px rgba(79, 46, 27, 0.06);
    }

    .support-chat .conversation-empty strong {
      color: #553728;
      font-size: 1rem;
      font-weight: 800;
    }

    .support-chat .conversation-empty p {
      max-width: 360px;
      margin-top: 6px;
      color: #8a776a;
      font-size: 0.86rem;
      line-height: 1.55;
    }

    .support-chat .conversation-bubble {
      max-width: min(72%, 520px);
      padding: 10px 13px 9px;
      border-radius: 16px 16px 16px 6px;
      box-shadow: 0 5px 16px rgba(70, 42, 26, 0.05);
    }

    .support-chat .conversation-bubble.own {
      border-color: #6a3a23;
      border-radius: 16px 16px 6px 16px;
      background: #6a3a23;
    }

    .support-chat .conversation-prompts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      overflow: visible;
      padding: 12px 18px;
      border-top: 1px solid #eadfd4;
      background: #fffdfb;
    }

    .support-chat .conversation-prompts button {
      flex: 0 0 auto;
      width: auto;
      min-width: 0;
      min-height: 36px;
      height: auto;
      margin: 0;
      padding: 8px 13px;
      border: 1px solid #dec9b3;
      border-radius: 999px;
      background: #fff9f2;
      color: #633921;
      font-size: 0.75rem;
      font-weight: 650;
      line-height: 1.25;
      white-space: nowrap;
      box-shadow: none;
    }

    .support-chat .conversation-prompts button:hover {
      border-color: #a97858;
      background: #fff;
    }

    .support-chat .conversation-composer {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 12px 18px 14px;
      border-top: 1px solid #eadfd4;
      background: #fff;
      box-shadow: 0 -8px 24px rgba(67, 40, 25, 0.03);
    }

    .support-chat .conversation-composer input {
      width: 100%;
      min-width: 0;
      height: 46px;
      margin: 0;
      padding: 0 15px;
      border: 1px solid #ded2c7;
      border-radius: 14px;
      outline: 0;
      background: #fcfaf8;
      color: #493126;
      font: inherit;
      font-size: 0.84rem;
    }

    .support-chat .conversation-composer input:focus {
      border-color: #9c6a4c;
      background: #fff;
      box-shadow: 0 0 0 3px rgba(156, 106, 76, 0.1);
    }

    .support-chat .conversation-composer input::placeholder {
      color: #9e9189;
    }

    .support-chat .conversation-composer .primary {
      width: auto;
      min-width: 84px;
      height: 46px;
      margin: 0;
      padding: 0 18px;
      border: 1px solid #65371f;
      border-radius: 14px;
      background: #65371f;
      color: #fff;
      font-size: 0.8rem;
      font-weight: 800;
      box-shadow: 0 6px 16px rgba(82, 43, 23, 0.16);
    }

    .support-chat .conversation-composer .primary:hover:not(:disabled) {
      background: #56301d;
    }

    .support-chat .conversation-composer .primary:disabled {
      border-color: #dbcfc7;
      background: #dbcfc7;
      color: #fff;
      box-shadow: none;
      cursor: not-allowed;
    }

    .support-chat .conversation-order-context {
      gap: 8px;
      padding: 10px 16px;
      background: #f5ede5;
    }

    .support-chat .conversation-order-context > div {
      padding: 9px 10px;
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.72);
    }

    @media (max-width: 760px) {
      .conversation-screen.support-chat {
        width: 100%;
        height: 100dvh;
        max-height: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .support-chat .conversation-header {
        min-height: 68px;
        padding: max(10px, env(safe-area-inset-top)) 12px 10px;
      }

      .support-chat .conversation-header-action {
        width: 38px;
        height: 38px;
      }

      .support-chat .conversation-avatar {
        width: 40px;
        height: 40px;
      }

      .support-chat .conversation-messages {
        padding: 16px 14px;
      }

      .support-chat .conversation-empty {
        padding: 22px 16px;
      }

      .support-chat .conversation-bubble {
        max-width: 86%;
      }

      .support-chat .conversation-prompts {
        flex-wrap: nowrap;
        gap: 7px;
        overflow-x: auto;
        padding: 10px 12px;
        scrollbar-width: none;
      }

      .support-chat .conversation-prompts::-webkit-scrollbar {
        display: none;
      }

      .support-chat .conversation-prompts button {
        min-height: 34px;
        padding: 7px 11px;
        font-size: 0.72rem;
      }

      .support-chat .conversation-composer {
        padding: 10px 12px max(12px, env(safe-area-inset-bottom));
      }

      .support-chat .conversation-composer input,
      .support-chat .conversation-composer .primary {
        height: 44px;
      }

      .support-chat .conversation-composer .primary {
        min-width: 72px;
        padding: 0 14px;
      }
    }
  `}</style>
);

async function request(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Percakapan belum dapat dimuat");
  return data;
}

export default function ConversationChat({ target, viewerRole, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  const isDriverChat = target?.type === "CUSTOMER_DRIVER";
  const driverViewer = viewerRole === "DRIVER";
  const hasOrderTarget = Number(target?.orderId || 0) > 0;
  const prompts = driverViewer
    ? [
        "Saya sedang menuju lokasi",
        "Saya sudah dekat dengan alamat",
        "Saya sudah tiba di lokasi",
      ]
    : isDriverChat
      ? [
          "Saya sudah di lokasi",
          "Patokan rumah saya...",
          "Mohon hubungi saat sudah dekat",
        ]
      : hasOrderTarget
        ? [
            "Pesanan saya sampai mana?",
            "Saya ingin konfirmasi pembayaran",
            "Ada kendala pengantaran",
          ]
        : [
            "Saya butuh bantuan",
            "Saya ingin bertanya tentang menu",
            "Saya butuh bantuan akun",
          ];

  useEffect(() => {
    if (!target) return;
    let active = true;
    let timer;
    setLoading(true);
    setError("");
    request("chat-open", target)
      .then((result) => {
        if (!active) return;
        setConversation(result);
        setLoading(false);
        const refreshConversation = () => {
          request(`chat?conversationId=${result.id}`)
            .then((latest) => active && setConversation(latest))
            .catch((pollError) => active && setError(pollError.message));
        };
        const onRealtime = (event) => {
          if (
            event.detail?.type === "CONVERSATION_CHANGED" &&
            Number(event.detail?.payload?.conversationId) === Number(result.id)
          )
            refreshConversation();
        };
        window.addEventListener("warkost:realtime", onRealtime);
        window.addEventListener(
          "warkost:realtime-recovered",
          refreshConversation,
        );
        timer = {
          interval: window.setInterval(refreshConversation, 120000),
          onRealtime,
          onRecovered: refreshConversation,
        };
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setLoading(false);
      });
    return () => {
      active = false;
      if (timer) {
        window.clearInterval(timer.interval);
        window.removeEventListener("warkost:realtime", timer.onRealtime);
        window.removeEventListener(
          "warkost:realtime-recovered",
          timer.onRecovered,
        );
      }
    };
  }, [target?.type, target?.orderId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [conversation?.messages?.length]);

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !conversation?.can_send || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await request("chat-message", {
        conversationId: conversation.id,
        message,
      });
      setConversation(result.conversation);
      setDraft("");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  };

  const title = isDriverChat
    ? driverViewer
      ? conversation?.customer?.name || "Customer Warkost"
      : conversation?.driver?.name || "Driver Warkost"
    : "Admin Warkost";
  const screenClass = isDriverChat
    ? "conversation-screen conversation-screen-driver"
    : `conversation-screen support-chat ${hasOrderTarget ? "order-support" : "general-support"}`;

  return (
    <div className="conversation-backdrop" role="presentation">
      {!isDriverChat && <SupportChatStyles />}
      <section
        className={screenClass}
        role="dialog"
        aria-modal="true"
        aria-label={
          isDriverChat
            ? driverViewer
              ? "Chat dengan Customer"
              : "Chat dengan Driver"
            : "Chat dengan Admin"
        }
      >
        <header className="conversation-header">
          <button
            className="conversation-header-action"
            type="button"
            onClick={onClose}
            aria-label="Kembali"
          >
            <BackIcon />
          </button>
          <div className="conversation-avatar">
            {isDriverChat ? (driverViewer ? "CU" : "DR") : "AD"}
          </div>
          <div className="conversation-identity">
            <strong>{title}</strong>
            <span>
              {isDriverChat ? "Koordinasi pengantaran" : "Customer Support"}
              {conversation?.order?.display_number
                ? ` - ${conversation.order.display_number}`
                : !isDriverChat
                  ? " - Bantuan Umum"
                  : ""}
            </span>
          </div>
          <button
            className="conversation-header-action"
            type="button"
            onClick={onClose}
            aria-label="Tutup"
          >
            <CloseIcon />
          </button>
        </header>

        {conversation?.order && (
          <div className="conversation-order-context">
            <div>
              <small>PESANAN</small>
              <strong>{conversation.order.display_number}</strong>
            </div>
            <div>
              <small>STATUS</small>
              <strong>{orderStatusLabel(conversation.order.status)}</strong>
            </div>
            <div className="conversation-payment-fact">
              <small>METODE BAYAR</small>
              <strong>
                {paymentMethodLabel(conversation.order.payment_method)}
              </strong>
              <span
                className={`conversation-payment-status payment-${String(
                  conversation.order.payment_status || "unknown",
                ).toLowerCase()}`}
              >
                {paymentStatusLabel(conversation.order.payment_status)}
              </span>
              <em>
                {paymentGuidance(
                  conversation.order.payment_method,
                  conversation.order.payment_status,
                )}
              </em>
            </div>
            <div>
              <small>TOTAL</small>
              <strong>{money(conversation.order.total)}</strong>
            </div>
          </div>
        )}

        <div className="conversation-messages" aria-live="polite">
          {loading && (
            <p className="conversation-state">Memuat percakapan...</p>
          )}
          {!loading && !conversation?.messages?.length && !error && (
            <div className="conversation-empty">
              <span className="conversation-empty-icon">
                <ChatIcon />
              </span>
              <strong>Belum ada pesan</strong>
              <p>
                {conversation?.order
                  ? "Mulai percakapan terkait pesanan ini."
                  : "Mulai percakapan dengan Customer Service Warkost."}
              </p>
            </div>
          )}
          {conversation?.messages?.map((message) => {
            const own = message.sender_role === viewerRole;
            return (
              <article
                className={`conversation-bubble ${own ? "own" : "other"}`}
                key={message.id}
              >
                <small>{own ? "Anda" : message.sender_name}</small>
                <p>{message.message}</p>
                <time>{timeLabel(message.created_at)}</time>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        {error && <p className="conversation-error">{error}</p>}
        {conversation?.can_send && (
          <div className="conversation-prompts">
            {prompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => setDraft(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form className="conversation-composer" onSubmit={send}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength="1000"
            placeholder={
              conversation?.can_send
                ? "Tulis pesan..."
                : "Percakapan hanya dapat dibaca"
            }
            disabled={!conversation?.can_send || sending}
            aria-label="Tulis pesan"
          />
          <button
            className="primary"
            disabled={!draft.trim() || !conversation?.can_send || sending}
          >
            {sending ? "Mengirim..." : "Kirim"}
          </button>
        </form>
      </section>
    </div>
  );
}
