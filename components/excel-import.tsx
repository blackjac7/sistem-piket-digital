"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { ActionForm } from "./action-form";

export function ExcelImport({ title, description, templateHref, action }: { title: string; description: string; templateHref: string; action: (state: ActionState, formData: FormData) => Promise<ActionState> }) {
  return <details className="import-disclosure"><summary><span className="import-summary-icon"><FileSpreadsheet /></span><span><strong>{title}</strong><small>{description}</small></span><span className="summary-action">Buka</span></summary><div className="import-content"><div className="import-steps"><span>1. Unduh template</span><span>2. Isi dan simpan</span><span>3. Unggah file</span></div><a href={templateHref} className="button button-secondary"><FileSpreadsheet /> Unduh template Excel</a><ActionForm action={action} submitLabel="Import data Excel"><label className="file-drop"><Upload /><span><strong>Pilih file .xlsx</strong><small>Maksimal 5 MB</small></span><input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label></ActionForm></div></details>;
}
