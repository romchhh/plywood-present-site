"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaPageView } from "@/lib/metaPixel";

/**
 * Sends Meta Pixel PageView on client-side route changes
 * (initial PageView is fired from the base pixel snippet).
 */
export default function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    trackMetaPageView();
  }, [pathname, searchParams]);

  return null;
}
