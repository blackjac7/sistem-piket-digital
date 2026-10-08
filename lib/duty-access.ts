import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { dutyCompletions, dutySchedules } from "@/db/schema";
import {
  actualWeekday,
  getPublishedCalendarEntries,
  isOperationalSchoolDate,
} from "@/lib/school-calendar";
import { formatDateId, jakartaDate, weekdayNames } from "@/lib/utils";

/**
 * Batas toleransi pengisian absensi (dan penutupan tugas piket) setelah
 * tanggal jadwal. Jadwal pada tanggal H dapat diisi sampai H + 3 hari.
 */
export const DUTY_FILL_WINDOW_DAYS = 3;

/**
 * Selisih hari kalender antara dua tanggal ISO (YYYY-MM-DD).
 *
 * Kedua tanggal adalah nilai date-only tanpa zona waktu, jadi keduanya diikat ke
 * tengah malam UTC. Karena keduanya memakai acuan yang sama, hasilnya bebas dari
 * pergeseran zona waktu server: selisih "2026-10-07" ke "2026-10-08" selalu 1,
 * dijalankan dari WIB, UTC, atau zona mana pun.
 */
export function calendarDayDiff(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Menggeser tanggal ISO sejumlah hari, misalnya untuk menghitung batas jendela.
 * Sama seperti `calendarDayDiff`, acuan tengah malam UTC dipakai agar hasilnya
 * tidak bergeser mengikuti zona waktu server.
 */
export function shiftIsoDate(date: string, days: number) {
  const base = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(base)) return date;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Hari terakhir pengisian masih diizinkan untuk tanggal jadwal (inklusif). */
export function dutyWindowDeadline(dutyDate: string) {
  return shiftIsoDate(dutyDate, DUTY_FILL_WINDOW_DAYS);
}

export type DutyWindow = {
  /** Tanggal jadwal yang masih boleh diisi. */
  dutyDate: string;
  /** Hari terakhir pengisian (inklusif). */
  deadline: string;
  /** Sisa hari pengisian; 0 berarti hari terakhir. */
  remainingDays: number;
  weekday: number;
  weekdayLabel: string;
  /** Tugas piket pada tanggal jadwal sudah ditutup. */
  completed: boolean;
  /** Tanggal jadwal jatuh pada hari non-operasional (libur/tutup darurat/ujian). */
  skipped: boolean;
};

function weekdayLabel(weekday: number) {
  return weekdayNames[weekday] || `Hari ke-${weekday}`;
}

/**
 * Tanggal jadwal yang masih "terbuka" untuk diisi ulang oleh guru piket.
 *
 * Aturan:
 * - Jadwal berulang per hari dalam seminggu (`duty_schedules.weekday`).
 * - Tanggal jadwal H dapat diisi sampai H + DUTY_FILL_WINDOW_DAYS.
 * - Tanggal setelah hari ini belum dianggap terbuka.
 * - Tanggal jatuh pada hari non-operasional ditandai `skipped` dan diabaikan.
 * - HANYA jadwal milik `teacherId` yang dipertimbangkan, sehingga jadwal guru
 *   piket lain tidak pernah muncul dan tidak dapat diisi.
 */
export async function getOpenDutyWindowsForTeacher(
  teacherId: number,
  today = jakartaDate(),
): Promise<DutyWindow[]> {
  const schedules = await db
    .select({
      id: dutySchedules.id,
      weekday: dutySchedules.weekday,
      shift: dutySchedules.shift,
    })
    .from(dutySchedules)
    .where(
      and(
        eq(dutySchedules.teacherId, teacherId),
        eq(dutySchedules.isActive, true),
      ),
    );

  if (!schedules.length) return [];

  const scheduleIds = schedules.map((row) => row.id);
  const scheduleByWeekday = new Map(schedules.map((row) => [row.weekday, row]));
  const lookback = DUTY_FILL_WINDOW_DAYS + 21;
  const earliest = shiftIsoDate(today, -lookback);

  const [completions, calendarEntries] = await Promise.all([
    db
      .select({
        scheduleId: dutyCompletions.scheduleId,
        dutyDate: dutyCompletions.dutyDate,
      })
      .from(dutyCompletions)
      .where(
        and(
          inArray(dutyCompletions.scheduleId, scheduleIds),
          gte(dutyCompletions.dutyDate, earliest),
          lte(dutyCompletions.dutyDate, today),
        ),
      ),
    getPublishedCalendarEntries(earliest, today),
  ]);

  const completionKey = new Set(
    completions.map((row) => `${row.scheduleId}|${row.dutyDate}`),
  );

  const windows: DutyWindow[] = [];
  for (let offset = 0; offset <= lookback; offset += 1) {
    const date = shiftIsoDate(today, -offset);
    const remainingDays = DUTY_FILL_WINDOW_DAYS - calendarDayDiff(date, today);
    // Di luar jendela pengisian: tanggal jadwal sudah tidak boleh disentuh.
    if (remainingDays < 0) break;
    const entry =
      calendarEntries.find(
        (item) => item.startDate <= date && item.endDate >= date,
      ) || null;
    const weekday = entry?.scheduleWeekday || actualWeekday(date);
    const schedule = scheduleByWeekday.get(weekday);
    if (!schedule) continue;
    windows.push({
      dutyDate: date,
      deadline: dutyWindowDeadline(date),
      remainingDays,
      weekday,
      weekdayLabel: weekdayLabel(weekday),
      completed: completionKey.has(`${schedule.id}|${date}`),
      skipped: !isOperationalSchoolDate(date, entry),
    });
  }
  return windows;
}

/**
 * Jadwal siap tampil: tanpa hari non-operasional, terbaru lebih dahulu.
 *
 * Secara bawaan hanya jadwal yang belum ditutup, cocok untuk daftar "tugas yang
 * masih perlu dikerjakan". Set `includeCompleted` untuk menampilkan seluruh
 * jendela 3 hari, termasuk yang tugasnya sudah ditutup — dipakai saat menghitung
 * izin pengisian absensi, karena penutupan tugas tidak mengunci absensi.
 */
export function openWindowsForDisplay(
  windows: DutyWindow[],
  { includeCompleted = false }: { includeCompleted?: boolean } = {},
) {
  return windows
    .filter((window) => !window.skipped)
    .filter((window) => includeCompleted || !window.completed)
    .sort((left, right) => (left.dutyDate < right.dutyDate ? 1 : -1));
}

type DutyAccessPerson = {
  type: "SISWA" | "GURU";
  teacherId: number | null;
};

export type DutyAccessReason = "ADMIN" | "TODAY" | "OWN_DUTY_DATE";

export type DutyAccessDecision =
  | { allowed: true; reason: DutyAccessReason }
  | { allowed: false; error: string };

type AccessUser = {
  id: number;
  name: string;
  role: string;
  teacherId: number | null;
};

/**
 * Aturan tunggal yang dipakai semua mutasi absensi (buat, ubah, hapus, konfirmasi):
 * - ADMIN bebas mengoreksi tanggal mana pun.
 * - GURU_PIKET hanya boleh menyentuh tanggal dalam jendela jadwalnya sendiri:
 *   tanggal jadwal H sampai H + DUTY_FILL_WINDOW_DAYS. Setelah itu terkunci dan
 *   hanya Admin IT yang dapat mengoreksi.
 * - Bila mencatat absensi guru, hanya untuk dirinya sendiri.
 * - Role lain ditolak.
 *
 * Status penutupan tugas piket tidak ikut mengunci catatan absensi; keduanya
 * diatur oleh jendela waktu yang sama.
 */
export async function evaluateAttendanceAccess(input: {
  user: AccessUser;
  date: string;
  today?: string;
  people?: DutyAccessPerson[];
}): Promise<DutyAccessDecision> {
  const { user, date } = input;
  const today = input.today ?? jakartaDate();

  if (user.role === "ADMIN") return { allowed: true, reason: "ADMIN" };
  if (user.role !== "GURU_PIKET")
    return {
      allowed: false,
      error: "Hanya Admin IT dan Guru Piket yang dapat mengubah data absensi.",
    };

  if (date > today)
    return {
      allowed: false,
      error: `Tanggal ${formatDateId(date)} belum berjalan. Absensi hanya dapat diisi untuk hari yang sudah berjalan.`,
    };

  if (!user.teacherId)
    return {
      allowed: false,
      error:
        "Akun Anda belum terhubung ke data guru piket. Hubungi Admin IT untuk melengkapi data ini.",
    };

  const windows = openWindowsForDisplay(
    await getOpenDutyWindowsForTeacher(user.teacherId, today),
    { includeCompleted: true },
  );

  if (!windows.length)
    return {
      allowed: false,
      error:
        `Tidak ada jadwal piket Anda dalam ${DUTY_FILL_WINDOW_DAYS} hari terakhir. ` +
        "Setelah melewati batas tersebut, hanya Admin IT yang dapat mengoreksi absensi.",
    };

  const window = windows.find((item) => item.dutyDate === date);
  if (!window) {
    const list = windows
      .map(
        (item) =>
          `${formatDateId(item.dutyDate)} (${item.weekdayLabel}, sisa ${item.remainingDays} hari)`,
      )
      .join("; ");
    return {
      allowed: false,
      error: `Anda hanya dapat mengisi absensi untuk jadwal piket Anda sendiri: ${list}. Batas pengisian ${DUTY_FILL_WINDOW_DAYS} hari setelah tanggal jadwal.`,
    };
  }

  const people = input.people || [];
  if (people.some((person) => person.type === "GURU")) {
    const onlySelf = people
      .filter((person) => person.type === "GURU")
      .every((person) => person.teacherId === user.teacherId);
    if (!onlySelf)
      return {
        allowed: false,
        error:
          "Absensi guru hanya dapat diisi untuk diri sendiri. Mintalah Admin IT mencatat absensi guru lain.",
      };
  }

  return {
    allowed: true,
    reason: window.dutyDate === today ? "TODAY" : "OWN_DUTY_DATE",
  };
}
