"use client";

import Link from "next/link";
import { useState } from "react";
import { siteContact } from "@/lib/siteContact";
import { trackMetaEvent } from "@/lib/metaPixel";

export default function ContactsPage() {
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!agreed || !form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Помилка відправки");
        return;
      }
      setSubmitted(true);
      trackMetaEvent("Contact");
    } catch {
      setError("Помилка відправки. Спробуйте пізніше.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="max-w-[1920px] mx-auto px-3 lg:px-8 pt-4 pb-20">

        {/* Хлібні крихти */}
        <nav className="mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm font-['Montserrat'] text-[#3D1A00]/60">
            <li>
              <Link href="/" className="hover:text-[#3D1A00] transition-colors">
                Головна
              </Link>
            </li>
            <li aria-hidden className="text-[#3D1A00]/30">|</li>
            <li className="text-[#3D1A00]">Контакти</li>
          </ol>
        </nav>

        {/* Великий заголовок по центру */}
        <h1
          className="text-center text-[#3D1A00] uppercase mb-16"
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 700,
            fontSize: "clamp(48px, 9vw, 120px)",
            lineHeight: "115%",
            letterSpacing: "-0.02em",
          }}
        >
          Контакти
        </h1>

        {/* Основний блок: форма зліва + інфо справа */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">

          {/* ── Ліва: форма ── */}
          <div
            id="contact-form"
            className="w-full lg:w-[55%] rounded-2xl p-8 lg:p-12 bg-white border border-[#3D1A00]/10 scroll-mt-24"
          >
            <h2
              className="text-[#3D1A00] uppercase mb-8"
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 600,
                fontSize: "clamp(18px, 2vw, 26px)",
                letterSpacing: "0.04em",
              }}
            >
              Зв&apos;язатися з Plywood Present
            </h2>

            {submitted ? (
              <div className="py-12 text-center">
                <p
                  className="text-[#3D1A00]"
                  style={{ fontFamily: "Montserrat, sans-serif", fontSize: "18px", fontWeight: 500 }}
                >
                  Дякуємо! Ми отримали ваше повідомлення і зв&apos;яжемося найближчим часом.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Ім'я */}
                <div>
                  <label
                    className="block text-[#3D1A00]/60 mb-1"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "11px", letterSpacing: "0.08em" }}
                  >
                    ІМ&apos;Я *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-transparent border-b border-[#3D1A00]/30 pb-2 text-[#3D1A00] outline-none focus:border-[#3D1A00] transition-colors placeholder-transparent"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "15px" }}
                    placeholder="Ваше ім'я"
                  />
                </div>

                {/* Email */}
                <div>
                  <label
                    className="block text-[#3D1A00]/60 mb-1"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "11px", letterSpacing: "0.08em" }}
                  >
                    EMAIL *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-transparent border-b border-[#3D1A00]/30 pb-2 text-[#3D1A00] outline-none focus:border-[#3D1A00] transition-colors placeholder-transparent"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "15px" }}
                    placeholder="email@example.com"
                  />
                </div>

                {/* Запит */}
                <div>
                  <label
                    className="block text-[#3D1A00]/60 mb-1"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "11px", letterSpacing: "0.08em" }}
                  >
                    ВАШ ЗАПИТ *
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    rows={3}
                    className="w-full bg-transparent border-b border-[#3D1A00]/30 pb-2 text-[#3D1A00] outline-none focus:border-[#3D1A00] transition-colors resize-none"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "15px" }}
                    placeholder="Що ви хочете дізнатися/замовити?"
                  />
                  <p
                    className="text-[#3D1A00]/40 mt-1"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "12px" }}
                  >
                    Що ви хочете дізнатися/замовити?
                  </p>
                </div>

                {/* Згода */}
                <label className="flex items-start gap-3 cursor-pointer group mt-2">
                  <span
                    className={`mt-0.5 w-5 h-5 flex-shrink-0 border rounded-sm transition-colors flex items-center justify-center ${
                      agreed
                        ? "bg-[#3D1A00] border-[#3D1A00]"
                        : "border-[#3D1A00]/40 group-hover:border-[#3D1A00]"
                    }`}
                    onClick={() => setAgreed(!agreed)}
                  >
                    {agreed && (
                      <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                        <path d="M1 5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="text-[#3D1A00]/70 leading-relaxed"
                    style={{ fontFamily: "Montserrat, sans-serif", fontSize: "13px" }}
                    onClick={() => setAgreed(!agreed)}
                  >
                    Продовжуючи, я приймаю умови{" "}
                    <Link href="/terms-of-service" className="underline hover:text-[#3D1A00] transition-colors">
                      Публічної оферти
                    </Link>{" "}
                    та надаю згоду на обробку своїх персональних даних відповідно до{" "}
                    <Link href="/privacy-policy" className="underline hover:text-[#3D1A00] transition-colors">
                      Політики конфіденційності
                    </Link>
                  </span>
                </label>

                {error && (
                  <p className="text-red-600 text-sm font-['Montserrat']">{error}</p>
                )}
                {/* Кнопка */}
                <div className="pt-2 w-full">
                  <button
                    onClick={handleSubmit}
                    disabled={!agreed || !form.name.trim() || !form.email.trim() || !form.message.trim() || sending}
                    className="w-full px-10 py-4 bg-[#3D1A00] text-white uppercase transition-all hover:bg-[#3D1A00]/85 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 600,
                      fontSize: "13px",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {sending ? "Відправка…" : "Відправити"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Права: контактна інформація ── */}
          <div
            className="w-full lg:w-[45%] rounded-2xl p-8 lg:p-12 grid grid-cols-2 gap-x-8 gap-y-12 content-start bg-white border border-[#3D1A00]/10"
          >
            {/* Телефон */}
            <div className="col-span-2 sm:col-span-1">
              <p
                className="text-[#3D1A00]/50 uppercase mb-3"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.2vw, 16px)",
                  letterSpacing: "0.06em",
                }}
              >
                Телефон
              </p>
              <div className="space-y-2">
                {siteContact.phones.map((phone) => (
                  <a
                    key={phone.tel}
                    href={`tel:${phone.tel}`}
                    className="block text-[#3D1A00] hover:opacity-70 transition-opacity"
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 400,
                      fontSize: "clamp(13px, 1.1vw, 15px)",
                      lineHeight: "159%",
                    }}
                  >
                    {phone.display}
                  </a>
                ))}
              </div>
            </div>

            {/* Месенджери */}
            <div className="col-span-2 sm:col-span-1">
              <p
                className="text-[#3D1A00]/50 uppercase mb-3"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.2vw, 16px)",
                  letterSpacing: "0.06em",
                }}
              >
                Месенджери
              </p>
              <p
                className="text-[#3D1A00] mb-2"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 1.1vw, 15px)",
                  lineHeight: "159%",
                }}
              >
                <a href={`tel:${siteContact.messengerPhone.tel}`} className="hover:opacity-70">
                  {siteContact.messengerPhone.display}
                </a>
                <span className="text-[#3D1A00]/70"> ({siteContact.messengerLabel})</span>
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={siteContact.viberUrl}
                  className="text-[#3D1A00] underline hover:opacity-70 text-sm font-['Montserrat']"
                >
                  Viber
                </a>
                <a
                  href={siteContact.telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#3D1A00] underline hover:opacity-70 text-sm font-['Montserrat']"
                >
                  Telegram
                </a>
              </div>
            </div>

            {/* E-mail */}
            <div>
              <p
                className="text-[#3D1A00]/50 uppercase mb-3"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.2vw, 16px)",
                  letterSpacing: "0.06em",
                }}
              >
                E-mail
              </p>
              <a
                href={`mailto:${siteContact.email}`}
                className="text-[#3D1A00] hover:opacity-70 transition-opacity"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 1.1vw, 15px)",
                  lineHeight: "159%",
                }}
              >
                {siteContact.email}
              </a>
            </div>

            {/* Графік роботи */}
            <div>
              <p
                className="text-[#3D1A00]/50 uppercase mb-3"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.2vw, 16px)",
                  letterSpacing: "0.06em",
                }}
              >
                Графік роботи
              </p>
              <div
                className="text-[#3D1A00] space-y-1"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(13px, 1.1vw, 15px)",
                  lineHeight: "159%",
                }}
              >
                {siteContact.scheduleLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
