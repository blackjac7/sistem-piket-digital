"use client";

import { useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, Shuffle, UsersRound } from "lucide-react";
import { promoteAcademicYearAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";

type SchoolClass = { id: number; name: string; grade: number; total: number };

export function PromotionForm({ classes, defaultTargetYear }: { classes: SchoolClass[]; defaultTargetYear: string }) {
  const [mode, setMode] = useState<"ROMBEL_TETAP" | "ROMBEL_BARU">("ROMBEL_TETAP");
  const [fileName, setFileName] = useState("");
  const graduatingTotal = classes.filter((item) => item.grade === 9).reduce((total, item) => total + item.total, 0);

  return <ActionForm action={promoteAcademicYearAction} submitLabel="Proses kenaikan kelas" resetOnSuccess={false}>
    <fieldset className="promotion-mode-picker">
      <legend>1. Pilih metode penempatan siswa</legend>
      <label className={mode === "ROMBEL_TETAP" ? "active" : ""}>
        <input type="radio" name="mode" value="ROMBEL_TETAP" checked={mode === "ROMBEL_TETAP"} onChange={() => setMode("ROMBEL_TETAP")} />
        <span className="mode-icon"><UsersRound /></span>
        <span><strong>Rombel tetap</strong><small>Siswa tetap bersama teman sekelasnya dan naik ke rombel tujuan yang dipilih.</small><em>Paling sederhana</em></span>
      </label>
      <label className={mode === "ROMBEL_BARU" ? "active" : ""}>
        <input type="radio" name="mode" value="ROMBEL_BARU" checked={mode === "ROMBEL_BARU"} onChange={() => setMode("ROMBEL_BARU")} />
        <span className="mode-icon"><Shuffle /></span>
        <span><strong>Susun ulang rombel</strong><small>Gunakan Excel ketika siswa akan dibagi ulang atau diacak ke rombel baru.</small><em>Perlu file Excel</em></span>
      </label>
    </fieldset>

    <label className="field"><span>2. Tahun ajaran baru</span><input name="targetYear" defaultValue={defaultTargetYear} pattern="\d{4}/\d{4}" required /><small className="helper-text">Format: 2027/2028</small></label>

    {mode === "ROMBEL_TETAP" ? <section className="promotion-mode-content" aria-labelledby="fixed-mode-title">
      <div className="section-label"><strong id="fixed-mode-title">3. Tentukan rombel tujuan</strong><small>Satu pilihan berlaku untuk seluruh siswa di kelas asal.</small></div>
      <div className="promotion-map">{classes.filter((item) => item.grade < 9).map((source) => {
        const targets = classes.filter((item) => item.grade === source.grade + 1);
        const suggested = targets.find((item) => item.name.slice(1) === source.name.slice(1)) || targets[0];
        return <label key={source.id}><span><strong>{source.name}</strong><small>{source.total} siswa</small></span><ArrowRight aria-hidden="true" /><select name={`target_${source.id}`} defaultValue={suggested?.id} aria-label={`Kelas tujuan untuk ${source.name}`}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>;
      })}</div>
    </section> : <section className="promotion-mode-content excel-placement" aria-labelledby="excel-mode-title">
      <div className="section-label"><strong id="excel-mode-title">3. Isi penempatan rombel melalui Excel</strong><small>Template dibuat langsung dari daftar siswa aktif saat ini.</small></div>
      <div className="excel-placement-steps">
        <a className="placement-step" href="/api/templates/promotions"><span>1</span><Download /><strong>Unduh template terbaru</strong><small>Berisi NIS, nama, kelas lama, dan saran kelas baru.</small></a>
        <div className="placement-step"><span>2</span><FileSpreadsheet /><strong>Ubah kolom Kelas Baru</strong><small>Jangan menghapus, menambah, atau menggandakan siswa.</small></div>
      </div>
      <label className="file-drop"><FileSpreadsheet /><span><strong>Unggah file penempatan yang sudah diisi</strong><small>{fileName || "Belum ada file dipilih - format .xlsx, maksimal 5 MB"}</small></span><input className="file-input-hidden" name="placementFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} /></label>
      <p className="inline-note">Sistem akan menolak file jika ada siswa hilang, ganda, tidak dikenal, atau ditempatkan ke tingkat yang salah.</p>
    </section>}

    <div className="graduation-summary"><strong>Kelas 9</strong><span>{graduatingTotal} siswa akan ditandai lulus pada kedua metode</span></div>
    <label className="checkbox-field warning-check"><input name="confirmed" type="checkbox" /><span><strong>Saya sudah memeriksa penempatan dan mengunduh backup</strong><small>Seluruh perubahan diproses sekaligus; jika validasi gagal, tidak ada data yang dipindahkan.</small></span></label>
  </ActionForm>;
}
