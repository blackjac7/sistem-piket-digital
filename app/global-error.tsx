"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="id"><body><main style={{ minHeight: "100dvh", padding: 24, display: "grid", placeItems: "center", fontFamily: "Arial, sans-serif", background: "#f4f6f9", color: "#172033" }}><section style={{ width: "min(100%, 440px)", padding: 28, border: "1px solid #dce2ea", borderRadius: 8, textAlign: "center", background: "white" }}><h1 style={{ margin: "0 0 10px", fontSize: 24 }}>Aplikasi perlu dimuat ulang</h1><p style={{ margin: "0 0 20px", color: "#687386", lineHeight: 1.6 }}>Terjadi gangguan saat menyiapkan aplikasi. Data yang sudah tersimpan tidak terhapus.</p><button type="button" onClick={reset} style={{ minHeight: 46, padding: "10px 18px", border: 0, borderRadius: 8, color: "white", background: "#176b87", fontWeight: 700 }}>Muat ulang aplikasi</button></section></main></body></html>;
}
