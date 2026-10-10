import { NextResponse } from "next/server";
import { recordAttempt } from "../../../lib/rate-limit.mjs";
import { assertSameOrigin, readJsonBody } from "../../../lib/request.mjs";
import * as store from "../../../lib/store.mjs";
import {
  currentUser,
  issueSession,
  revokeSession,
  sessionSecret,
} from "../../../lib/auth.mjs";
import {
  required,
  createOrder,
  changeStatus,
  updateStationStatus,
  acceptDelivery,
  claimDelivery,
  claimReadyDeliveries,
  customerDriverWaitNotice,
  deliveryAvailability,
  listDriverOrders,
  pickupAllDeliveries,
  DomainError,
  requiredCapability,
} from "../../../lib/domain.mjs";
import {
  listCatalog,
  saveProduct,
  saveCategory,
  saveSubcategory,
} from "../../../lib/catalog.mjs";
import {
  createDriver,
  createStaff,
  listStaff,
  resetStaffPassword,
  setDriverActive,
} from "../../../lib/staff.mjs";
import { listCustomers, setCustomerActive } from "../../../lib/customers.mjs";
import { dailyReport } from "../../../lib/reports.mjs";
import { nonNegativeInteger } from "../../../lib/numbers.mjs";
import {
  expirePendingPayments,
  getPaymentStatus,
  verifyPayment,
} from "../../../lib/payments.mjs";
import {
  submitCodSettlement,
  verifyCodSettlement,
} from "../../../lib/cod-settlements.mjs";
import {
  getCodBatch,
  getDriverCodBatch,
  listAdminCodBatches,
  submitCodBatch,
  verifyCodBatch,
} from "../../../lib/cod-settlement-batches.mjs";
import { getSettings, saveSettings } from "../../../lib/settings.mjs";
import {
  listNotifications,
  readNotification,
} from "../../../lib/notifications.mjs";
import {
  getConversation,
  listAdminConversations,
  openConversation,
  sendConversationMessage,
  updateConversationStatus,
} from "../../../lib/communications.mjs";
import {
  addAddress,
  getCustomerAccount,
  replaceAddress,
  removeAddress,
  setDefaultAddress,
  updateProfile,
} from "../../../lib/account.mjs";
import {
  authenticateCustomer,
  registerCustomer,
} from "../../../lib/customer-auth.mjs";
import {
  OTP_PURPOSES,
  requestPasswordReset,
  resendOtp,
  resetPassword,
  verifyPasswordResetOtp,
  verifyRegistrationOtp,
} from "../../../lib/otp.mjs";
import {
  adjustStock,
  listStock,
  listAuditLogs,
} from "../../../lib/operations.mjs";
import { listPrintJobs, retryPrintJob } from "../../../lib/printer.mjs";
import { driverContactIsVisible } from "../../../lib/delivery.mjs";
import { listPromotions, savePromotion } from "../../../lib/promotions.mjs";
import {
  claimVoucher,
  listCustomerVouchers,
  quoteVoucher,
} from "../../../lib/vouchers.mjs";
import {
  listCustomerRewards,
  listRewardRules,
  quoteLoyaltyReward,
  saveRewardRule,
} from "../../../lib/loyalty.mjs";
import { CAPABILITIES } from "../../../lib/rbac.mjs";
import { createGuestCustomer } from "../../../lib/guest.mjs";
import { isGuestCustomer } from "../../../lib/customer-kind.mjs";
import { managerAnalytics } from "../../../lib/manager-analytics.mjs";
export const runtime = "nodejs";
const out = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const integer = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : NaN;
function error(e) {
  if (e instanceof DomainError) return out({ error: e.message }, e.status);
  console.error("API error", e);
  return out({ error: "Terjadi kesalahan server" }, 500);
}
function cookieOptions(request) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 7 * 86400,
  };
}
export async function GET(request, { params }) {
  try {
    const { action } = await params;
    const user = await currentUser(request);
    if (action === "me") return out({ user });
    if (action === "notifications") return out(await listNotifications(user));
    if (action === "chat-inbox")
      return out(
        await listAdminConversations(user, {
          filter: request.nextUrl.searchParams.get("filter") || "all",
          query: request.nextUrl.searchParams.get("q") || "",
        }),
      );
    if (action === "chat")
      return out(
        await getConversation(
          user,
          integer(request.nextUrl.searchParams.get("conversationId")),
        ),
      );
    if (action === "menu") return out(await listCatalog(false));
    if (action === "manager-dashboard")
      return out(
        await managerAnalytics(user, {
          preset: request.nextUrl.searchParams.get("preset") || "today",
          from: request.nextUrl.searchParams.get("from") || "",
          to: request.nextUrl.searchParams.get("to") || "",
        }),
      );
    if (action === "inventory") {
      requiredCapability(user, CAPABILITIES.CATALOG_READ);
      return out(await listCatalog(true));
    }
    if (action === "stock" || action === "admin-beverage-stock")
      return out(await listStock(user));
    if (action === "audit") {
      const rawBefore = request.nextUrl.searchParams.get("before");
      return out(
        await listAuditLogs(
          user,
          rawBefore === null ? null : integer(rawBefore),
        ),
      );
    }
    if (action === "settings") return out(await getSettings(user));
    if (action === "promotions")
      return out({ promotions: await listPromotions(user) });
    if (action === "vouchers")
      return out({ vouchers: await listCustomerVouchers(user) });
    if (action === "loyalty-rewards")
      return out({ rewards: await listRewardRules(user) });
    if (action === "print-jobs")
      return out({ jobs: await listPrintJobs(user) });
    if (action === "delivery-capacity") {
      required(user, ["CUSTOMER", "ADMIN", "OWNER"]);
      const availability = await deliveryAvailability();
      return out({
        availableDrivers: availability.availableAtStore,
        onlineDrivers: availability.onlineDrivers,
        awayDrivers: availability.awayDrivers,
        availableSlots: availability.availableSlots,
        delayed: availability.delayed,
      });
    }
    if (action === "report")
      return out(
        await dailyReport(
          user,
          request.nextUrl.searchParams.get("date") ||
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
        ),
      );
    if (action === "dashboard") {
      requiredCapability(user, CAPABILITIES.DASHBOARD_READ);
      await expirePendingPayments();
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const first = new Date(localDate + "T00:00:00+07:00");
      const from = first.toISOString().slice(0, 19).replace("T", " "),
        until = new Date(first.getTime() + 86400000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      const today = await store.get(
        "SELECT COUNT(*) orders FROM orders WHERE created_at>=? AND created_at<?",
        from,
        until,
      );
      today.orders = nonNegativeInteger(today.orders, "Jumlah pesanan");
      today.revenue = (
        await store.get(
          "SELECT COALESCE(SUM(o.total),0) revenue FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.status='PAID' AND p.paid_at>=? AND p.paid_at<?",
          from,
          until,
        )
      ).revenue;
      today.revenue = nonNegativeInteger(today.revenue, "Revenue");
      const statuses = await store.all(
        "SELECT status,COUNT(*) count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",
        from,
        until,
      );
      for (const row of statuses)
        row.count = nonNegativeInteger(row.count, "Jumlah status");
      const paymentStatuses = await store.all(
        "SELECT p.status,COUNT(*) count FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.created_at>=? AND o.created_at<? AND p.status IN ('PENDING','PAID','FAILED','EXPIRED') GROUP BY p.status",
        from,
        until,
      );
      for (const row of paymentStatuses)
        row.count = nonNegativeInteger(row.count, "Jumlah status pembayaran");
      return out({
        today,
        statuses,
        paymentStatuses,
        customers: nonNegativeInteger(
          (
            await store.get(
              "SELECT COUNT(*) count FROM users WHERE role='CUSTOMER'",
            )
          ).count,
          "Jumlah pelanggan",
        ),
        drivers: nonNegativeInteger(
          (
            await store.get(
              "SELECT COUNT(*) count FROM users WHERE role='DRIVER' AND active=1",
            )
          ).count,
          "Jumlah driver",
        ),
        loyalty: nonNegativeInteger(
          (
            await store.get(
              "SELECT COUNT(*) count FROM loyalty_transactions WHERE created_at>=? AND created_at<?",
              from,
              until,
            )
          ).count,
          "Jumlah transaksi loyalti",
        ),
      });
    }
    if (action === "orders") {
      required(user, ["CUSTOMER", "ADMIN", "DRIVER", "KITCHEN", "OWNER"]);
      await expirePendingPayments();
      const rawBefore = request.nextUrl.searchParams.get("before");
      const before = rawBefore === null ? null : integer(rawBefore);
      if (rawBefore !== null && !Number.isSafeInteger(before))
        throw new DomainError("Cursor pesanan tidak valid");
      const bound = before === null ? "" : " AND o.id<?";
      let orders;
      if (user.role === "CUSTOMER")
        orders = await store.all(
          "SELECT o.*,a.label address_label,a.detail address,p.method,p.status payment_status,p.amount payment_amount,p.provider_reference,p.transaction_reference,p.qr_payload,p.payment_url,p.expires_at payment_expires_at,d.driver_id,d.accepted_at,d.delivered_at,du.phone driver_phone FROM orders o JOIN addresses a ON a.id=o.address_id JOIN payments p ON p.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN users du ON du.id=d.driver_id WHERE o.customer_id=?" +
            bound +
            " ORDER BY o.id DESC LIMIT 26",
          user.id,
          ...(before === null ? [] : [before]),
        );
      else if (user.role === "DRIVER")
        orders = await listDriverOrders(user, before);
      else if (user.role === "KITCHEN")
        orders = await store.all(
          "SELECT o.*,u.name customer_name,s.status kitchen_status FROM orders o JOIN order_stations s ON s.order_id=o.id AND s.station='KITCHEN' JOIN users u ON u.id=o.customer_id WHERE o.status IN ('CONFIRMED','PREPARING','READY')" +
            bound +
            " ORDER BY o.id DESC LIMIT 26",
          ...(before === null ? [] : [before]),
        );
      else
        orders = await store.all(
          "SELECT o.*,u.name customer_name,a.detail address,p.method,p.status payment_status,p.amount payment_amount,d.driver_id,s.id settlement_id,s.status settlement_status,s.expected_amount,s.cash_amount,s.evidence_reference,s.submitted_at,s.admin_verifier_id,s.verified_at,s.discrepancy_amount,(SELECT status FROM order_stations WHERE order_id=o.id AND station='KITCHEN') kitchen_status,(SELECT status FROM order_stations WHERE order_id=o.id AND station='CASHIER') cashier_status FROM orders o JOIN users u ON u.id=o.customer_id JOIN addresses a ON a.id=o.address_id JOIN payments p ON p.order_id=o.id LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN cod_settlements s ON s.order_id=o.id WHERE 1=1" +
            bound +
            " ORDER BY o.id DESC LIMIT 26",
          ...(before === null ? [] : [before]),
        );
      const hasMore = orders.length > 25;
      const page = orders.slice(0, 25);
      if (user.role === "CUSTOMER") {
        const availability = await deliveryAvailability();
        const businessWhatsApp =
          (
            await store.get(
              "SELECT value FROM settings WHERE `key`='business_whatsapp'",
            )
          )?.value || "6281546407856";
        for (const order of page) {
          order.driver_delay_notice = customerDriverWaitNotice(
            order,
            availability,
          );
          order.admin_whatsapp = businessWhatsApp;
          order.driver_whatsapp = driverContactIsVisible(
            order.accepted_at,
            order.delivered_at,
          )
            ? order.driver_phone
            : null;
          delete order.driver_phone;
        }
      }
      return out({ orders: page, nextCursor: hasMore ? page.at(-1).id : null });
    }
    if (action === "payment-status")
      return out(
        await getPaymentStatus(
          user,
          integer(request.nextUrl.searchParams.get("orderId")),
        ),
      );
    if (action === "cod-batch-driver")
      return out(await getDriverCodBatch(user));
    if (action === "cod-batches")
      return out({
        batches: await listAdminCodBatches(
          user,
          request.nextUrl.searchParams.get("filter") || "pending",
        ),
      });
    if (action === "cod-batch")
      return out(
        await getCodBatch(
          user,
          integer(request.nextUrl.searchParams.get("batchId")),
        ),
      );
    if (action === "account") {
      required(user, ["CUSTOMER"]);
      const { profile, addresses } = await getCustomerAccount(user);
      if (isGuestCustomer(user))
        return out({
          profile: { ...profile, email: "" },
          addresses,
          loyalty: 0,
          transactions: [],
          vouchers: [],
          rewards: [],
          guest: true,
        });
      const loyalty =
        (
          await store.get(
            "SELECT balance FROM loyalty_accounts WHERE user_id=?",
            user.id,
          )
        )?.balance || 0;
      const transactions = await store.all(
        "SELECT * FROM loyalty_transactions WHERE user_id=? ORDER BY id DESC LIMIT 50",
        user.id,
      );
      const vouchers = await listCustomerVouchers(user);
      const rewards = await listCustomerRewards(user);
      return out({
        profile,
        addresses,
        loyalty,
        transactions,
        vouchers,
        rewards,
      });
    }
    if (action === "drivers") {
      requiredCapability(user, CAPABILITIES.DELIVERY_READ);
      return out({
        drivers: await store.all(
          "SELECT u.id,u.name,u.email,u.phone,u.active,(SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.driver_id=u.id AND o.status IN ('ASSIGNED','PICKED_UP','ON_DELIVERY')) active_load FROM users u WHERE u.role='DRIVER' ORDER BY active_load,u.name",
        ),
      });
    }
    if (action === "staff") return out({ staff: await listStaff(user) });
    if (action === "customers") {
      const rawBefore = request.nextUrl.searchParams.get("before");
      return out(
        await listCustomers(
          user,
          request.nextUrl.searchParams.get("q") || "",
          rawBefore === null ? null : integer(rawBefore),
        ),
      );
    }
    if (action === "order-items") {
      required(user, ["CUSTOMER", "ADMIN", "DRIVER", "KITCHEN", "OWNER"]);
      const id = integer(request.nextUrl.searchParams.get("id"));
      const order = await store.get(
        "SELECT customer_id FROM orders WHERE id=?",
        id,
      );
      if (!order) throw new DomainError("Order tidak ditemukan", 404);
      if (
        (user.role === "CUSTOMER" && order.customer_id !== user.id) ||
        (user.role === "DRIVER" &&
          !(await store.get(
            "SELECT id FROM deliveries WHERE order_id=? AND driver_id=?",
            id,
            user.id,
          ))) ||
        (user.role === "KITCHEN" &&
          !(await store.get(
            "SELECT id FROM order_stations WHERE order_id=? AND station='KITCHEN'",
            id,
          )))
      )
        throw new DomainError("Akses ditolak", 403);
      return out({
        items: await store.all(
          "SELECT name,price,quantity,note,prep_station,stock_unit,price_unit_quantity FROM order_items WHERE order_id=?" +
            (user.role === "KITCHEN" ? " AND prep_station='KITCHEN'" : ""),
          id,
        ),
        events: await store.all(
          "SELECT previous_status,next_status,created_at FROM order_events WHERE order_id=? ORDER BY id",
          id,
        ),
      });
    }
    throw new DomainError("Endpoint tidak ditemukan", 404);
  } catch (e) {
    return error(e);
  }
}
export async function POST(request, { params }) {
  try {
    assertSameOrigin(request);
    const { action } = await params;
    const body = await readJsonBody(request);
    if (
      [
        "login",
        "guest",
        "register",
        "otp-verify",
        "otp-resend",
        "password-reset-request",
        "password-reset",
      ].includes(action)
    ) {
      if (
        !(await recordAttempt(
          action,
          String(
            body.challengeId ||
              body.identifier ||
              body.email ||
              body.phone ||
              body.name ||
              "",
          )
            .trim()
            .toLowerCase()
            .slice(0, 255),
          action === "otp-verify" ? 10 : 12,
        ))
      )
        throw new DomainError(
          "Terlalu banyak percobaan. Coba lagi nanti.",
          429,
        );
    }
    const user = await currentUser(request);
    if (action === "profile" && body.newPassword && user) {
      if (!(await recordAttempt("profile", user.id, 5)))
        throw new DomainError(
          "Terlalu banyak percobaan. Coba lagi nanti.",
          429,
        );
    }
    if (action === "register") {
      sessionSecret();
      const result = await registerCustomer(body);
      return out(result, 201);
    }
    if (action === "guest") {
      sessionSecret();
      const account = await createGuestCustomer(body);
      const response = out(
        {
          user: {
            id: account.id,
            name: account.name,
            role: account.role,
            isGuest: true,
          },
        },
        201,
      );
      response.cookies.set(
        "wb_session",
        await issueSession(account),
        cookieOptions(request),
      );
      return response;
    }
    if (action === "otp-resend") {
      return out(
        await resendOtp({
          challengeId: body.challengeId,
          purpose: body.purpose,
        }),
      );
    }
    if (action === "otp-verify") {
      if (body.purpose === OTP_PURPOSES.REGISTRATION) {
        const result = await verifyRegistrationOtp(body);
        if (result.alreadyVerified)
          return out({ verified: true, alreadyVerified: true });
        const response = out({
          verified: true,
          alreadyVerified: false,
          user: {
            id: result.user.id,
            name: result.user.name,
            role: result.user.role,
          },
        });
        response.cookies.set(
          "wb_session",
          await issueSession(result.user),
          cookieOptions(request),
        );
        return response;
      }
      if (body.purpose === OTP_PURPOSES.PASSWORD_RESET)
        return out(await verifyPasswordResetOtp(body));
      throw new DomainError("Tujuan OTP tidak valid");
    }
    if (action === "password-reset-request") {
      return out(await requestPasswordReset(body.identifier));
    }
    if (action === "password-reset") {
      const result = await resetPassword(body);
      const response = out({
        ...result,
        message: "Password berhasil diperbarui. Silakan masuk kembali.",
      });
      response.cookies.set("wb_session", "", {
        ...cookieOptions(request),
        maxAge: 0,
      });
      return response;
    }
    if (action === "login") {
      const account = await authenticateCustomer(
        body.identifier || body.email,
        body.password,
      );
      const response = out({
        user: { id: account.id, name: account.name, role: account.role },
      });
      response.cookies.set(
        "wb_session",
        await issueSession(account),
        cookieOptions(request),
      );
      return response;
    }
    if (action === "logout") {
      await revokeSession(request);
      const response = out({ ok: true });
      response.cookies.set("wb_session", "", {
        ...cookieOptions(request),
        maxAge: 0,
      });
      return response;
    }
    if (action === "notification-read")
      return out(await readNotification(user, integer(body.id)));
    if (action === "chat-open")
      return out(
        await openConversation(user, {
          type: body.type,
          orderId: integer(body.orderId),
        }),
      );
    if (action === "chat-message")
      return out(
        await sendConversationMessage(user, {
          conversationId: integer(body.conversationId),
          message: body.message,
        }),
        201,
      );
    if (action === "chat-status")
      return out(
        await updateConversationStatus(
          user,
          integer(body.conversationId),
          body.status,
        ),
      );
    if (action === "address") return out(await addAddress(user, body));
    if (action === "address-replace")
      return out(await replaceAddress(user, integer(body.id), body));
    if (action === "address-default")
      return out(await setDefaultAddress(user, integer(body.id)));
    if (action === "address-remove")
      return out(await removeAddress(user, integer(body.id)));
    if (action === "profile") {
      const result = await updateProfile(user, body);
      const response = out({ user: result.user });
      if (result.passwordChanged)
        response.cookies.set(
          "wb_session",
          await issueSession(result.user),
          cookieOptions(request),
        );
      return response;
    }
    if (action === "checkout") {
      if (!body.idempotencyKey)
        throw new DomainError("Kunci checkout wajib diisi");
      return out(
        await createOrder(user, {
          ...body,
          addressId: integer(body.addressId),
          promotionId:
            body.promotionId == null ? null : integer(body.promotionId),
          loyaltyRewardId:
            body.loyaltyRewardId == null ? null : integer(body.loyaltyRewardId),
        }),
        201,
      );
    }
    if (action === "voucher-claim")
      return out(await claimVoucher(user, integer(body.promotionId)));
    if (action === "voucher-quote")
      return out(
        await quoteVoucher(user, {
          promotionId: integer(body.promotionId),
          items: body.items,
          paymentMethod: body.paymentMethod,
        }),
      );
    if (action === "loyalty-quote")
      return out(
        await quoteLoyaltyReward(user, {
          rewardRuleId: integer(body.rewardRuleId),
          items: body.items,
        }),
      );
    if (action === "status")
      return out(
        await changeStatus(
          user,
          integer(body.orderId),
          body.status,
          integer(body.driverId),
        ),
      );
    if (action === "station-status")
      return out(
        await updateStationStatus(user, integer(body.orderId), body.status),
      );
    if (action === "stock")
      return out(
        await adjustStock(user, {
          productId: integer(body.productId),
          quantity: Number(body.quantity),
          reason: body.reason,
        }),
      );
    if (action === "accept")
      return out(await acceptDelivery(user, integer(body.orderId)));
    if (action === "claim-delivery")
      return out(await claimDelivery(user, integer(body.orderId)));
    if (action === "claim-all-deliveries")
      return out(await claimReadyDeliveries(user));
    if (action === "pickup-all-deliveries")
      return out(await pickupAllDeliveries(user));
    if (action === "payment")
      return out(await verifyPayment(user, integer(body.orderId), body.status));
    if (action === "cod-settlement-submit")
      return out(
        await submitCodSettlement(user, {
          orderId: integer(body.orderId),
          cashAmount: body.cashAmount,
          evidenceReference: body.evidenceReference,
        }),
      );
    if (action === "cod-settlement-verify")
      return out(await verifyCodSettlement(user, integer(body.orderId)));
    if (action === "cod-batch-submit")
      return out(
        await submitCodBatch(user, {
          cashAmount: body.cashAmount,
          evidenceReference: body.evidenceReference,
        }),
      );
    if (action === "cod-batch-verify")
      return out(await verifyCodBatch(user, integer(body.batchId)));
    if (action === "print-retry")
      return out(await retryPrintJob(user, integer(body.id)));
    if (action === "settings") return out(await saveSettings(user, body));
    if (action === "driver") return out(await createDriver(user, body), 201);
    if (action === "staff") return out(await createStaff(user, body), 201);
    if (action === "staff-password")
      return out(
        await resetStaffPassword(user, integer(body.id), body.password),
      );
    if (action === "driver-active")
      return out(await setDriverActive(user, integer(body.id), body.active));
    if (action === "customer-active")
      return out(await setCustomerActive(user, integer(body.id), body.active));
    if (action === "product") return out(await saveProduct(user, body));
    if (action === "promotion") return out(await savePromotion(user, body));
    if (action === "loyalty-reward")
      return out(await saveRewardRule(user, body));
    if (action === "category") return out(await saveCategory(user, body));
    if (action === "subcategory") return out(await saveSubcategory(user, body));
    throw new DomainError("Endpoint tidak ditemukan", 404);
  } catch (e) {
    return error(e);
  }
}
