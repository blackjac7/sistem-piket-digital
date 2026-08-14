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

export const attendanceStatuses = [
  { value: "SAKIT", label: "Sakit", tone: "amber" },
  { value: "IZIN", label: "Izin", tone: "blue" },
  { value: "ALPA", label: "Alpa", tone: "red" },
  { value: "DINAS", label: "Dinas", tone: "green" },
] as const;
