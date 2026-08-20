export type AttendanceFilter = {
  start?: string;
  end?: string;
  query?: string;
  className?: string;
  status?: "SAKIT" | "IZIN" | "ALPA" | "DINAS";
  confirmation?: "CONFIRMED" | "PENDING";
  recorder?: string;
  type?: "SISWA" | "GURU";
};

type SearchValues = Record<string, string | string[] | undefined> | URLSearchParams;

function value(source: SearchValues, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) || undefined;
  const item = source[key];
  return Array.isArray(item) ? item[0] : item;
}

export function parseAttendanceFilter(source: SearchValues): AttendanceFilter {
  const status = value(source, "status");
  const confirmation = value(source, "confirmation");
  const type = value(source, "type");
  const date = /^\d{4}-\d{2}-\d{2}$/;
  return {
    start: date.test(value(source, "start") || "") ? value(source, "start") : undefined,
    end: date.test(value(source, "end") || "") ? value(source, "end") : undefined,
    query: value(source, "q")?.trim().slice(0, 120) || undefined,
    className: value(source, "class")?.trim().slice(0, 20) || undefined,
    status: (["SAKIT", "IZIN", "ALPA", "DINAS"] as const).find((item) => item === status),
    confirmation: (["CONFIRMED", "PENDING"] as const).find((item) => item === confirmation),
    recorder: value(source, "recorder")?.trim().slice(0, 120) || undefined,
    type: (["SISWA", "GURU"] as const).find((item) => item === type),
  };
}

export function filterAttendance<T extends { date: string; type: "SISWA" | "GURU"; name: string; className: string | null; status: string; confirmed: boolean; recorder: string }>(rows: T[], filter: AttendanceFilter) {
  const query = filter.query?.toLocaleLowerCase("id-ID");
  return rows.filter((row) => (!filter.start || row.date >= filter.start)
    && (!filter.end || row.date <= filter.end)
    && (!query || row.name.toLocaleLowerCase("id-ID").includes(query))
    && (!filter.className || row.className === filter.className)
    && (!filter.status || row.status === filter.status)
    && (!filter.confirmation || (filter.confirmation === "CONFIRMED" ? row.confirmed : !row.confirmed))
    && (!filter.recorder || row.recorder === filter.recorder)
    && (!filter.type || row.type === filter.type));
}

export function attendanceFilterParams(filter: AttendanceFilter) {
  const params = new URLSearchParams();
  if (filter.start) params.set("start", filter.start);
  if (filter.end) params.set("end", filter.end);
  if (filter.query) params.set("q", filter.query);
  if (filter.className) params.set("class", filter.className);
  if (filter.status) params.set("status", filter.status);
  if (filter.confirmation) params.set("confirmation", filter.confirmation);
  if (filter.recorder) params.set("recorder", filter.recorder);
  if (filter.type) params.set("type", filter.type);
  return params;
}
