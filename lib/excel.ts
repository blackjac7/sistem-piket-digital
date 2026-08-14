import ExcelJS from "exceljs";
import { siteConfig } from "@/lib/site-config";

const headerFill = "123A5A";
const accentFill = "E9B824";

function styleSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: `FF${accentFill}` } } };
  });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + widths.length)}1` };
}

function addInstructions(workbook: ExcelJS.Workbook, title: string, notes: string[]) {
  const sheet = workbook.addWorksheet("Petunjuk");
  sheet.getColumn(1).width = 105;
  sheet.getCell("A1").value = `${title} — ${siteConfig.schoolName}`;
  sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: `FF${headerFill}` } };
  sheet.getCell("A3").value = "Cara menggunakan";
  sheet.getCell("A3").font = { bold: true, size: 12 };
  notes.forEach((note, index) => { sheet.getCell(`A${index + 4}`).value = `${index + 1}. ${note}`; });
  sheet.getCell(`A${notes.length + 6}`).value = "Jangan mengubah nama sheet atau judul kolom. Baris contoh boleh dihapus.";
  sheet.getCell(`A${notes.length + 6}`).font = { italic: true, color: { argb: "FF9A5B13" } };
}

export async function createStudentTemplate(classNames: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();
  addInstructions(workbook, "Template Import Data Siswa", ["Buka sheet Data Siswa.", "Isi satu siswa per baris.", "NIS harus unik dan tidak boleh kosong.", "Kolom Kelas harus memakai pilihan yang tersedia.", "Simpan tetap dalam format .xlsx lalu unggah melalui menu Data siswa."]);
  const sheet = workbook.addWorksheet("Data Siswa");
  sheet.addRow(["NIS", "Nama Lengkap", "Kelas", "Jenis Kelamin", "Nama Orang Tua/Wali", "Nomor Telepon Wali"]);
  sheet.addRow(["2026001", "Contoh Siswa", classNames[0] || "7A", "L", "Contoh Wali", "081234567890"]);
  styleSheet(sheet, [18, 32, 12, 18, 30, 22]);
  for (let row = 2; row <= 1000; row++) {
    sheet.getCell(`C${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`"${classNames.join(",")}"`], showErrorMessage: true, errorTitle: "Kelas tidak valid", error: "Pilih kelas dari daftar." };
    sheet.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"L,P"'], showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Gunakan L atau P." };
  }
  return workbook.xlsx.writeBuffer();
}

export async function createTeacherTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();
  addInstructions(workbook, "Template Import Data Guru", ["Buka sheet Data Guru.", "Isi satu guru per baris.", "NIP/NUPTK harus unik dan tidak boleh kosong.", "Isi Guru Piket dengan YA atau TIDAK.", "Guru piket otomatis mendapat akun jika belum memilikinya."]);
  const sheet = workbook.addWorksheet("Data Guru");
  sheet.addRow(["NIP/NUPTK", "Nama Lengkap", "Mata Pelajaran", "Nomor Telepon", "Guru Piket", "Username (Opsional)"]);
  sheet.addRow(["19990001", "Contoh Guru", "Matematika", "081234567890", "TIDAK", ""]);
  styleSheet(sheet, [20, 32, 26, 22, 16, 24]);
  for (let row = 2; row <= 500; row++) sheet.getCell(`E${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"YA,TIDAK"'], showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Gunakan YA atau TIDAK." };
  return workbook.xlsx.writeBuffer();
}

export async function createPromotionTemplate(rows: Array<{
  id: number;
  studentNumber: string | null;
  name: string;
  currentClass: string;
  currentGrade: number;
  suggestedClass: string;
}>, targetClassesByGrade: Map<number, string[]>, academicYear: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();
  addInstructions(workbook, "Template Penempatan Rombel Baru", [
    `Template ini dibuat dari data aktif tahun ajaran ${academicYear}.`,
    "Buka sheet Penempatan Kelas.",
    "Jangan menambah, menghapus, atau menggandakan siswa.",
    "Ubah hanya kolom Kelas Baru sesuai pembagian rombel terbaru.",
    "Kelas tujuan wajib satu tingkat di atas kelas saat ini.",
    "Simpan tetap dalam format .xlsx lalu unggah dari menu Kenaikan kelas.",
  ]);
  const sheet = workbook.addWorksheet("Penempatan Kelas");
  sheet.addRow(["ID Sistem", "NIS", "Nama Lengkap", "Kelas Saat Ini", "Kelas Baru"]);
  for (const row of rows) {
    sheet.addRow([row.id, row.studentNumber || "", row.name, row.currentClass, row.suggestedClass]);
    const rowNumber = sheet.rowCount;
    const targets = targetClassesByGrade.get(row.currentGrade + 1) || [];
    sheet.getCell(`E${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${targets.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Kelas tujuan tidak valid",
      error: `Pilih kelas tingkat ${row.currentGrade + 1} dari daftar.`,
    };
  }
  styleSheet(sheet, [14, 18, 34, 18, 18]);
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(2).numFmt = "@";
  await sheet.protect("", { selectLockedCells: true, selectUnlockedCells: true });
  for (let row = 2; row <= sheet.rowCount; row++) {
    for (let column = 1; column <= 4; column++) sheet.getCell(row, column).protection = { locked: true };
    sheet.getCell(row, 5).protection = { locked: false };
  }
  return workbook.xlsx.writeBuffer();
}

export async function createStudentExport(rows: Array<{ studentNumber: string | null; name: string; className: string | null; gender: "L" | "P" | null; parentName: string | null; parentPhone: string | null; status: string }>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  const sheet = workbook.addWorksheet("Backup Siswa");
  sheet.addRow(["NIS", "Nama Lengkap", "Kelas", "Jenis Kelamin", "Nama Orang Tua/Wali", "Nomor Telepon Wali", "Status"]);
  rows.forEach((row) => sheet.addRow([row.studentNumber, row.name, row.className, row.gender, row.parentName, row.parentPhone, row.status]));
  styleSheet(sheet, [18, 32, 12, 18, 30, 22, 14]);
  return workbook.xlsx.writeBuffer();
}

export async function createMonitoringReport(data: {
  start: string;
  end: string;
  summary: { scheduled: number; completed: number; overdue: number; completionRate: number; totalActivity: number };
  occurrences: Array<{ date: string; weekday: string; teacherName: string; shift: string; startTime: string; endTime: string; status: string; completedAt: Date | null; attendanceCount: number }>;
  teacherSummary: Array<{ teacherName: string; shift: string; scheduled: number; completed: number; attendanceCount: number }>;
}, attendance: Array<{ date: string; type: string; name: string; className: string | null; status: string; notes: string | null; recorder: string }>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Ringkasan");
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 24;
  summary.addRow([`Laporan Pemantauan Guru Piket - ${siteConfig.schoolName}`]);
  summary.addRow(["Periode", `${data.start} sampai ${data.end}`]);
  summary.addRow([]);
  summary.addRow(["Indikator", "Nilai"]);
  summary.addRows([
    ["Jadwal piket", data.summary.scheduled],
    ["Piket selesai", data.summary.completed],
    ["Belum diselesaikan", data.summary.overdue],
    ["Keterlaksanaan", `${data.summary.completionRate}%`],
    ["Catatan absensi dibuat", data.summary.totalActivity],
  ]);
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: `FF${headerFill}` } };
  summary.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }; });

  const duties = workbook.addWorksheet("Keterlaksanaan Piket");
  duties.addRow(["Tanggal", "Hari", "Guru Piket", "Shift", "Jam", "Status", "Waktu Selesai", "Jumlah Catatan"]);
  data.occurrences.forEach((item) => duties.addRow([item.date, item.weekday, item.teacherName, item.shift, `${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)}`, item.status, item.completedAt || "", item.attendanceCount]));
  styleSheet(duties, [16, 14, 30, 12, 16, 16, 22, 18]);

  const teachersSheet = workbook.addWorksheet("Ringkasan Per Guru");
  teachersSheet.addRow(["Guru Piket", "Shift", "Jadwal", "Selesai", "Keterlaksanaan", "Jumlah Catatan"]);
  data.teacherSummary.forEach((item) => teachersSheet.addRow([item.teacherName, item.shift, item.scheduled, item.completed, item.scheduled ? `${Math.round(item.completed / item.scheduled * 100)}%` : "0%", item.attendanceCount]));
  styleSheet(teachersSheet, [30, 12, 14, 14, 20, 18]);

  const attendanceSheet = workbook.addWorksheet("Data Absensi");
  attendanceSheet.addRow(["Tanggal", "Jenis", "Nama", "Kelas/Unit", "Status", "Keterangan", "Pencatat"]);
  attendance.forEach((item) => attendanceSheet.addRow([item.date, item.type, item.name, item.className || "Guru", item.status, item.notes || "", item.recorder]));
  styleSheet(attendanceSheet, [16, 14, 30, 14, 14, 36, 28]);
  return workbook.xlsx.writeBuffer();
}

export async function loadWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Gunakan file Excel berformat .xlsx.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran file maksimal 5 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook;
}
