"use client";

import { Download, RefreshCw, Share2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_DISMISS_KEY = "piket-yakin-install-dismissed-at";
const INSTALL_DISMISS_DURATION = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
}

function isMobileDevice() {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 820;
}

function hasRecentInstallDismissal() {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
  if (!Number.isFinite(dismissedAt) || Date.now() - dismissedAt >= INSTALL_DISMISS_DURATION) {
    localStorage.removeItem(INSTALL_DISMISS_KEY);
    return false;
  }
  return true;
}

export function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    const updateInstallContext = () => {
      setStandalone(isStandalone());
      setIos(isIos());
      setMobile(isMobileDevice());
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onControllerChange = () => {
      if (!refreshing.current) return;
      window.location.reload();
    };
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update());
    };

    updateConnection();
    updateInstallContext();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("resize", updateInstallContext);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    document.addEventListener("visibilitychange", checkForUpdate);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    if ("serviceWorker" in navigator && (window.isSecureContext || window.location.hostname === "localhost")) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
        const notifyWhenReady = () => {
          if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        };
        notifyWhenReady();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed") notifyWhenReady();
          });
        });
      }).catch(() => {
        // The website remains usable when a browser or network blocks service workers.
      });
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("resize", updateInstallContext);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!mobile || standalone || (!installEvent && !ios) || hasRecentInstallDismissal()) return;
    const timer = window.setTimeout(() => setShowInstall(true), 1200);
    return () => window.clearTimeout(timer);
  }, [installEvent, ios, mobile, standalone]);

  function dismissInstall() {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    setShowInstall(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    setShowInstall(false);
    if (choice.outcome !== "accepted") dismissInstall();
  }

  function applyUpdate() {
    void navigator.serviceWorker?.getRegistration().then((registration) => {
      if (!registration?.waiting) return;
      refreshing.current = true;
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    });
  }

  return <div className="pwa-notice-stack" aria-live="polite">
    {!online && <section className="pwa-notice pwa-notice-offline" role="status"><WifiOff aria-hidden="true" /><div><strong>Koneksi terputus</strong><span>Perubahan baru belum dapat dikirim ke server.</span></div></section>}
    {updateReady && <section className="pwa-notice"><RefreshCw aria-hidden="true" /><div><strong>Versi baru siap</strong><span>Muat ulang saat tidak sedang mengisi formulir.</span></div><button className="pwa-notice-action" type="button" onClick={applyUpdate}>Muat ulang</button></section>}
    {showInstall && <section className="pwa-notice pwa-install-notice"><Download aria-hidden="true" /><div><strong>Pasang Piket YAKIN</strong>{ios ? <span>Ketuk <Share2 aria-label="Bagikan" /> lalu pilih Tambah ke Layar Utama.</span> : <span>Akses lebih cepat dari layar utama perangkat.</span>}</div>{ios ? <button className="pwa-notice-action" type="button" onClick={dismissInstall}>Mengerti</button> : <button className="pwa-notice-action" type="button" onClick={install}>Pasang</button>}<button className="pwa-notice-close" type="button" onClick={dismissInstall} aria-label="Tutup saran instalasi" title="Tutup"><X aria-hidden="true" /></button></section>}
  </div>;
}
