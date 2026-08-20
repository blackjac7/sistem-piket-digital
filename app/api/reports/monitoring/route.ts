import { getCurrentUser } from "@/lib/auth";
import { createMonitoringReport } from "@/lib/excel";
import { getMonitoringData, normalizeMonitoringPeriod } from "@/lib/monitoring";
import { parseAttendanceFilter } from "@/lib/attendance-filters";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "WAKASEK_KURIKULUM") return new Response("Forbidden", { status: 403 });
  const period = normalizeMonitoringPeriod(new URL(request.url).searchParams.get("period") || undefined);
  const filter = parseAttendanceFilter(new URL(request.url).searchParams);
  const data = await getMonitoringData(period, { className: filter.className, status: filter.status, type: filter.type });
  const buffer = await createMonitoringReport(data);
  return new Response(buffer as BodyInit, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="laporan-piket-${data.start}-${data.end}.xlsx"`,
  } });
}
