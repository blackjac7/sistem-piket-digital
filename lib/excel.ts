import ExcelJS from "exceljs";
import { siteConfig } from "@/lib/site-config";
import type { MonitoringData } from "@/lib/monitoring";
import type { SchoolCalendarEntry } from "@/lib/school-calendar";

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
  sheet.autoFilter = { from: "A1", to: `${excelColumnName(widths.length)}${Math.max(1, sheet.rowCount)}` };
}

function excelColumnName(value: number) {
  let result = "";
  let current = value;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result || "A";
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

export type AttendanceReportRow = {
  type: "SISWA" | "GURU";
  personId?: number | null;
  studentNumber?: string | null;
  employeeNumber?: string | null;
  name: string;
  className: string | null;
  status: string;
  date: string;
  notes: string | null;
  confirmed: boolean;
  recorder: string;
};

export type AttendanceReportOptions = {
  filterSummary?: string;
  calendarEntries?: SchoolCalendarEntry[];
};

const reportStatuses = ["SAKIT", "IZIN", "ALPA", "DINAS"] as const;
type ReportStatus = (typeof reportStatuses)[number];
type PersonSummary = {
  key: string;
  identifier: string;
  name: string;
  className: string;
  counts: Record<ReportStatus, number>;
  pending: number;
  total: number;
};

const reportStatusLabels: Record<ReportStatus, string> = { SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa", DINAS: "Dinas" };

function emptyReportCounts(): Record<ReportStatus, number> {
  return { SAKIT: 0, IZIN: 0, ALPA: 0, DINAS: 0 };
}

function aggregatePeople(rows: AttendanceReportRow[], type: "SISWA" | "GURU") {
  const result = new Map<string, PersonSummary>();
  for (const row of rows) {
    if (row.type !== type) continue;
    const identifier = type === "SISWA" ? row.studentNumber || "" : row.employeeNumber || "";
    const key = `${type}:${row.personId ?? `${identifier}:${row.name}:${row.className || ""}`}`;
    const current = result.get(key) || {
      key,
      identifier,
      name: row.name,
      className: row.className || (type === "SISWA" ? "Tanpa kelas" : "Guru"),
      counts: emptyReportCounts(),
      pending: 0,
      total: 0,
    };
    if (row.status in current.counts) current.counts[row.status as ReportStatus] += 1;
    if (!row.confirmed) current.pending += 1;
    current.total += 1;
    result.set(key, current);
  }
  return [...result.values()].sort((left, right) => left.name.localeCompare(right.name, "id") || left.className.localeCompare(right.className, "id"));
}

function addPersonSummarySheet(workbook: ExcelJS.Workbook, sheetName: string, rows: AttendanceReportRow[], type: "SISWA" | "GURU") {
  const sheet = workbook.addWorksheet(sheetName);
  const identifierLabel = type === "SISWA" ? "NIS" : "NIP/NUPTK";
  const headers = [identifierLabel, type === "SISWA" ? "Nama Siswa" : "Nama Guru", ...(type === "SISWA" ? ["Kelas"] : []), "Sakit", "Izin", "Alpa", "Dinas", "Menunggu Konfirmasi", "Total"];
  sheet.addRow(headers);
  const summaries = aggregatePeople(rows, type);
  for (const item of summaries) {
    sheet.addRow([
      item.identifier || "-",
      item.name,
      ...(type === "SISWA" ? [item.className] : []),
      item.counts.SAKIT,
      item.counts.IZIN,
      item.counts.ALPA,
      item.counts.DINAS,
      item.pending,
      item.total,
    ]);
  }
  styleSheet(sheet, type === "SISWA" ? [18, 32, 16, 12, 12, 12, 12, 22, 12] : [20, 34, 12, 12, 12, 12, 22, 12]);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF9" } }; });
  });
  if (summaries.length === 0) sheet.addRow([`Tidak ada data ${type === "SISWA" ? "siswa" : "guru"} pada filter yang dipilih.`]);
}

function addClassSummarySheet(workbook: ExcelJS.Workbook, rows: AttendanceReportRow[]) {
  const sheet = workbook.addWorksheet("Rekap Kelas");
  sheet.addRow(["Kelas", "Sakit", "Izin", "Alpa", "Dinas", "Menunggu Konfirmasi", "Total"]);
  const groups = new Map<string, { counts: Record<ReportStatus, number>; pending: number; total: number }>();
  for (const row of rows) {
    if (row.type !== "SISWA") continue;
    const key = row.className || "Tanpa kelas";
    const current = groups.get(key) || { counts: emptyReportCounts(), pending: 0, total: 0 };
    if (row.status in current.counts) current.counts[row.status as ReportStatus] += 1;
    if (!row.confirmed) current.pending += 1;
    current.total += 1;
    groups.set(key, current);
  }
  [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "id")).forEach(([name, item]) => sheet.addRow([name, item.counts.SAKIT, item.counts.IZIN, item.counts.ALPA, item.counts.DINAS, item.pending, item.total]));
  styleSheet(sheet, [18, 12, 12, 12, 12, 22, 12]);
}

function addAttendanceDetailSheet(workbook: ExcelJS.Workbook, sheetName: string, rows: AttendanceReportRow[], type: "SISWA" | "GURU") {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(["Tanggal", type === "SISWA" ? "NIS" : "NIP/NUPTK", type === "SISWA" ? "Nama Siswa" : "Nama Guru", ...(type === "SISWA" ? ["Kelas"] : []), "Status", "Konfirmasi", "Keterangan", "Pencatat"]);
  rows.filter((row) => row.type === type).forEach((row) => sheet.addRow([
    row.date,
    type === "SISWA" ? row.studentNumber || "-" : row.employeeNumber || "-",
    row.name,
    ...(type === "SISWA" ? [row.className || "Tanpa kelas"] : []),
    reportStatusLabels[row.status as ReportStatus] || row.status,
    row.confirmed ? "Sudah" : "Belum",
    row.notes || "",
    row.recorder,
  ]));
  styleSheet(sheet, type === "SISWA" ? [16, 18, 32, 16, 16, 20, 40, 28] : [16, 20, 34, 16, 20, 40, 28]);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF9" } }; });
  });
}

function addCalendarSheet(workbook: ExcelJS.Workbook, entries: SchoolCalendarEntry[]) {
  const sheet = workbook.addWorksheet("Kalender Operasional");
  sheet.addRow(["Mulai", "Selesai", "Status", "Agenda", "Keterangan", "Jadwal Pengganti"]);
  const statusLabels = { LIBUR: "Libur sekolah", TUTUP_DARURAT: "Tutup darurat", KEGIATAN_KHUSUS: "Kegiatan khusus", HARI_PENGGANTI: "Hari pengganti" } as const;
  const weekdayLabels: Record<number, string> = { 1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu" };
  for (const entry of entries) {
    sheet.addRow([entry.startDate, entry.endDate, statusLabels[entry.status], entry.title, entry.description || "", entry.scheduleWeekday ? weekdayLabels[entry.scheduleWeekday] : "-"]);
  }
  styleSheet(sheet, [16, 16, 20, 32, 44, 20]);
}

export async function createAttendanceReport(rows: AttendanceReportRow[], options: AttendanceReportOptions = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();
  const summary = workbook.addWorksheet("Ringkasan");
  summary.getColumn(1).width = 30; summary.getColumn(2).width = 20; summary.getColumn(3).width = 18;
  summary.addRow([`Rekap Absensi - ${siteConfig.schoolName}`]);
  summary.addRow(["Filter aktif", options.filterSummary || "Semua data"]);
  summary.addRow(["Dibuat", new Date()]);
  summary.addRow(["Aturan kalender", "Libur dan tutup darurat dikecualikan dari rekap operasional"]);
  summary.addRow([]);
  summary.addRow(["Indikator", "Jumlah", "Persentase"]);
  const total = rows.length;
  const values: Array<[string, number, number | null]> = [
    ["Total catatan", total, total ? 1 : 0],
    ["Absensi siswa", rows.filter((row) => row.type === "SISWA").length, total ? rows.filter((row) => row.type === "SISWA").length / total : 0],
    ["Absensi guru", rows.filter((row) => row.type === "GURU").length, total ? rows.filter((row) => row.type === "GURU").length / total : 0],
    ["Siswa unik", aggregatePeople(rows, "SISWA").length, null],
    ["Guru unik", aggregatePeople(rows, "GURU").length, null],
    ["Sudah dikonfirmasi", rows.filter((row) => row.confirmed).length, total ? rows.filter((row) => row.confirmed).length / total : 0],
    ["Menunggu konfirmasi", rows.filter((row) => !row.confirmed).length, total ? rows.filter((row) => !row.confirmed).length / total : 0],
    ...reportStatuses.map((status) => { const value = rows.filter((row) => row.status === status).length; return [reportStatusLabels[status], value, total ? value / total : 0] as [string, number, number | null]; }),
  ];
  values.forEach((row) => summary.addRow(row));
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: `FF${headerFill}` } };
  summary.getRow(6).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }; });
  summary.getColumn(3).numFmt = "0%"; summary.views = [{ state: "frozen", ySplit: 6 }];

  const studentRows = rows.filter((row) => row.type === "SISWA");
  const teacherRows = rows.filter((row) => row.type === "GURU");
  addPersonSummarySheet(workbook, "Rekap Individu Siswa", studentRows, "SISWA");
  addPersonSummarySheet(workbook, "Rekap Individu Guru", teacherRows, "GURU");
  addClassSummarySheet(workbook, rows);
  addAttendanceDetailSheet(workbook, "Detail Absensi Siswa", studentRows, "SISWA");
  addAttendanceDetailSheet(workbook, "Detail Absensi Guru", teacherRows, "GURU");
  addCalendarSheet(workbook, options.calendarEntries || []);
  return workbook.xlsx.writeBuffer();
}

export async function createMonitoringReport(data: MonitoringData, options: { filterSummary?: string } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.schoolName;
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Ringkasan");
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 24;
  summary.addRow([`Laporan Pemantauan Guru Piket - ${siteConfig.schoolName}`]);
  summary.addRow(["Periode", `${data.start} sampai ${data.end}`]);
  summary.addRow(["Filter absensi", options.filterSummary || "Semua data"]);
  summary.addRow([]);
  summary.addRow(["Indikator", "Nilai"]);
  summary.addRows([
    ["Jadwal piket", data.summary.scheduled],
    ["Piket selesai", data.summary.completed],
    ["Belum diselesaikan", data.summary.overdue],
    ["Sedang berjalan", data.summary.inProgress],
    ["Hari non-operasional", data.summary.nonOperationalDays],
    ["Keterlaksanaan", `${data.summary.completionRate}%`],
    ["Catatan absensi dibuat", data.summary.totalActivity],
    ["Absensi siswa", data.attendanceSummary.students],
    ["Absensi guru", data.attendanceSummary.teachers],
    ["Sudah dikonfirmasi", data.attendanceSummary.confirmed],
    ["Menunggu konfirmasi", data.attendanceSummary.pending],
  ]);
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: `FF${headerFill}` } };
  summary.getRow(5).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }; });

  const trend = workbook.addWorksheet("Tren Harian");
  trend.addRow(["Tanggal", "Kalender", "Jadwal", "Selesai", "Keterlaksanaan", "Absensi Siswa", "Siswa Sakit", "Siswa Izin", "Siswa Alpa", "Siswa Dinas", "Absensi Guru", "Guru Sakit", "Guru Izin", "Guru Alpa", "Guru Dinas"]);
  data.trend.forEach((item) => {
    const rate = item.scheduled ? item.completed / item.scheduled : 0;
    trend.addRow([item.date, item.calendarTitle || (item.nonOperational ? "Tidak operasional" : "-"), item.scheduled, item.completed, rate, item.studentAttendanceCount, item.studentAttendanceStatuses.SAKIT, item.studentAttendanceStatuses.IZIN, item.studentAttendanceStatuses.ALPA, item.studentAttendanceStatuses.DINAS, item.teacherAttendanceCount, item.teacherAttendanceStatuses.SAKIT, item.teacherAttendanceStatuses.IZIN, item.teacherAttendanceStatuses.ALPA, item.teacherAttendanceStatuses.DINAS]);
  });
  styleSheet(trend, [16, 28, 12, 12, 18, 16, 16, 16, 16, 16, 16, 14, 14, 14, 14]);
  trend.getColumn(5).numFmt = "0%";

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

  const monitoringAttendance = data.attendance.map((item) => ({
    type: item.type,
    personId: item.studentId ?? item.teacherId,
    studentNumber: item.studentNumber,
    employeeNumber: item.employeeNumber,
    name: item.name,
    className: item.className,
    status: item.status,
    date: item.date,
    notes: item.notes,
    confirmed: item.confirmed,
    recorder: item.recorder,
  }));
  addPersonSummarySheet(workbook, "Rekap Absensi Siswa", monitoringAttendance, "SISWA");
  addPersonSummarySheet(workbook, "Rekap Absensi Guru", monitoringAttendance, "GURU");

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
  addCalendarSheet(workbook, data.calendarEntries);
  return workbook.xlsx.writeBuffer();
}

export async function loadWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Gunakan file Excel berformat .xlsx.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran file maksimal 5 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook;
}
