import ExcelJS from "exceljs";
import { siteConfig } from "@/lib/site-config";
import type { MonitoringData } from "@/lib/monitoring";

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

export async function createAttendanceReport(rows: Array<{ type: "SISWA" | "GURU"; name: string; className: string | null; status: string; date: string; notes: string | null; confirmed: boolean; recorder: string }>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();
  const labels: Record<string, string> = { SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa", DINAS: "Dinas" };
  const summary = workbook.addWorksheet("Ringkasan");
  summary.getColumn(1).width = 28; summary.getColumn(2).width = 18; summary.getColumn(3).width = 18;
  summary.addRow([`Rekap Absensi - ${siteConfig.schoolName}`]);
  summary.addRow(["Dibuat", new Date()]); summary.addRow([]); summary.addRow(["Indikator", "Jumlah", "Persentase"]);
  const total = rows.length;
  const values: Array<[string, number, number]> = [
    ["Total catatan", total, 1],
    ["Absensi siswa", rows.filter((row) => row.type === "SISWA").length, total ? rows.filter((row) => row.type === "SISWA").length / total : 0],
    ["Absensi guru", rows.filter((row) => row.type === "GURU").length, total ? rows.filter((row) => row.type === "GURU").length / total : 0],
    ["Sudah dikonfirmasi", rows.filter((row) => row.confirmed).length, total ? rows.filter((row) => row.confirmed).length / total : 0],
    ["Menunggu konfirmasi", rows.filter((row) => !row.confirmed).length, total ? rows.filter((row) => !row.confirmed).length / total : 0],
    ...(["SAKIT", "IZIN", "ALPA", "DINAS"] as const).map((status) => { const value = rows.filter((row) => row.status === status).length; return [labels[status], value, total ? value / total : 0] as [string, number, number]; }),
  ];
  values.forEach((row) => summary.addRow(row));
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: `FF${headerFill}` } };
  summary.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }; });
  summary.getColumn(3).numFmt = "0%"; summary.views = [{ state: "frozen", ySplit: 4 }];

  const studentRows = rows.filter((row) => row.type === "SISWA");
  const teacherRows = rows.filter((row) => row.type === "GURU");
  const addGroupedSummary = (sheetName: string, source: typeof rows, groupLabel: string, groupBy: (row: typeof rows[number]) => string) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow([groupLabel, "Sakit", "Izin", "Alpa", "Dinas", "Menunggu", "Total"]);
    const groups = new Map<string, Record<string, number>>();
    source.forEach((row) => { const key = groupBy(row); const item = groups.get(key) || { SAKIT: 0, IZIN: 0, ALPA: 0, DINAS: 0, PENDING: 0, TOTAL: 0 }; item[row.status] += 1; if (!row.confirmed) item.PENDING += 1; item.TOTAL += 1; groups.set(key, item); });
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "id")).forEach(([key, item]) => sheet.addRow([key, item.SAKIT, item.IZIN, item.ALPA, item.DINAS, item.PENDING, item.TOTAL]));
    styleSheet(sheet, [24, 14, 14, 14, 14, 16, 14]);
  };
  addGroupedSummary("Rekap Siswa", studentRows, "Kelas", (row) => row.className || "Tanpa kelas");
  addGroupedSummary("Rekap Guru", teacherRows, "Guru", (row) => row.name);
  const addDetailSheet = (sheetName: string, source: typeof rows, typeLabel: string) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(["Tanggal", "Nama", "Kelas/Unit", "Status", "Konfirmasi", "Keterangan", "Pencatat"]);
    source.forEach((row) => sheet.addRow([row.date, row.name, row.className || typeLabel, labels[row.status] || row.status, row.confirmed ? "Sudah" : "Belum", row.notes || "", row.recorder]));
    styleSheet(sheet, [16, 32, 18, 16, 20, 40, 28]);
    sheet.eachRow((row, rowNumber) => { if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF9" } }; }); });
  };
  addDetailSheet("Detail Siswa", studentRows, "Siswa");
  addDetailSheet("Detail Guru", teacherRows, "Guru");
  return workbook.xlsx.writeBuffer();
}

export async function createMonitoringReport(data: MonitoringData) {
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
    ["Sedang berjalan", data.summary.inProgress],
    ["Keterlaksanaan", `${data.summary.completionRate}%`],
    ["Catatan absensi dibuat", data.summary.totalActivity],
    ["Absensi siswa", data.attendanceSummary.students],
    ["Absensi guru", data.attendanceSummary.teachers],
    ["Sudah dikonfirmasi", data.attendanceSummary.confirmed],
    ["Menunggu konfirmasi", data.attendanceSummary.pending],
  ]);
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: `FF${headerFill}` } };
  summary.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }; });

  const trend = workbook.addWorksheet("Tren Harian");
  trend.addRow(["Tanggal", "Jadwal", "Selesai", "Keterlaksanaan", "Absensi Siswa", "Siswa Sakit", "Siswa Izin", "Siswa Alpa", "Siswa Dinas", "Absensi Guru", "Guru Sakit", "Guru Izin", "Guru Alpa", "Guru Dinas"]);
  data.trend.forEach((item) => {
    const rate = item.scheduled ? item.completed / item.scheduled : 0;
    trend.addRow([item.date, item.scheduled, item.completed, rate, item.studentAttendanceCount, item.studentAttendanceStatuses.SAKIT, item.studentAttendanceStatuses.IZIN, item.studentAttendanceStatuses.ALPA, item.studentAttendanceStatuses.DINAS, item.teacherAttendanceCount, item.teacherAttendanceStatuses.SAKIT, item.teacherAttendanceStatuses.IZIN, item.teacherAttendanceStatuses.ALPA, item.teacherAttendanceStatuses.DINAS]);
  });
  styleSheet(trend, [16, 12, 12, 18, 16, 16, 16, 16, 16, 16, 14, 14, 14, 14]);
  trend.getColumn(4).numFmt = "0%";

  const status = workbook.addWorksheet("Status Siswa");
  status.addRow(["Status Siswa", "Jumlah", "Persentase"]);
  const statusLabels = { SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa", DINAS: "Dinas" } as const;
  for (const value of Object.keys(statusLabels) as Array<keyof typeof statusLabels>) {
    status.addRow([statusLabels[value], data.attendanceSummary.studentStatusCounts[value], data.attendanceSummary.students ? data.attendanceSummary.studentStatusCounts[value] / data.attendanceSummary.students : 0]);
  }
  status.addRow(["Total siswa", data.attendanceSummary.students, 1]);
  styleSheet(status, [22, 14, 18]);
  status.getColumn(3).numFmt = "0%";

  const teacherStatus = workbook.addWorksheet("Status Guru");
  teacherStatus.addRow(["Status Guru", "Jumlah", "Persentase"]);
  for (const value of Object.keys(statusLabels) as Array<keyof typeof statusLabels>) {
    teacherStatus.addRow([statusLabels[value], data.attendanceSummary.teacherStatusCounts[value], data.attendanceSummary.teachers ? data.attendanceSummary.teacherStatusCounts[value] / data.attendanceSummary.teachers : 0]);
  }
  teacherStatus.addRow(["Total guru", data.attendanceSummary.teachers, 1]);
  styleSheet(teacherStatus, [22, 14, 18]);
  teacherStatus.getColumn(3).numFmt = "0%";

  const classes = workbook.addWorksheet("Per Kelas");
  classes.addRow(["Kelas", "Total", "Sakit", "Izin", "Alpa", "Dinas", "Menunggu Konfirmasi"]);
  data.classSummary.forEach((item) => classes.addRow([item.className, item.total, item.SAKIT, item.IZIN, item.ALPA, item.DINAS, item.pending]));
  styleSheet(classes, [18, 14, 14, 14, 14, 14, 24]);

  const duties = workbook.addWorksheet("Keterlaksanaan Piket");
  duties.addRow(["Tanggal", "Hari", "Guru Piket", "Jam", "Status", "Waktu Selesai", "Jumlah Catatan"]);
  data.occurrences.forEach((item) => duties.addRow([item.date, item.weekday, item.teacherName, `${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)}`, item.status === "SELESAI" ? "Selesai" : item.status === "BERJALAN" ? "Berjalan" : "Belum", item.completedAt || "", item.attendanceCount]));
  styleSheet(duties, [16, 14, 30, 16, 16, 22, 18]);

  const teachersSheet = workbook.addWorksheet("Ringkasan Per Guru");
  teachersSheet.addRow(["Guru Piket", "Jadwal", "Selesai", "Belum", "Berjalan", "Keterlaksanaan", "Jumlah Catatan"]);
  data.teacherSummary.forEach((item) => teachersSheet.addRow([item.teacherName, item.scheduled, item.completed, item.overdue, item.inProgress, item.completionRate / 100, item.attendanceCount]));
  styleSheet(teachersSheet, [30, 14, 14, 14, 14, 20, 18]);
  teachersSheet.getColumn(6).numFmt = "0%";

  const attendanceSheet = workbook.addWorksheet("Data Absensi");
  attendanceSheet.addRow(["Tanggal", "Jenis", "Nama", "Kelas/Unit", "Status", "Konfirmasi", "Keterangan", "Pencatat"]);
  data.attendance.forEach((item) => attendanceSheet.addRow([item.date, item.type === "SISWA" ? "Siswa" : "Guru", item.name, item.className || "Guru", statusLabels[item.status], item.confirmed ? "Sudah" : "Belum", item.notes || "", item.recorder]));
  styleSheet(attendanceSheet, [16, 14, 30, 14, 14, 18, 36, 28]);
  const teacherAttendanceSheet = workbook.addWorksheet("Detail Absensi Guru");
  teacherAttendanceSheet.addRow(["Tanggal", "Nama Guru", "Status", "Konfirmasi", "Keterangan", "Pencatat"]);
  data.attendance.filter((item) => item.type === "GURU").forEach((item) => teacherAttendanceSheet.addRow([item.date, item.name, statusLabels[item.status], item.confirmed ? "Sudah" : "Belum", item.notes || "", item.recorder]));
  styleSheet(teacherAttendanceSheet, [16, 32, 16, 18, 40, 28]);
  return workbook.xlsx.writeBuffer();
}

export async function loadWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Gunakan file Excel berformat .xlsx.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran file maksimal 5 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook;
}
