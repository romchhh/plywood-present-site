"use client";

import { useState } from "react";
import { trackMetaEvent } from "@/lib/metaPixel";

export default function NewsletterSubscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Вкажіть email");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Помилка підписки");
        return;
      }

      setStatus("success");
      setMessage("Дякуємо! Ви підписані на розсилку.");
      setEmail("");
      trackMetaEvent("Lead", { content_name: "newsletter" });
    } catch {
      setStatus("error");
      setMessage("Помилка підписки. Спробуйте пізніше.");
    }
  };

  return (
    <section className="relative w-full" aria-labelledby="newsletter-heading">
      {/* Тільки біле тло зверху й по боках картки — без «світло-коричневого» body; низ прозорий → футер не перекривається білим */}
      <div className="w-full bg-white px-4 pt-2 sm:px-6 sm:pt-4 lg:px-12 lg:pt-6">
        <div className="mx-auto max-w-[1920px]">
          <div className="relative z-10 rounded-2xl bg-[#8B5E3F] px-5 py-8 shadow-lg sm:px-8 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:rounded-3xl lg:px-12 lg:py-12 -mb-16 sm:-mb-20 lg:-mb-24">
            <h2
              id="newsletter-heading"
              className="font-['Montserrat'] text-xl font-bold uppercase leading-tight tracking-tight text-white sm:text-2xl lg:max-w-[min(42%,520px)] lg:text-[clamp(1.5rem,2.2vw,2.25rem)]"
            >
              Будьте в курсі наших останніх пропозицій
            </h2>

            <form
              onSubmit={handleSubmit}
              className="mt-6 flex w-full max-w-md flex-col gap-3 lg:mt-0 lg:max-w-[min(48%,420px)] lg:shrink-0"
            >
              <label className="relative block">
                <span className="sr-only">Email</span>
                <span
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#3D1A00]/45"
                  aria-hidden
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status !== "idle") setStatus("idle");
                  }}
                  placeholder="Напишіть свій email"
                  autoComplete="email"
                  disabled={status === "loading"}
                  className="w-full rounded-full border-0 bg-white py-3.5 pl-11 pr-4 font-['Montserrat'] text-sm text-[#3D1A00] placeholder:text-[#3D1A00]/45 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-70"
                />
              </label>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-full bg-white py-3.5 font-['Montserrat'] text-sm font-medium text-[#3D1A00] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === "loading" ? "Надсилання…" : "Підписатися на розсилку"}
              </button>
              {message && (
                <p
                  className={`text-center text-sm font-['Montserrat'] lg:text-left ${
                    status === "success" ? "text-white/90" : "text-red-200"
                  }`}
                  role="status"
                >
                  {message}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
