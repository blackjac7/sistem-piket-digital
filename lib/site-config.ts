export const siteConfig = {
  schoolName: "SMP IP YAKIN",
  productName: "Sistem Piket Digital",
  logoPath: "/img/logo.png",
  passkeyLabel: "Sidik jari, wajah, atau PIN perangkat",
} as const;

export const roleLabels: Record<string, string> = {
  ADMIN: "Admin IT",
  WAKASEK_KURIKULUM: "Wakasek Kurikulum",
  GURU_PIKET: "Guru Piket",
  GURU: "Guru",
};

export const attendanceStatusMeta = {
  SAKIT: { label: "Sakit", tone: "amber", pillTone: "warning", color: "#d89024" },
  IZIN: { label: "Izin", tone: "blue", pillTone: "info", color: "#347fb7" },
  ALPA: { label: "Alpa", tone: "red", pillTone: "danger", color: "#c34c55" },
  DINAS: { label: "Dinas", tone: "green", pillTone: "success", color: "#2c966d" },
} as const;

export const attendanceStatuses = (Object.entries(attendanceStatusMeta) as Array<[keyof typeof attendanceStatusMeta, (typeof attendanceStatusMeta)[keyof typeof attendanceStatusMeta]]>).map(([value, meta]) => ({ value, ...meta }));
