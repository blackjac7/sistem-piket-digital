export function PageLoading() {
  return (
    <section className="page-loading" role="status" aria-live="polite" aria-label="Memuat konten halaman">
      <header className="loading-header">
        <span className="loading-block loading-title" />
        <span className="loading-block loading-copy" />
      </header>
      <div className="loading-stat-grid">
        {Array.from({ length: 4 }, (_, index) => <span className="loading-block loading-stat" key={index} />)}
      </div>
      <div className="loading-panel-grid">
        <span className="loading-block loading-panel loading-panel-wide" />
        <span className="loading-block loading-panel" />
      </div>
      <span className="sr-only">Memuat data terbaru...</span>
    </section>
  );
}
