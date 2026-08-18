"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DISPLAY_MS = 1_350;
const EXIT_MS = 360;

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function LaunchSplash() {
  const [phase, setPhase] = useState<"hidden" | "enter" | "preview" | "exit">("hidden");

  useEffect(() => {
    const preview = process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).has("launch-preview");
    if (!isInstalledApp() && !preview) return;
    if (preview) {
      const previewFrame = window.requestAnimationFrame(() => setPhase("preview"));
      return () => window.cancelAnimationFrame(previewFrame);
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const enterFrame = window.requestAnimationFrame(() => setPhase("enter"));
    const exitTimer = window.setTimeout(() => setPhase("exit"), reducedMotion ? 180 : DISPLAY_MS);
    const hideTimer = window.setTimeout(() => setPhase("hidden"), reducedMotion ? 320 : DISPLAY_MS + EXIT_MS);
    return () => {
      window.cancelAnimationFrame(enterFrame);
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return <div className={`launch-splash ${phase}`} aria-hidden="true">
    <div className="launch-grid" />
    <div className="launch-frame frame-outer"><i /><i /><i /><i /></div>
    <div className="launch-frame frame-inner"><i /><i /><i /><i /></div>
    <div className="launch-scan" />
    <div className="launch-core">
      <span className="launch-system-line"><b /> SISTEM SEKOLAH DIGITAL <b /></span>
      <div className="launch-mark">
        <span className="launch-mark-ring" />
        <span className="launch-mark-panel"><Image src="/img/logo.png" width={88} height={88} priority alt="" /></span>
      </div>
      <div className="launch-title">
        <strong>PIKET YAKIN</strong>
        <span>SMP IP YAKIN</span>
      </div>
      <div className="launch-progress"><span /></div>
      <div className="launch-status"><span>SECURE ACCESS</span><span>ACADEMIC OPERATIONS</span><span>READY</span></div>
    </div>
  </div>;
}
