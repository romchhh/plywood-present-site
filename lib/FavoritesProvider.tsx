"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  FAVORITES_STORAGE_KEY,
  parseFavoritesFromStorage,
  type FavoriteProductSnapshot,
} from "@/lib/favoritesStorage";
import { trackMetaEvent } from "@/lib/metaPixel";

type FavoritesContextType = {
  items: FavoriteProductSnapshot[];
  isFavorite: (productId: number) => boolean;
  toggleFavorite: (product: FavoriteProductSnapshot) => void;
  removeFavorite: (productId: number) => void;
  count: number;
};

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FavoriteProductSnapshot[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      setItems(parseFavoritesFromStorage(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const isFavorite = useCallback(
    (productId: number) => items.some((p) => p.id === productId),
    [items]
  );

  const toggleFavorite = useCallback((product: FavoriteProductSnapshot) => {
    let added = false;
    setItems((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) return prev.filter((p) => p.id !== product.id);
      added = true;
      return [product, ...prev.filter((p) => p.id !== product.id)];
    });
    if (added) {
      trackMetaEvent("AddToWishlist", {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: "product",
        value: product.price,
        currency: "UAH",
      });
    }
  }, []);

  const removeFavorite = useCallback((productId: number) => {
    setItems((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  const count = items.length;

  const value = useMemo(
    () => ({
      items,
      isFavorite,
      toggleFavorite,
      removeFavorite,
      count,
    }),
    [items, isFavorite, toggleFavorite, removeFavorite, count]
  );

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return ctx;
}
