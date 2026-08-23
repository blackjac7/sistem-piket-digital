import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

const client = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  const activeYears = await client.unsafe<{ id: number; name: string }[]>("select id,name from academic_years where is_active=true order by id");
  if (activeYears.length !== 1) throw new Error(`Perbaikan dibatalkan: harus ada tepat satu tahun ajaran aktif, ditemukan ${activeYears.length}.`);
  const activeYear = activeYears[0];
  const statusMismatches = await client.unsafe<{ id: number; name: string; status: string; is_active: boolean; outcome: string }[]>(`
    select se.id,s.name,s.status,s.is_active,se.outcome
    from student_enrollments se
    join students s on s.id=se.student_id
    where se.academic_year_id=$1
      and ((s.status='AKTIF' and s.is_active=true and se.outcome <> 'AKTIF')
        or (s.status='PINDAH' and se.outcome <> 'PINDAH')
        or (s.status='LULUS' and se.outcome <> 'LULUS'))
    order by se.id
  `, [activeYear.id]);
  const missing = await client.unsafe<{ id: number; name: string; class_id: number; class_name: string }[]>(`
    select s.id,s.name,s.class_id,c.name as class_name
    from students s
    join school_classes c on c.id=s.class_id
    left join student_enrollments se on se.student_id=s.id and se.academic_year_id=$1
    where s.is_active=true and s.status='AKTIF' and se.id is null
    order by c.name,s.name
  `, [activeYear.id]);

  if (!missing.length && !statusMismatches.length) {
    console.log(`Tidak ada relasi yang perlu diperbaiki untuk tahun ajaran ${activeYear.name}.`);
    await client.end();
    return;
  }

  await client.begin(async (transaction) => {
    if (statusMismatches.length) {
      await transaction.unsafe(`
        update student_enrollments se
        set outcome=(case when s.status='PINDAH' then 'PINDAH' when s.status='LULUS' then 'LULUS' else 'AKTIF' end)::enrollment_outcome, updated_at=now()
        from students s
        where se.student_id=s.id and se.academic_year_id=$1 and se.id = any($2::int[])
      `, [activeYear.id, statusMismatches.map((item) => item.id)]);
    }
    for (const student of missing) {
      await transaction.unsafe(`
        insert into student_enrollments (student_id,class_id,academic_year_id,outcome)
        values ($1,$2,$3,'AKTIF')
        on conflict (student_id,academic_year_id) do update set class_id=excluded.class_id,outcome='AKTIF',updated_at=now()
      `, [student.id, student.class_id, activeYear.id]);
    }
  });

  console.log(`Perbaikan selesai untuk tahun ajaran ${activeYear.name}: ${missing.length} enrollment ditambahkan, ${statusMismatches.length} outcome diselaraskan.`);
  for (const student of missing) console.log(`- ${student.name} (${student.class_name})`);
  for (const item of statusMismatches) console.log(`- ${item.name}: ${item.outcome} -> ${item.status}`);
  await client.end();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await client.end();
  process.exit(1);
});
