import { requireAdmin } from "@/lib/auth";
import { createTeacherTemplate } from "@/lib/excel";

export async function GET() {
  await requireAdmin();
  const buffer = await createTeacherTemplate();
  return new Response(buffer as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="template-data-guru-smp-ip-yakin.xlsx"' } });
}
