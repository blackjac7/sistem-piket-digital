"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_WAIT_MS = 15_000;

export function NavigationLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("Memuat halaman");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    setActive(false);
    document.documentElement.removeAttribute("data-app-loading");
  }, []);

  const start = useCallback((nextLabel = "Memuat halaman", duration = MAX_WAIT_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLabel(nextLabel);
    setActive(true);
    document.documentElement.setAttribute("data-app-loading", "true");
    timerRef.current = setTimeout(stop, duration);
  }, [stop]);

  useEffect(() => {
    const frame = requestAnimationFrame(stop);
    return () => cancelAnimationFrame(frame);
  }, [routeKey, stop]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;

      const download = target.dataset.loadingMode === "download" || url.pathname.startsWith("/api/");
      start(target.dataset.loadingLabel || (download ? "Menyiapkan unduhan" : "Memuat halaman"), download ? 2_500 : MAX_WAIT_MS);
    }

    function handleStart(event: Event) {
      const detail = (event as CustomEvent<{ label?: string; duration?: number }>).detail;
      start(detail?.label, detail?.duration);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("app-loading-start", handleStart);
    window.addEventListener("app-loading-stop", stop);
    window.addEventListener("pageshow", stop);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("app-loading-start", handleStart);
      window.removeEventListener("app-loading-stop", stop);
      window.removeEventListener("pageshow", stop);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [start, stop]);

  return (
    <div className={`navigation-loading${active ? " active" : ""}`} aria-hidden={!active}>
      <div className="navigation-progress"><span /></div>
      <div className="navigation-status" role="status" aria-live="polite">
        <LoaderCircle aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
