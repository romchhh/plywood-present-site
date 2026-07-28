"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useBasket } from "@/lib/BasketProvider";
import Link from "next/link";
import CartLineItems from "@/components/cart/CartLineItems";
import { getBasketUnitPrice, getItemSubtotal } from "@/lib/pricing";
import { clearCartPromo, loadCartPromo, saveCartPromo } from "@/lib/cartPromoStorage";
import {
  GA4_BRAND,
  GA4_CURRENCY,
  GA4_VERTICAL,
  pushGA4EcommerceEvent,
} from "@/lib/ga4Ecommerce";
import { ENABLE_ONLINE_CARD_PAYMENT } from "@/lib/paymentConfig";
import {
  markMetaPurchaseTracked,
  trackMetaEvent,
  wasMetaPurchaseTracked,
} from "@/lib/metaPixel";

/** Calculate order subtotal from basket items */
const ACCENT = "#8B5E3F";

function getSubtotal(
  items: {
    price: number | string;
    quantity: number;
    discount_percentage?: number | string;
    color_surcharge_uah?: number;
  }[]
) {
  return items.reduce((total, item) => {
    const itemPrice = typeof item.price === "string" ? parseFloat(item.price) : item.price;
    const discount = item.discount_percentage
      ? typeof item.discount_percentage === "string"
        ? parseFloat(item.discount_percentage)
        : item.discount_percentage
      : 0;
    const surcharge = item.color_surcharge_uah ?? 0;
    return (
      total +
      getItemSubtotal(itemPrice, item.quantity, discount || null, surcharge)
    );
  }, 0);
}

export default function FinalCard() {
  // GENERAL
  const { items, clearBasket } = useBasket();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const hasTrackedBeginCheckoutRef = useRef(false);
  const hasTrackedInitiateCheckoutRef = useRef(false);

  // CUSTOMER (Ім'я та Прізвище окремо для макета)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const customerName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("nova_poshta_branch");
  const [city, setCity] = useState("");
  const [postOffice, setPostOffice] = useState("");
  const [cityRef, setCityRef] = useState("");
  const DELIVERY_COST_BRANCH = 0; // доставка оплачується на відділенні, не додаємо до суми
  // Auto-fill showroom address when selected
  useEffect(() => {
    if (deliveryMethod === "showroom_pickup") {
      setCity("Київ");
      setPostOffice("Самовивіз: вул. Костянтинівська, 21 (13:00–19:00)");
      setCityRef("");
    } else {
      // Для способів Нової пошти не фіксуємо місто за замовчуванням
      setCity("");
      setPostOffice("");
      setCityRef("");
    }
  }, [deliveryMethod]);

  // Track InitiateCheckout event for Meta Pixel once per checkout session
  useEffect(() => {
    if (items.length === 0) {
      hasTrackedInitiateCheckoutRef.current = false;
      return;
    }
    if (hasTrackedInitiateCheckoutRef.current) return;
    if (typeof window === "undefined") return;

    const totalValue = getSubtotal(items);
    trackMetaEvent("InitiateCheckout", {
      content_ids: items.map((item) => String(item.id)),
      content_type: "product",
      value: totalValue,
      currency: "UAH",
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    });
    hasTrackedInitiateCheckoutRef.current = true;
  }, [items]);

  // GA4 eCommerce begin_checkout - send once per checkout session
  useEffect(() => {
    if (!mounted) return;
    if (items.length === 0) {
      hasTrackedBeginCheckoutRef.current = false;
      return;
    }
    if (hasTrackedBeginCheckoutRef.current) return;
    if (typeof window === "undefined") return;

    const itemsForGA4 = items.map((item) => {
      const unitPrice = getBasketUnitPrice(
        item.price,
        item.discount_percentage,
        item.color_surcharge_uah
      );
      return {
        item_id: String(item.id),
        item_name: item.name,
        item_brand: GA4_BRAND,
        item_category: item.category_name ?? "Каталог",
        item_variant: item.size,
        price: unitPrice,
        quantity: item.quantity,
        google_business_vertical: GA4_VERTICAL,
      };
    });

    const totalValue = itemsForGA4.reduce(
      (sum, i) => sum + Number(i.price) * Number(i.quantity),
      0
    );

    pushGA4EcommerceEvent("begin_checkout", {
      currency: GA4_CURRENCY,
      value: totalValue,
      items: itemsForGA4,
    });

    hasTrackedBeginCheckoutRef.current = true;
  }, [items, mounted]);

  const [comment, setComment] = useState("");
  const [paymentType, setPaymentType] = useState("prepay");
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  // Промокод: введений код, результат перевірки
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    promoCodeId: number;
    discountAmount: number;
    message?: string;
  } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Form validation states
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    email?: string;
    city?: string;
    postOffice?: string;
    paymentType?: string;
  }>({});

  useEffect(() => {
    if (!mounted) return;
    const stored = loadCartPromo();
    if (stored) {
      setPromoCodeInput(stored.code);
      setAppliedPromo({
        promoCodeId: stored.promoCodeId,
        discountAmount: stored.discountAmount,
        message: stored.message,
      });
    }
  }, [mounted]);

  const validateName = () => {
    if (!firstName.trim()) return "Ім'я обов'язкове";
    if (!lastName.trim()) return "Прізвище обов'язкове";
    return "";
  };

  const validatePhone = (phone: string) => {
    if (!phone.trim()) {
      return "Телефон обов'язковий";
    }
    const phoneRegex = /^\+?\d{10,15}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      return "Введіть коректний номер телефону";
    }
    return "";
  };

  const validateEmail = (email: string) => {
    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return "Введіть коректний email";
      }
    }
    return "";
  };

  const validateCity = (city: string) => {
    if (!city.trim()) {
      return "Місто обов'язкове";
    }
    return "";
  };

  const validatePostOffice = (postOffice: string) => {
    if (!postOffice.trim()) {
      return "Відділення/адреса обов'язкові";
    }
    return "";
  };

  const validatePaymentType = (paymentType: string) => {
    if (!paymentType) {
      return "Оберіть спосіб оплати";
    }
    return "";
  };

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    setFieldErrors((prev) => ({ ...prev, firstName: value.trim() ? undefined : "Ім'я обов'язкове" }));
  };
  const handleLastNameChange = (value: string) => {
    setLastName(value);
    setFieldErrors((prev) => ({ ...prev, lastName: value.trim() ? undefined : "Прізвище обов'язкове" }));
  };

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);
    if (value) {
      const error = validatePhone(value);
      setFieldErrors((prev) => ({ ...prev, phone: error || undefined }));
    } else {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.phone;
        return newErrors;
      });
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (value) {
      const error = validateEmail(value);
      setFieldErrors((prev) => ({ ...prev, email: error || undefined }));
    } else {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.email;
        return newErrors;
      });
    }
  };

  const handleCityChangeWithValidation = (value: string) => {
    setCity(value);
    if (value) {
      const error = validateCity(value);
      setFieldErrors((prev) => ({ ...prev, city: error || undefined }));
    } else {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.city;
        return newErrors;
      });
    }
  };

  const handlePostOfficeChangeWithValidation = (value: string) => {
    setPostOffice(value);
    if (value) {
      const error = validatePostOffice(value);
      setFieldErrors((prev) => ({ ...prev, postOffice: error || undefined }));
    } else {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.postOffice;
        return newErrors;
      });
    }
  };

  const handlePaymentTypeChange = (value: string) => {
    setPaymentType(value);
    if (value) {
      const error = validatePaymentType(value);
      setFieldErrors((prev) => ({ ...prev, paymentType: error || undefined }));
    } else {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.paymentType;
        return newErrors;
      });
    }
  };

  const [submittedOrder, setSubmittedOrder] = useState<{
    items: typeof items;
    customer: {
      name: string;
      email?: string;
      phone: string;
      city: string;
      postOffice: string;
      comment?: string;
      paymentType: string;
    };
    orderId?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !phoneNumber ||
      !deliveryMethod ||
      !city ||
      !postOffice ||
      !paymentType
    ) {
      setError("Будь ласка, заповніть усі обов’язкові поля.");
      setLoading(false);
      return;
    }

    if (items.length === 0) {
      setError("Ваш кошик порожній.");
      setLoading(false);
      return;
    }

    if (!agreedToPolicy) {
      setError("Будь ласка, підтвердіть згоду з Політикою конфіденційності та Публічною офертою.");
      setLoading(false);
      return;
    }

    // Check stock availability before submitting order
    try {
      const stockCheckResponse = await fetch("/api/products/check-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            product_id: item.id,
            size: item.size,
            quantity: item.quantity,
          })),
        }),
      });

      if (!stockCheckResponse.ok) {
        setError(
          "Один або кілька товарів зараз недоступні. Оновіть кошик і спробуйте ще раз."
        );
        setLoading(false);
        return;
      }
    } catch (stockError) {
      console.error("[FinalCard] Stock check error:", stockError);
      setError("Помилка перевірки наявності товару. Спробуйте ще раз.");
      setLoading(false);
      return;
    }

    // Формуємо товари для API (з урахуванням знижки)
    const apiItems = items.map((item) => {
      // Перетворюємо ціну в число
      const itemPrice = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      const discount = item.discount_percentage 
        ? (typeof item.discount_percentage === 'string' ? parseFloat(item.discount_percentage) : item.discount_percentage)
        : 0;
      
      const discountedPrice = getBasketUnitPrice(
        itemPrice,
        discount || null,
        item.color_surcharge_uah
      );

      return {
        product_id: item.id,
        product_name: item.name,
        size: item.size,
        quantity: item.quantity,
        price: discountedPrice.toFixed(2), // передаємо кінцеву ціну
        original_price: itemPrice, // можна залишити для запису, якщо треба
        discount_percentage: discount || null,
        color: item.color || null,
      };
    });

    const subtotal = getSubtotal(items);
    const deliveryCost = deliveryMethod === "nova_poshta_branch" ? DELIVERY_COST_BRANCH : 0;
    const promoDiscount = appliedPromo?.discountAmount ?? 0;
    const fullAmount = Math.max(0, subtotal + deliveryCost - promoDiscount);

    const orderComment = comment.trim();

    try {
      const requestBody = {
        customer_name: customerName,
        phone_number: phoneNumber,
        email: email || null,
        delivery_method: deliveryMethod,
        city,
        post_office: postOffice,
        comment: orderComment,
        payment_type: paymentType,
        total_amount: fullAmount.toFixed(2),
        bonus_points_to_spend: 0,
        delivery_cost: deliveryCost,
        promo_code: appliedPromo ? promoCodeInput.trim().toUpperCase() : undefined,
        items: apiItems,
      };
      
      console.log("[FinalCard] Sending order request with:", JSON.stringify(requestBody, null, 2));
      
      // Надсилаємо дані замовлення
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("[FinalCard] Error response:", data);
        const stockish =
          typeof data.error === "string" &&
          (data.error.includes("недоступн") || data.error.includes("Недостатньо"));
        let errorMessage = stockish
          ? "Один або кілька товарів зараз недоступні. Оновіть кошик і спробуйте ще раз."
          : data.error || "Помилка при оформленні замовлення.";

        if (data.details && !stockish) {
          if (Array.isArray(data.details)) {
            errorMessage = `${errorMessage}\n${data.details.join("\n")}`;
          } else {
            errorMessage = `${errorMessage}\n${data.details}`;
          }
        }

        setError(errorMessage);
        setLoading(false);
        return;
      } else {
        const data = await response.json();
        
        const { orderId, invoiceUrl } = data;

        if (!orderId) {
          console.error("[FinalCard] No order ID received!");
          setError("Не вдалося створити замовлення.");
          return;
        }

        // Track Purchase for Meta Pixel (deduped on /success via localStorage)
        const totalValue = getSubtotal(items);
        const numItems = items.reduce((sum, item) => sum + item.quantity, 0);
        if (!wasMetaPurchaseTracked(orderId)) {
          trackMetaEvent("Purchase", {
            content_ids: items.map((item) => String(item.id)),
            content_type: "product",
            value: totalValue,
            currency: "UAH",
            num_items: numItems,
          });
          markMetaPurchaseTracked(orderId);
        }

        const requiresPayment =
          paymentType !== "test_payment" && paymentType !== "prepay";
        if (invoiceUrl) {
          // Зберігаємо orderId для сторінки success (після повернення з Mono без query)
          localStorage.setItem(
            "pendingPayment",
            JSON.stringify({ orderId, paymentType })
          );
          localStorage.setItem("pendingOrderItems", JSON.stringify(items));
          localStorage.setItem(
            "pendingOrderCustomer",
            JSON.stringify({
              name: customerName,
              email,
              phone: phoneNumber,
              city,
              postOffice,
              comment: orderComment,
              paymentType,
            })
          );
          setSuccess(
            paymentType === "test_payment" || paymentType === "prepay"
              ? "Замовлення оформлено. Переходимо на сторінку підтвердження..."
              : "Переходимо до оплати..."
          );
          setTimeout(() => {
            window.location.href = invoiceUrl;
          }, paymentType === "test_payment" || paymentType === "prepay" ? 800 : 1500);
        } else if (requiresPayment) {
          setError(
            data.message ||
            "Не вдалося створити платіж. Будь ласка, спробуйте ще раз або зв'яжіться з нами."
          );
          setLoading(false);
        } else {
          // Should not happen, but just in case
          setSuccess("Замовлення успішно оформлено! Ми зв'яжемося з вами найближчим часом.");
          clearBasket();
          clearCartPromo();
          setLoading(false);
        }
      }
    } catch (error) {
      console.error("[FinalCard] Network error:", error);
      setError("Помилка мережі. Спробуйте пізніше.");
      setLoading(false);
    }
    // Note: Don't set loading to false in finally block, as it would interfere with payment redirect
  };

  useEffect(() => {
    // Check if returning from payment gateway
    const urlParams = new URLSearchParams(window.location.search);
    const orderReference = urlParams.get("orderReference");
    const status = urlParams.get("status");
    
    // Check for pending payment
    const pendingPayment = localStorage.getItem("pendingPayment");
    
    if (pendingPayment && orderReference) {
      // User returned from payment gateway - check payment status
      const pendingData = JSON.parse(pendingPayment);
      
      if (status === "failed") {
        setError("Оплата не була завершена. Будь ласка, спробуйте ще раз або зв'яжіться з нами.");
        localStorage.removeItem("pendingPayment");
        localStorage.removeItem("pendingOrderItems");
        localStorage.removeItem("pendingOrderCustomer");
        return;
      }
      
      // Fetch order status from API
      fetch(`/api/orders/by-invoice/${pendingData.orderId}`)
        .then((res) => res.json())
        .then((orderData) => {
          if (orderData.payment_status === "paid") {
            // Payment successful - save order info and clear basket
            const storedItems = localStorage.getItem("pendingOrderItems");
            if (storedItems) {
              const items = JSON.parse(storedItems);
              const storedCustomer = localStorage.getItem("pendingOrderCustomer");
              const customer = storedCustomer ? JSON.parse(storedCustomer) : {};
              
              localStorage.setItem(
                "submittedOrder",
                JSON.stringify({
                  items,
                  customer,
                  orderId: pendingData.orderId,
                })
              );
              localStorage.removeItem("pendingPayment");
              localStorage.removeItem("pendingOrderItems");
              localStorage.removeItem("pendingOrderCustomer");
              setSubmittedOrder({
                items,
                customer,
                orderId: pendingData.orderId,
              });
              clearBasket();
              clearCartPromo();
            } else {
              setSuccess("Оплата успішно завершена! Замовлення обробляється.");
            }
          } else {
            // Payment not completed yet
            setError("Оплата ще не завершена. Будь ласка, завершіть оплату або зв'яжіться з нами.");
            localStorage.removeItem("pendingPayment");
            localStorage.removeItem("pendingOrderItems");
            localStorage.removeItem("pendingOrderCustomer");
          }
        })
        .catch((err) => {
          console.error("[FinalCard] Error checking payment status:", err);
          setError("Не вдалося перевірити статус оплати. Будь ласка, зв'яжіться з нами.");
        });
    } else {
      // Normal order display (from localStorage) - only show if payment was completed
      const storedOrder = localStorage.getItem("submittedOrder");
      if (storedOrder) {
        const order = JSON.parse(storedOrder);
        // Only show if it's not a pending payment
        if (!pendingPayment) {
          setSubmittedOrder(order);
        }
      }
    }
  }, [clearBasket]);

  type NpCityOption = { ref: string; name: string };
  type NpWarehouseOption = { ref: string; description: string };

  const [cities, setCities] = useState<NpCityOption[]>([]);
  const [postOffices, setPostOffices] = useState<NpWarehouseOption[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingPostOffices, setLoadingPostOffices] = useState(false);
  const [cityListVisible, setCityListVisible] = useState(false);
  const [postOfficeListVisible, setPostOfficeListVisible] = useState(false);
  const [npCityHint, setNpCityHint] = useState<string | null>(null);
  const [npWarehouseHint, setNpWarehouseHint] = useState<string | null>(null);

  const isNpBranch = deliveryMethod === "nova_poshta_branch";
  const isNpCourier = deliveryMethod === "nova_poshta_courier";
  const isShowroom = deliveryMethod === "showroom_pickup";
  const isNovaPoshta = deliveryMethod.startsWith("nova_poshta");

  // Міста — getCities (як у документації НП: FindByString, Limit)
  useEffect(() => {
    if (!isNovaPoshta || isShowroom) {
      setCities([]);
      setNpCityHint(null);
      return;
    }

    const q = city.trim();
    if (q.length < 2) {
      setCities([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingCities(true);
      setNpCityHint(null);
      fetch(`/api/nova-poshta/cities?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data: { cities?: NpCityOption[]; error?: string | null }) => {
          if (data.error) {
            setCities([]);
            setNpCityHint(data.error);
            return;
          }
          setCities(data.cities ?? []);
        })
        .catch(() => {
          setCities([]);
          setNpCityHint("Помилка при завантаженні міст");
        })
        .finally(() => setLoadingCities(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [city, isNovaPoshta, isShowroom]);

  const filteredCities = useMemo(() => {
    const q = city.toLowerCase().trim();
    const filtered = cities.filter((c) => c.name.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      const aL = a.name.toLowerCase();
      const bL = b.name.toLowerCase();
      if (aL === q) return -1;
      if (bL === q) return 1;
      const aS = aL.startsWith(q);
      const bS = bL.startsWith(q);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [city, cities]);

  // Відділення — getWarehouses при вибраному місті; FindByString у запиті для вузького пошуку (номер відділення)
  useEffect(() => {
    if (!isNpBranch || isShowroom || !city.trim()) {
      setPostOffices([]);
      setNpWarehouseHint(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoadingPostOffices(true);
      setNpWarehouseHint(null);

      const params = new URLSearchParams();
      if (cityRef) params.set("cityRef", cityRef);
      else params.set("cityName", city.trim());
      const po = postOffice.trim();
      if (po.length >= 1) params.set("q", po);

      fetch(`/api/nova-poshta/warehouses?${params.toString()}`)
        .then((res) => res.json())
        .then((data: { warehouses?: NpWarehouseOption[]; error?: string | null }) => {
          if (data.error) {
            setPostOffices([]);
            setNpWarehouseHint(data.error);
            return;
          }
          setPostOffices(data.warehouses ?? []);
        })
        .catch(() => {
          setPostOffices([]);
          setNpWarehouseHint("Помилка при завантаженні відділень");
        })
        .finally(() => setLoadingPostOffices(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [city, cityRef, postOffice, isNpBranch, isShowroom]);

  const filteredPostOffices = useMemo(() => {
    const q = postOffice.toLowerCase().trim();
    if (!q) return postOffices;
    const filtered = postOffices.filter((p) => p.description.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      const aL = a.description.toLowerCase();
      const bL = b.description.toLowerCase();
      if (aL === q) return -1;
      if (bL === q) return 1;
      const aS = aL.startsWith(q);
      const bS = bL.startsWith(q);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      return a.description.localeCompare(b.description, "uk");
    });
  }, [postOffice, postOffices]);

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleCityChangeWithValidation(e.target.value);
    setCityRef("");
    setPostOffice("");
    setPostOffices([]);
    setCityListVisible(true);
  };

  const handlePostOfficeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handlePostOfficeChangeWithValidation(e.target.value);
    setPostOfficeListVisible(true);
  };

  const handleCitySelect = (option: NpCityOption) => {
    handleCityChangeWithValidation(option.name);
    setCityRef(option.ref);
    setPostOffice("");
    setPostOffices([]);
    setCityListVisible(false);
    setPostOfficeListVisible(true);
  };

  const handlePostOfficeSelect = (warehouse: NpWarehouseOption) => {
    handlePostOfficeChangeWithValidation(warehouse.description);
    setPostOfficeListVisible(false);
  };

  // STATE
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ⬇️ Сторінка оформленого замовлення (як на скріні)
  if (items.length == 0 && submittedOrder) {
    return (
      <section className="min-h-screen bg-white py-8 px-4 sm:px-6 lg:px-12">
        <div className="max-w-2xl mx-auto">
          <nav className="mb-8" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm font-['Montserrat'] font-normal">
              <li>
                <Link href="/" className="text-[#3D1A00] hover:opacity-80 transition-opacity">
                  Головна
                </Link>
              </li>
              <li className="text-gray-400">|</li>
              <li className="text-gray-400">Оформлення замовлення</li>
            </ol>
          </nav>

          <div className="text-center py-12 sm:py-16">
            <h1 className="font-['Montserrat'] font-bold text-3xl sm:text-4xl lg:text-5xl text-[#3D1A00] uppercase tracking-tight mb-4">
              Дякуємо!
            </h1>
            <p className="font-['Montserrat'] font-bold text-2xl sm:text-3xl lg:text-4xl text-[#3D1A00] uppercase tracking-tight mb-10 sm:mb-12">
              Ваше замовлення оформлене!
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-['Montserrat'] font-semibold text-[#3D1A00] uppercase text-base tracking-tight bg-[#9B9B5A] hover:bg-[#8a8a4e] transition-colors"
            >
              Повернутися на головну
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const checkoutCard =
    "rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] sm:p-6";
  const checkoutInput = (err?: string) =>
    `w-full rounded-xl border bg-white px-4 py-3 font-['Montserrat'] text-sm text-black placeholder:text-black/35 transition-colors focus:border-[#8B5E3F]/45 focus:outline-none focus:ring-1 focus:ring-[#8B5E3F]/20 ${
      err ? "border-red-400" : "border-black/10"
    }`;
  const deliveryCostDisplay = deliveryMethod === "nova_poshta_branch" ? DELIVERY_COST_BRANCH : 0;
  const summarySubtotal = getSubtotal(items);
  const summaryPromo = appliedPromo?.discountAmount ?? 0;
  const summaryTotal = Math.max(0, summarySubtotal + deliveryCostDisplay - summaryPromo);

  return (
    <section className="min-h-screen bg-[#faf9f7] pb-16 pt-6 lg:pb-20">
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-12">
      {!mounted ? (
        <div className="flex min-h-[400px] w-full items-center justify-center py-12 sm:py-20">
          <div
            className="h-12 w-12 animate-spin rounded-full border-2 border-black/15 border-t-transparent"
            style={{ borderTopColor: ACCENT }}
          />
        </div>
      ) : items.length == 0 ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 py-12 sm:gap-14 sm:py-20">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-black/[0.04] sm:h-40 sm:w-40">
            <svg className="h-16 w-16 text-black/25 sm:h-20 sm:w-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h2 className="text-center font-['Montserrat'] text-2xl font-semibold leading-tight text-black sm:text-4xl md:text-5xl">
            Ваш кошик порожній
          </h2>
          <Link
            href="/catalog"
            className="inline-flex h-14 w-full max-w-sm items-center justify-center rounded-xl px-6 font-['Montserrat'] text-base font-semibold text-white transition-opacity hover:opacity-90 sm:h-16 sm:text-lg"
            style={{ backgroundColor: ACCENT }}
          >
            Продовжити покупки
          </Link>
        </div>
      ) : (
        <>
          <nav className="mb-4 font-['Montserrat'] text-sm text-black/45" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
              <li>
                <Link href="/" className="hover:text-[#8B5E3F]">
                  Головна
                </Link>
              </li>
              <li className="text-black/30" aria-hidden>
                &gt;
              </li>
              <li>
                <Link href="/cart" className="hover:text-[#8B5E3F]">
                  Кошик
                </Link>
              </li>
              <li className="text-black/30" aria-hidden>
                &gt;
              </li>
              <li className="text-black/70">Оформлення замовлення</li>
            </ol>
          </nav>

          <h1 className="mb-6 font-['Montserrat'] text-2xl font-semibold text-black sm:text-3xl lg:text-4xl">
            Оформлення замовлення
          </h1>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8 lg:gap-10">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-['Montserrat'] text-sm text-red-700">
                <p className="whitespace-pre-line">{error}</p>
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-['Montserrat'] text-sm text-green-700">
                {success}
              </div>
            )}

            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10 xl:gap-14">
              <div className="flex min-w-0 flex-1 flex-col gap-5 sm:gap-6">
                <CartLineItems onGlobalError={setError} />

                <div className={checkoutCard}>
                  <h2 className="mb-4 font-['Montserrat'] text-base font-semibold text-black">Інформація про покупця</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="firstName" className="text-sm font-['Montserrat'] text-black/70">
                        Ім&apos;я <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        value={firstName}
                        onChange={(e) => handleFirstNameChange(e.target.value)}
                        className={checkoutInput(fieldErrors.firstName)}
                        required
                        autoComplete="given-name"
                      />
                      {fieldErrors.firstName && <p className="text-xs text-red-500">{fieldErrors.firstName}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lastName" className="text-sm font-['Montserrat'] text-black/70">
                        Прізвище <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="lastName"
                        value={lastName}
                        onChange={(e) => handleLastNameChange(e.target.value)}
                        className={checkoutInput(fieldErrors.lastName)}
                        required
                        autoComplete="family-name"
                      />
                      {fieldErrors.lastName && <p className="text-xs text-red-500">{fieldErrors.lastName}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="phone" className="text-sm font-['Montserrat'] text-black/70">
                        Номер телефону <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        value={phoneNumber}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        onBlur={(e) => {
                          const err = validatePhone(e.target.value);
                          setFieldErrors((p) => ({ ...p, phone: err || undefined }));
                        }}
                        className={checkoutInput(fieldErrors.phone)}
                        placeholder="+380 50 123 4567"
                        required
                        autoComplete="tel"
                      />
                      {fieldErrors.phone && <p className="text-xs text-red-500">{fieldErrors.phone}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="email" className="text-sm font-['Montserrat'] text-black/70">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onBlur={(e) => {
                          const err = validateEmail(e.target.value);
                          setFieldErrors((p) => ({ ...p, email: err || undefined }));
                        }}
                        className={checkoutInput(fieldErrors.email)}
                        placeholder="example@email.com"
                        autoComplete="email"
                      />
                      {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
                    </div>
                  </div>
                </div>

                <div className={checkoutCard}>
                  <h2 className="mb-4 font-['Montserrat'] text-base font-semibold text-black">Доставка</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="city" className="text-sm font-['Montserrat'] text-black/70">
                        Місто {!isShowroom && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        id="city"
                        value={city}
                        onChange={handleCityChange}
                        onFocus={() => setCityListVisible(true)}
                        onBlur={(e) => {
                          const err = validateCity(e.target.value);
                          setFieldErrors((p) => ({ ...p, city: err || undefined }));
                          setTimeout(() => setCityListVisible(false), 150);
                        }}
                        readOnly={isShowroom}
                        className={`${checkoutInput(fieldErrors.city)} ${isShowroom ? "cursor-not-allowed bg-black/[0.03]" : ""}`}
                        placeholder="Почніть вводити місто"
                        required={!isShowroom}
                        autoComplete="off"
                      />
                      {fieldErrors.city && <p className="text-xs text-red-500">{fieldErrors.city}</p>}
                      {npCityHint && isNovaPoshta && !isShowroom && (
                        <p className="text-xs text-amber-700">{npCityHint}</p>
                      )}
                      {loadingCities && isNovaPoshta && !isShowroom && (
                        <p className="text-xs text-black/45">Завантаження міст…</p>
                      )}
                      {cityListVisible &&
                        filteredCities.length > 0 &&
                        !isShowroom &&
                        isNovaPoshta && (
                          <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                            {filteredCities.map((c) => (
                              <li
                                key={c.ref}
                                className="cursor-pointer px-4 py-2.5 font-['Montserrat'] text-sm text-black hover:bg-black/[0.03]"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleCitySelect(c)}
                              >
                                {c.name}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="deliveryMethod" className="text-sm font-['Montserrat'] text-black/70">
                        Спосіб доставки <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="deliveryMethod"
                        value={deliveryMethod}
                        onChange={(e) => setDeliveryMethod(e.target.value)}
                        className={checkoutInput()}
                      >
                        <option value="nova_poshta_branch">Доставка у відділення Нова Пошта</option>
                        <option value="nova_poshta_courier">Доставка кур&apos;єром Нова Пошта</option>
                        <option value="showroom_pickup">Самовивіз</option>
                      </select>
                    </div>
                  </div>

                  {!isShowroom && (
                    <div className="mt-4 flex flex-col gap-1.5">
                      <label htmlFor="postOffice" className="text-sm font-['Montserrat'] text-black/70">
                        {isNpCourier ? "Адреса доставки" : "Відділення / поштомат"}{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="postOffice"
                        value={postOffice}
                        onChange={handlePostOfficeChange}
                        onFocus={() => {
                          if (isNpBranch && city.trim()) setPostOfficeListVisible(true);
                        }}
                        onBlur={(e) => {
                          const err = validatePostOffice(e.target.value);
                          setFieldErrors((p) => ({ ...p, postOffice: err || undefined }));
                          setTimeout(() => setPostOfficeListVisible(false), 150);
                        }}
                        className={checkoutInput(fieldErrors.postOffice)}
                        placeholder={
                          isNpCourier
                            ? "Вул., будинок, квартира"
                            : city.trim()
                              ? "Номер або адреса відділення (напр. 342)"
                              : "Спочатку оберіть місто"
                        }
                        required
                        disabled={isNpBranch && !city.trim()}
                        autoComplete="off"
                      />
                      {fieldErrors.postOffice && <p className="text-xs text-red-500">{fieldErrors.postOffice}</p>}
                      {npWarehouseHint && isNpBranch && !isShowroom && (
                        <p className="text-xs text-amber-700">{npWarehouseHint}</p>
                      )}
                      {isNpBranch && !city.trim() && (
                        <p className="text-xs text-black/45">Спочатку вкажіть і оберіть місто зі списку</p>
                      )}
                      {loadingPostOffices && isNpBranch && city.trim() && (
                        <p className="text-xs text-black/45">Завантаження відділень…</p>
                      )}
                      {postOfficeListVisible &&
                        filteredPostOffices.length > 0 &&
                        isNpBranch &&
                        city.trim() && (
                          <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                            {filteredPostOffices.map((w) => (
                              <li
                                key={w.ref}
                                className="cursor-pointer px-4 py-2.5 font-['Montserrat'] text-sm text-black hover:bg-black/[0.03]"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handlePostOfficeSelect(w)}
                              >
                                {w.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      {postOfficeListVisible &&
                        !loadingPostOffices &&
                        filteredPostOffices.length === 0 &&
                        isNpBranch &&
                        city.trim() &&
                        postOffice.trim().length >= 1 && (
                          <p className="text-xs text-black/45">Відділень не знайдено. Спробуйте інший номер.</p>
                        )}
                    </div>
                  )}

                  {isShowroom && (
                    <div className="mt-4 flex flex-col gap-1.5">
                      <label htmlFor="pickupAddress" className="text-sm font-['Montserrat'] text-black/70">
                        Адреса самовивозу
                      </label>
                      <input
                        type="text"
                        id="pickupAddress"
                        readOnly
                        value={postOffice}
                        className={`${checkoutInput()} cursor-not-allowed bg-black/[0.03]`}
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-1.5">
                    <label htmlFor="orderComment" className="text-sm font-['Montserrat'] text-black/70">
                      Коментар до замовлення (необов&apos;язково)
                    </label>
                    <textarea
                      id="orderComment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className={`${checkoutInput()} min-h-[88px] resize-y`}
                      placeholder="Додаткові побажання…"
                    />
                  </div>
                </div>

                <div className={checkoutCard}>
                  <h2 className="mb-4 font-['Montserrat'] text-base font-semibold text-black">Спосіб оплати</h2>
                  <div
                    className={`grid grid-cols-1 gap-3 ${ENABLE_ONLINE_CARD_PAYMENT ? "sm:grid-cols-2 sm:gap-4" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange("prepay")}
                      className={`rounded-xl px-4 py-3.5 font-['Montserrat'] text-sm font-semibold transition-colors sm:min-h-[52px] ${
                        paymentType === "prepay"
                          ? "text-white shadow-sm"
                          : "border border-black/10 bg-white text-black hover:border-black/20"
                      }`}
                      style={paymentType === "prepay" ? { backgroundColor: ACCENT } : undefined}
                    >
                      Накладений платіж
                    </button>
                    {ENABLE_ONLINE_CARD_PAYMENT && (
                      <button
                        type="button"
                        onClick={() => handlePaymentTypeChange("full")}
                        className={`rounded-xl px-4 py-3.5 font-['Montserrat'] text-sm font-semibold transition-colors sm:min-h-[52px] ${
                          paymentType === "full"
                            ? "text-white shadow-sm"
                            : "border border-black/10 bg-white text-black hover:border-black/20"
                        }`}
                        style={paymentType === "full" ? { backgroundColor: ACCENT } : undefined}
                      >
                        Онлайн-оплата
                      </button>
                    )}
                  </div>
                  {fieldErrors.paymentType && <p className="mt-2 text-xs text-red-500">{fieldErrors.paymentType}</p>}
                </div>
              </div>

            <aside className="w-full lg:w-[min(100%,380px)] lg:shrink-0 lg:sticky lg:top-[calc(var(--site-header-offset)+1rem)]">
              <div className={checkoutCard}>
                <h2 className="font-['Montserrat'] text-lg font-semibold text-black">Сума замовлення</h2>

                <div className="mt-6 space-y-2 font-['Montserrat'] text-sm text-black">
                  <div className="flex justify-between gap-3">
                    <span className="text-black/60">Проміжний підсумок</span>
                    <span className="font-medium">{Math.round(summarySubtotal).toLocaleString("uk-UA")} грн</span>
                  </div>
                  {summaryPromo > 0 && (
                    <div className="flex justify-between gap-3 text-red-600">
                      <span>Знижка (промокод)</span>
                      <span className="font-medium">−{Math.round(summaryPromo).toLocaleString("uk-UA")} грн</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-black/60">Вартість доставки</span>
                    <span className="font-medium text-right">
                      {deliveryMethod === "nova_poshta_branch"
                        ? "За тарифами перевізника"
                        : "0 грн"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-black/8 pt-3 text-base font-bold text-black">
                    <span>Сума</span>
                    <span>{Math.round(summaryTotal).toLocaleString("uk-UA")} грн</span>
                  </div>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block font-['Montserrat'] text-xs font-medium text-black/60">Промокод</label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                          <path d="M7 7h.01" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={promoCodeInput}
                        onChange={(e) => {
                          setPromoCodeInput(e.target.value);
                          setPromoError(null);
                          if (appliedPromo) {
                            setAppliedPromo(null);
                            clearCartPromo();
                          }
                        }}
                        className={`${checkoutInput()} pl-10 uppercase`}
                        placeholder="Додати промокод"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={promoValidating || !promoCodeInput.trim()}
                      onClick={async () => {
                        const code = promoCodeInput.trim().toUpperCase();
                        if (!code) return;
                        setPromoError(null);
                        setPromoValidating(true);
                        try {
                          const subtotal = getSubtotal(items);
                          const deliveryCostVal = deliveryMethod === "nova_poshta_branch" ? DELIVERY_COST_BRANCH : 0;
                          const res = await fetch("/api/promo/validate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              code,
                              subtotal,
                              deliveryCost: deliveryCostVal,
                            }),
                          });
                          const data = await res.json();
                          if (data.valid && data.promoCodeId != null && data.discountAmount != null) {
                            setAppliedPromo({
                              promoCodeId: data.promoCodeId,
                              discountAmount: data.discountAmount,
                              message: data.message,
                            });
                            saveCartPromo({
                              code: code,
                              promoCodeId: data.promoCodeId,
                              discountAmount: data.discountAmount,
                              message: data.message,
                            });
                          } else {
                            setAppliedPromo(null);
                            clearCartPromo();
                            setPromoError(data.message || "Промокод не дійсний");
                          }
                        } catch {
                          setPromoError("Помилка перевірки промокоду");
                          setAppliedPromo(null);
                          clearCartPromo();
                        } finally {
                          setPromoValidating(false);
                        }
                      }}
                      className="inline-flex shrink-0 items-center justify-center rounded-xl px-5 py-3 font-['Montserrat'] text-sm font-semibold text-white transition-opacity disabled:opacity-45 sm:px-6"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {promoValidating ? "Перевірка…" : "Застосувати"}
                    </button>
                  </div>
                  {promoError && <p className="mt-2 text-xs text-red-600">{promoError}</p>}
                  {appliedPromo && (
                    <p className="mt-2 text-xs text-emerald-700">
                      {appliedPromo.message} (−{appliedPromo.discountAmount.toLocaleString("uk-UA")} грн)
                    </p>
                  )}
                </div>

                <div className="mt-6 border-t border-black/8 pt-5">
                  <p className="mb-3 font-['Montserrat'] text-xs font-semibold uppercase tracking-wide text-black/55">
                    Обов&apos;язково
                  </p>
                  <label className="flex cursor-pointer items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        agreedToPolicy ? "border-transparent text-white" : "border-black/25 hover:border-black/40"
                      }`}
                      style={agreedToPolicy ? { backgroundColor: ACCENT } : undefined}
                      onClick={() => setAgreedToPolicy(!agreedToPolicy)}
                    >
                      {agreedToPolicy && (
                        <svg viewBox="0 0 12 10" fill="none" className="h-3 w-3" aria-hidden>
                          <path d="M1 5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="font-['Montserrat'] text-sm leading-relaxed text-black/70"
                      onClick={() => setAgreedToPolicy(!agreedToPolicy)}
                    >
                      Я приймаю умови{" "}
                      <Link href="/terms-of-service" className="underline decoration-black/30 underline-offset-2 hover:text-black">
                        Публічної оферти
                      </Link>{" "}
                      та надаю згоду на обробку персональних даних згідно з{" "}
                      <Link href="/privacy-policy" className="underline decoration-black/30 underline-offset-2 hover:text-black">
                        Політикою конфіденційності
                      </Link>
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !agreedToPolicy}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 font-['Montserrat'] text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ backgroundColor: ACCENT }}
                >
                  {loading ? (
                    "Обробка…"
                  ) : paymentType === "full" ? (
                    <>
                      Оплатити <span aria-hidden>→</span>
                    </>
                  ) : (
                    <>
                      Оформити замовлення <span aria-hidden>→</span>
                    </>
                  )}
                </button>
              </div>
            </aside>
          </div>

          </form>
        </>
      )}
      </div>
    </section>
  );
}
