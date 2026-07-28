"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useBasket } from "@/lib/BasketProvider";
import { GA4_BRAND, GA4_CURRENCY, GA4_VERTICAL, pushGA4EcommerceEvent } from "@/lib/ga4Ecommerce";
import {
  markMetaPurchaseTracked,
  trackMetaEvent,
  wasMetaPurchaseTracked,
} from "@/lib/metaPixel";

interface OrderItem {
  id?: number;
  product_id?: number | null;
  product_name: string;
  size: string;
  color?: string | null;
  quantity: number;
  price: number;
  category_name?: string | null;
  imageUrl?: string | null;
}

interface OrderData {
  id: number;
  invoice_id: string;
  email?: string | null;
  phone_number?: string | null;
  nova_poshta_ttn?: string | null;
  items: OrderItem[];
  payment_type: string;
  payment_status: string;
}

type PageState = "loading" | "paid" | "pending" | "not_found" | "invalid";

const NO_ONLINE_PAYMENT_TYPES = new Set(["prepay", "pay_after", "test_payment"]);

function isNoOnlinePaymentType(paymentType: string | null | undefined): boolean {
  return paymentType != null && NO_ONLINE_PAYMENT_TYPES.has(paymentType);
}

function readPendingPaymentType(): string | null {
  try {
    const raw = localStorage.getItem("pendingPayment");
    if (!raw) return null;
    const data = JSON.parse(raw) as { paymentType?: string };
    return typeof data.paymentType === "string" ? data.paymentType : null;
  } catch {
    return null;
  }
}

function clearCheckoutStorage() {
  try {
    localStorage.removeItem("pendingPayment");
    localStorage.removeItem("pendingOrderItems");
    localStorage.removeItem("pendingOrderCustomer");
    localStorage.removeItem("basket");
    localStorage.removeItem("submittedOrder");
  } catch {
    // ignore
  }
}

function normalizePhoneForAds(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const { clearBasket } = useBasket();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [offlinePaymentHint] = useState(() =>
    typeof window !== "undefined" && isNoOnlinePaymentType(readPendingPaymentType())
  );
  const hasTrackedPurchaseRef = useRef(false);
  const hasTrackedConvAdsRef = useRef(false);

  const orderRef = searchParams.get("orderReference");

  // Після повернення з Mono (redirectUrl без query) — беремо orderId з localStorage і редіректимо
  useEffect(() => {
    if (orderRef) return;
    try {
      const pending = localStorage.getItem("pendingPayment");
      if (pending) {
        const data = JSON.parse(pending) as { orderId?: string };
        if (data?.orderId) {
          window.location.replace(`/success?orderReference=${encodeURIComponent(data.orderId)}`);
          return;
        }
      }
      setState("invalid");
    } catch {
      setState("invalid");
    }
  }, [orderRef]);

  async function loadOrder(signal?: AbortSignal) {
    if (!orderRef) {
      setState("invalid");
      return;
    }
    setOrderId(orderRef);
    const offlineHint = isNoOnlinePaymentType(readPendingPaymentType());

    try {
      const response = await fetch(`/api/orders/invoice/${orderRef}`, { signal });
      if (response.ok) {
        const orderData = (await response.json()) as OrderData;
        setOrder(orderData);
        setState("paid");
        clearBasket();
        clearCheckoutStorage();
        return;
      }
      if (response.status === 409) {
        setState(offlineHint ? "paid" : "pending");
        if (offlineHint) {
          clearBasket();
          clearCheckoutStorage();
        }
        return;
      }
      setState("not_found");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch order:", error);
      setState("not_found");
    }
  }

  useEffect(() => {
    if (!orderRef) return;
    const controller = new AbortController();
    setState("loading");
    void loadOrder(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when order ref changes
  }, [orderRef]);

  // GA4 eCommerce purchase + Google Ads enhanced conversions + Meta Pixel Purchase (1x per transaction)
  useEffect(() => {
    if (state !== "paid") return;
    const txId = order?.invoice_id ?? orderId;
    if (!txId) return;
    const purchaseStorageKey = `tracked_purchase:${txId}`;
    const convStorageKey = `tracked_conv_google_ads:${txId}`;

    let purchaseAlreadyTracked = hasTrackedPurchaseRef.current;
    let convAlreadyTracked = hasTrackedConvAdsRef.current;
    try {
      if (typeof window !== "undefined") {
        purchaseAlreadyTracked =
          purchaseAlreadyTracked || localStorage.getItem(purchaseStorageKey) === "1";
        convAlreadyTracked =
          convAlreadyTracked || localStorage.getItem(convStorageKey) === "1";
      }
    } catch {
      // ignore storage read errors
    }

    const itemsForGA4 = (order?.items ?? []).map((it) => ({
      item_id: String(it.product_id ?? `${it.product_name}-${it.size}`),
      item_name: it.product_name,
      item_brand: GA4_BRAND,
      item_category: it.category_name ?? "Каталог",
      item_variant: it.color ?? undefined,
      price: it.price,
      quantity: it.quantity,
      google_business_vertical: GA4_VERTICAL,
    }));

    const value = (order?.items ?? []).reduce(
      (sum, it) => sum + it.price * it.quantity,
      0
    );

    if (!purchaseAlreadyTracked) {
      pushGA4EcommerceEvent("purchase", {
        transaction_id: txId,
        currency: GA4_CURRENCY,
        value,
        items: itemsForGA4,
      });
      hasTrackedPurchaseRef.current = true;
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(purchaseStorageKey, "1");
        }
      } catch {
        // ignore storage write errors
      }
    }

    // Meta Pixel Purchase — covers one-click / Mono return when FinalCard did not fire yet
    // Dedup key = orderReference (same as FinalCard orderId), not Mono invoice_id
    if (orderId && !wasMetaPurchaseTracked(orderId) && (order?.items?.length ?? 0) > 0) {
      trackMetaEvent("Purchase", {
        content_ids: (order?.items ?? []).map((it) =>
          String(it.product_id ?? it.id ?? it.product_name)
        ),
        content_type: "product",
        value,
        currency: "UAH",
        num_items: (order?.items ?? []).reduce((sum, it) => sum + it.quantity, 0),
      });
      markMetaPurchaseTracked(orderId);
    }

    if (!convAlreadyTracked) {
      const w = window as Window & { dataLayer?: Array<Record<string, unknown>> };
      w.dataLayer = w.dataLayer ?? [];
      w.dataLayer.push({
        event: "convGoogleAds",
        email: (order?.email ?? "").trim(),
        phone: normalizePhoneForAds(order?.phone_number),
      });

      hasTrackedConvAdsRef.current = true;
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(convStorageKey, "1");
        }
      } catch {
        // ignore storage write errors
      }
    }
  }, [order, orderId, state]);

  function handleRetry() {
    setRefreshing(true);
    loadOrder().finally(() => setRefreshing(false));
  }

  const loadingMessage = offlinePaymentHint
    ? "Завантаження замовлення..."
    : "Перевіряємо статус оплати...";

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#8B5E3F]" />
          <p className="mt-4 font-['Montserrat'] text-black/60">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  // Оплата ще не підтверджена (Mono webhook ще не надіслав підтвердження)
  if (state === "pending") {
    return (
      <div className="min-h-screen bg-[#faf9f7] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-black/[0.06] bg-white p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#8B5E3F]/10">
              <svg className="h-8 w-8 text-[#8B5E3F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mb-2 font-['Montserrat'] text-2xl font-semibold text-black">
              Очікуємо підтвердження оплати
            </h1>
            <p className="mb-6 font-['Montserrat'] text-sm text-black/65">
              Онлайн-платіж ще обробляється. Натисніть «Перевірити статус» або зачекайте кілька секунд і оновіть сторінку.
            </p>
            {orderId && (
              <p className="mb-6 font-['Montserrat'] text-sm text-black/50">
                Номер замовлення: <span className="font-semibold text-[#8B5E3F]">{orderId}</span>
              </p>
            )}
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={handleRetry}
                disabled={refreshing}
                className="inline-flex items-center justify-center rounded-xl bg-[#8B5E3F] px-6 py-3 font-['Montserrat'] text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {refreshing ? "Перевірка..." : "Перевірити статус"}
              </button>
              <Link
                href="/final"
                className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-6 py-3 font-['Montserrat'] text-base font-medium text-black/80 hover:bg-[#faf9f7]"
              >
                Повернутися до оформлення
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Замовлення не знайдено або невалідне посилання
  if (state === "not_found" || state === "invalid") {
    return (
      <div className="min-h-screen bg-[#faf9f7] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-black/[0.06] bg-white p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-black/5">
              <svg className="h-8 w-8 text-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mb-2 font-['Montserrat'] text-2xl font-semibold text-black">
              {state === "invalid" ? "Невірне посилання" : "Замовлення не знайдено"}
            </h1>
            <p className="mb-6 font-['Montserrat'] text-sm text-black/65">
              {state === "invalid"
                ? "У посиланні відсутній номер замовлення."
                : "Замовлення з таким номером не знайдено або посилання застаріле."}
            </p>
            <Link
              href="/catalog"
              className="inline-flex items-center justify-center rounded-xl bg-[#8B5E3F] px-6 py-3 font-['Montserrat'] text-base font-semibold text-white transition-opacity hover:opacity-90"
            >
              Перейти в каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // state === "paid" — сторінка оформленого замовлення з переліком товарів
  const total = order?.items?.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;
  const imageSrc = (url: string | null | undefined) =>
    !url ? undefined : url.startsWith("http") ? url : `/api/images/${url}`;

  return (
    <div className="min-h-screen bg-[#faf9f7] px-4 py-8 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-2xl">
        <nav className="mb-8" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 font-['Montserrat'] text-sm text-black/45">
            <li>
              <Link href="/" className="hover:text-[#8B5E3F]">
                Головна
              </Link>
            </li>
            <li className="text-black/30" aria-hidden>
              &gt;
            </li>
            <li className="text-black/70">Успішне замовлення</li>
          </ol>
        </nav>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-8 shadow-[0_4px_20px_rgba(0,0,0,0.05)] sm:p-10">
          <div className="mb-8 flex justify-center">
            <Image
              src="/images/logos/logo_brown.svg"
              alt="Plywood Present"
              width={168}
              height={48}
              className="h-11 w-auto"
            />
          </div>

          <div className="mb-2 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#8B5E3F]/10">
              <svg className="h-7 w-7 text-[#8B5E3F]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-['Montserrat'] text-2xl font-semibold text-black sm:text-3xl">
              Дякуємо за замовлення!
            </h1>
            <p className="mt-2 font-['Montserrat'] text-sm text-black/65 sm:text-base">
              Ми вже отримали ваше замовлення і незабаром зв&apos;яжемося з вами.
            </p>
            {(order?.invoice_id || orderId) && (
              <p className="mt-4 font-['Montserrat'] text-sm text-black/55">
                Номер:{" "}
                <span className="font-semibold text-[#8B5E3F]">
                  {order?.invoice_id ?? orderId}
                </span>
              </p>
            )}
            {order?.nova_poshta_ttn && (
              <div className="mt-4 rounded-xl border border-[#8B5E3F]/20 bg-[#8B5E3F]/5 p-4">
                <p className="font-['Montserrat'] text-xs font-semibold uppercase tracking-wider text-[#8B5E3F]">
                  Номер накладної Нової пошти (ТТН)
                </p>
                <p className="mt-1 font-['Montserrat'] text-lg font-bold text-black">
                  {order.nova_poshta_ttn}
                </p>
              </div>
            )}
          </div>

          {order?.items && order.items.length > 0 && (
            <div className="mt-8 border-t border-black/10 pt-8">
              <h2 className="mb-4 font-['Montserrat'] text-base font-semibold text-black">
                Товари у замовленні
              </h2>
              <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.06]">
                {order.items.map((item, index) => {
                  const itemTotal = item.price * item.quantity;
                  const src = imageSrc(item.imageUrl);
                  return (
                    <li key={index} className="flex gap-4 bg-[#faf9f7]/50 p-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f5f5f4]">
                        {src ? (
                          <img src={src} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-['Montserrat'] text-xs text-black/30">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-['Montserrat'] text-sm font-medium text-black sm:text-base">
                          {item.product_name}
                          {item.size && item.size !== "—" ? ` · ${item.size}` : ""}
                          {item.color ? ` · ${item.color}` : ""}
                        </p>
                        <p className="mt-0.5 font-['Montserrat'] text-sm text-black/55">
                          {item.quantity} шт.
                        </p>
                        <p className="mt-1 font-['Montserrat'] text-sm font-semibold text-black">
                          {Math.round(itemTotal).toLocaleString("uk-UA")} грн
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-right font-['Montserrat'] text-lg font-semibold text-black">
                Разом: {Math.round(total).toLocaleString("uk-UA")} грн
              </p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex min-w-[220px] items-center justify-center rounded-xl bg-[#8B5E3F] px-8 py-4 font-['Montserrat'] text-base font-semibold text-white transition-opacity hover:opacity-90"
            >
              На головну
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#8B5E3F]" />
            <p className="mt-4 font-['Montserrat'] text-black/60">Завантаження...</p>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}

