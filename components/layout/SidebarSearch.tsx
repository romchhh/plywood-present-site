"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getProductImageSrc } from "@/lib/getFirstProductImage";
import { scrollPageToTopReliable } from "@/lib/scrollPageToTop";
import { useProducts } from "@/lib/useProducts";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { trackMetaEvent } from "@/lib/metaPixel";

interface SearchSidebarProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface Product {
  id: number;
  name: string;
  slug?: string | null;
  price: number;
  first_media?: { type: string; url: string } | null;
}

interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

const ACCENT = "#8B5E3F";
const MAX_SEARCH_HISTORY = 10;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 5;

function getSearchHistory(): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const history = localStorage.getItem("searchHistory");
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
}

function saveToSearchHistory(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const history = getSearchHistory();
    const filtered = history.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
    const newHistory = [
      { query: query.trim(), timestamp: Date.now() },
      ...filtered,
    ].slice(0, MAX_SEARCH_HISTORY);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
  } catch (error) {
    console.error("Error saving search history:", error);
  }
}

function getPopularSearches(searchHistory: Array<{ query: string; timestamp: number }>): string[] {
  const frequency: Record<string, number> = {};
  searchHistory.forEach((item) => {
    const q = item.query.toLowerCase();
    frequency[q] = (frequency[q] || 0) + 1;
  });
  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([query]) => query);
}

function clearSearchHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("searchHistory");
  } catch (error) {
    console.error("Error clearing search history:", error);
  }
}

function SearchSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-['Montserrat'] text-xs font-semibold uppercase tracking-wide text-black/40">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function QueryChip({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 font-['Montserrat'] text-sm transition-colors ${
        variant === "accent"
          ? "border-[#8B5E3F]/25 bg-[#8B5E3F]/8 text-[#3D1A00] hover:border-[#8B5E3F]/40 hover:bg-[#8B5E3F]/12"
          : "border-black/[0.08] bg-white text-black/75 hover:border-[#8B5E3F]/30 hover:text-[#8B5E3F]"
      }`}
    >
      {label}
    </button>
  );
}

function ProductResultRow({
  product,
  query,
  onSelect,
  highlightText,
}: {
  product: Product;
  query: string;
  onSelect: () => void;
  highlightText: (text: string, searchQuery: string) => React.ReactNode;
}) {
  const href = `/product/${product.slug ?? product.id}`;

  return (
    <li>
      <Link
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onSelect();
        }}
        className="group flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)]"
      >
        <div className="relative h-[72px] w-[56px] shrink-0 overflow-hidden rounded-xl bg-[#f5f5f4]">
          <Image
            src={getProductImageSrc(product.first_media, "https://placehold.co/112x144")}
            alt={product.name}
            width={56}
            height={72}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-['Montserrat'] text-sm font-medium leading-snug text-black group-hover:text-[#8B5E3F]">
            {highlightText(product.name, query)}
          </p>
          <p className="mt-1 font-['Montserrat'] text-sm font-semibold text-black">
            {product.price.toLocaleString("uk-UA")} ₴
          </p>
        </div>
        <svg
          className="h-5 w-5 shrink-0 text-black/25 transition-colors group-hover:text-[#8B5E3F]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}

export default function SearchSidebar({
  isOpen,
  setIsOpen,
}: SearchSidebarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const { products: allProducts, loading } = useProducts();
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(isOpen);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchHistory(getSearchHistory());
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !query) {
      async function fetchPopularProducts() {
        try {
          setLoadingPopular(true);
          const response = await fetch("/api/products/top-sale");
          if (response.ok) {
            const data = await response.json();
            setPopularProducts(data.slice(0, 8));
          }
        } catch (error) {
          console.error("Error fetching popular products:", error);
        } finally {
          setLoadingPopular(false);
        }
      }
      fetchPopularProducts();
    }
  }, [isOpen, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const autocompleteSuggestions = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return [];
    const lowerQuery = debouncedQuery.toLowerCase();
    const suggestions = new Set<string>();
    const exactMatches: string[] = [];
    const partialMatches: string[] = [];

    allProducts.forEach((product) => {
      const name = product.name.toLowerCase();
      if (name.startsWith(lowerQuery)) exactMatches.push(product.name);
      else if (name.includes(lowerQuery)) partialMatches.push(product.name);
    });

    exactMatches.forEach((m) => suggestions.add(m));
    partialMatches.forEach((m) => suggestions.add(m));
    searchHistory.forEach((item) => {
      if (item.query.toLowerCase().startsWith(lowerQuery)) suggestions.add(item.query);
    });

    return Array.from(suggestions).slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS);
  }, [debouncedQuery, allProducts, searchHistory]);

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    const exactMatches: Product[] = [];
    const partialMatches: Product[] = [];

    allProducts.forEach((product) => {
      const name = product.name.toLowerCase();
      if (name.startsWith(lowerQuery)) exactMatches.push(product);
      else if (name.includes(lowerQuery)) partialMatches.push(product);
    });

    return [...exactMatches, ...partialMatches];
  }, [allProducts, query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(value.length >= 2);
  };

  const handleSearch = (searchQuery: string) => {
    if (searchQuery.trim()) {
      saveToSearchHistory(searchQuery);
      setSearchHistory(getSearchHistory());
      setQuery(searchQuery);
      setShowSuggestions(false);
      trackMetaEvent("Search", {
        search_string: searchQuery.trim(),
      });
    }
  };

  const findProductByName = useCallback(
    (name: string): Product | undefined => {
      const lower = name.trim().toLowerCase();
      if (!lower) return undefined;
      return allProducts.find((p) => p.name.toLowerCase() === lower);
    },
    [allProducts]
  );

  const goToProduct = useCallback(
    (product: Product) => {
      if (product.name.trim()) {
        saveToSearchHistory(product.name);
        setSearchHistory(getSearchHistory());
        setQuery(product.name);
      }
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      setIsOpen(false);
      scrollPageToTopReliable();
      router.push(`/product/${product.slug ?? product.id}`, { scroll: true });
    },
    [router, setIsOpen]
  );

  const handleSuggestionClick = (suggestion: string) => {
    const product = findProductByName(suggestion);
    if (product) {
      goToProduct(product);
      return;
    }
    handleSearch(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (selectedSuggestionIndex >= 0 && autocompleteSuggestions[selectedSuggestionIndex]) {
        handleSuggestionClick(autocompleteSuggestions[selectedSuggestionIndex]);
      } else if (query.trim()) {
        handleSearch(query);
        setShowSuggestions(false);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowSuggestions(true);
      setSelectedSuggestionIndex((prev) =>
        prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
    }
  };

  const handleClearInput = () => {
    setQuery("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    const parts = text.split(new RegExp(`(${searchQuery})`, "gi"));
    return parts.map((part, index) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark
          key={index}
          className="rounded bg-[#8B5E3F]/15 px-0.5 font-medium text-[#3D1A00]"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const popularSearches = useMemo(() => getPopularSearches(searchHistory), [searchHistory]);

  function handleClearHistory() {
    clearSearchHistory();
    setSearchHistory([]);
  }

  const skeletonRows = (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl bg-white p-3">
          <div className="h-[72px] w-[56px] rounded-xl bg-black/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-black/[0.06]" />
            <div className="h-3 w-1/4 rounded bg-black/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );

  const searchField = (
    <div className="relative mb-5 lg:mb-6">
      <div className="relative flex items-center rounded-full border border-black/10 bg-white transition-shadow focus-within:ring-2 focus-within:ring-[#8B5E3F]/25 lg:border-0 lg:bg-[#F5F0E8] lg:ring-1 lg:ring-[#E8E0D5] lg:focus-within:bg-white">
              <Image
                src="/images/icons/search.svg"
                alt=""
                width={18}
                height={18}
                className="pointer-events-none absolute left-4 h-[18px] w-[18px] opacity-50"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                placeholder="Назва товару або розмір…"
                className="w-full rounded-full bg-transparent py-3.5 pl-11 pr-11 text-base text-[#3D1A00] placeholder:text-black/40 focus:outline-none"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={handleClearInput}
                  className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-[#8B5E3F]/10 hover:text-[#8B5E3F]"
                  aria-label="Очистити поле"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </div>

            {showSuggestions && autocompleteSuggestions.length > 0 ? (
              <div
                ref={suggestionsRef}
                className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-black/[0.06] bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,0.08)]"
              >
                {autocompleteSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      index === selectedSuggestionIndex
                        ? "bg-[#8B5E3F]/10 text-[#3D1A00]"
                        : "text-black/80 hover:bg-[#faf9f7]"
                    }`}
                  >
                    <Image
                      src="/images/icons/search.svg"
                      alt=""
                      width={14}
                      height={14}
                      className="h-3.5 w-3.5 shrink-0 opacity-40"
                    />
                    <span>{highlightText(suggestion, query)}</span>
                  </button>
                ))}
              </div>
            ) : null}
    </div>
  );

  const searchResults = (
    <>
      {loading ? skeletonRows : null}

          {!loading && query && filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-black/[0.06] bg-white px-6 py-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: `${ACCENT}14` }}
              >
                <svg className="h-7 w-7 text-[#8B5E3F]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-black">Нічого не знайдено</p>
              <p className="mt-2 max-w-xs text-sm text-black/50">
                Спробуйте інші слова або перегляньте хіти продажів нижче
              </p>
              <Link
                href="/catalog"
                onClick={() => setIsOpen(false)}
                className="mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Весь каталог
              </Link>
            </div>
          ) : null}

          {!loading && query && filteredProducts.length > 0 ? (
            <div>
              <p className="mb-3 text-sm text-black/45">
                Знайдено{" "}
                <span className="font-semibold text-[#3D1A00]">{filteredProducts.length}</span>{" "}
                {filteredProducts.length === 1 ? "товар" : "товарів"}
              </p>
              <ul className="flex flex-col gap-3">
                {filteredProducts.map((product) => (
                  <ProductResultRow
                    key={product.id}
                    product={product}
                    query={query}
                    onSelect={() => goToProduct(product)}
                    highlightText={highlightText}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {!loading && !query ? (
            <div className="space-y-8">
              {searchHistory.length > 0 ? (
                <SearchSection
                  title="Недавні пошуки"
                  action={
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="hidden text-xs font-medium text-[#8B5E3F] transition-opacity hover:opacity-80 lg:inline"
                    >
                      Очистити
                    </button>
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.slice(0, 5).map((item, index) => (
                      <QueryChip
                        key={index}
                        label={item.query}
                        onClick={() => handleSearch(item.query)}
                      />
                    ))}
                  </div>
                </SearchSection>
              ) : null}

              {popularSearches.length > 0 ? (
                <SearchSection title="Популярні запити">
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map((search, index) => (
                      <QueryChip
                        key={index}
                        label={search}
                        variant="accent"
                        onClick={() => handleSearch(search)}
                      />
                    ))}
                  </div>
                </SearchSection>
              ) : null}

              <SearchSection title="Люди часто цікавляться">
                {loadingPopular ? (
                  skeletonRows
                ) : popularProducts.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {popularProducts.map((product) => (
                      <ProductResultRow
                        key={product.id}
                        product={product}
                        query=""
                        onSelect={() => goToProduct(product)}
                        highlightText={(text) => text}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-4 py-8 text-center text-sm text-black/45">
                    Почніть вводити назву товару у поле вище
                  </p>
                )}
              </SearchSection>
            </div>
          ) : null}
    </>
  );

  return (
    <div className="relative z-[var(--z-site-overlay)] font-['Montserrat']">
      {isOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-site-overlay-backdrop)] bg-black/40 lg:bg-black/35"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Мобільний — нижня панель як фільтри каталогу */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[var(--z-site-overlay)] flex max-h-[92vh] flex-col rounded-t-3xl bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.12)] transition-transform duration-300 lg:hidden ${
          isOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal={isOpen}
        aria-label="Пошук товарів"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <span className="text-base font-semibold text-[#1a1a1a]">Пошук</span>
          <div className="flex items-center gap-3">
            {searchHistory.length > 0 ? (
              <button
                type="button"
                onClick={handleClearHistory}
                className="text-xs text-black/50 underline hover:text-black"
              >
                Скинути
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-2xl leading-none text-black/60 hover:bg-black/5"
              aria-label="Закрити пошук"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {searchField}
          {searchResults}
        </div>
      </div>

      {/* Десктоп — права панель на всю висоту екрана */}
      <div
        className={`fixed inset-y-0 right-0 z-[var(--z-site-overlay)] hidden h-screen w-full max-w-md flex-col border-l border-[#E8E0D5] bg-[#faf9f7] shadow-[-8px_0_32px_rgba(61,26,0,0.08)] transition-transform duration-300 lg:flex ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal={isOpen}
        aria-label="Пошук товарів"
        aria-hidden={!isOpen}
      >
        <div className="shrink-0 border-b border-[#E8E0D5] bg-white px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/images/logos/logo_brown.svg"
                alt=""
                width={40}
                height={36}
                className="h-9 w-auto shrink-0"
              />
              <div>
                <p className="text-lg font-semibold text-[#3D1A00]">Пошук</p>
                <p className="text-xs text-black/45">Знайдіть подарунок або декор</p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#3D1A00]/70 transition-colors hover:bg-[#F5F0E8] hover:text-[#3D1A00]"
              onClick={() => setIsOpen(false)}
              aria-label="Закрити пошук"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {searchField}
          {searchResults}
        </div>
      </div>
    </div>
  );
}
