"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page render failed", { digest: error.digest });
  }, [error]);

  return <main className="error-page" role="main">
    <section className="error-surface">
      <span className="error-icon" aria-hidden="true"><AlertTriangle /></span>
      <h1>Halaman belum dapat dimuat</h1>
      <p>Koneksi atau layanan sedang mengalami gangguan. Data yang sudah tersimpan tetap aman.</p>
      {error.digest && <small>Referensi: {error.digest}</small>}
      <button className="button button-primary" type="button" onClick={reset}><RefreshCw aria-hidden="true" /> Coba lagi</button>
    </section>
  </main>;
}
