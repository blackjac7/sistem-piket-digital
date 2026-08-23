import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

type Issue = Record<string, unknown>;

const connectionString = process.env.DB_CONNECTION;
if (!connectionString) throw new Error("DB_CONNECTION belum diatur.");

const client = postgres(connectionString, { max: 1, prepare: false });

async function query<T extends Record<string, unknown>>(sql: string) {
  return client.unsafe<T[]>(sql);
}

async function main() {
  const [counts, activeYears, activeStudentsWithoutEnrollment, enrollmentMismatches, enrollmentStatusMismatches, orphanStudents, attendanceLinkGaps, attendanceClassMismatches, attendanceNameMismatches, attendanceRecorderGaps, dutyCompletionGaps, dutyCompletionScheduleMismatches, activeSchedules, activeScheduleDuplicates, attendanceDuplicates, attendanceConflicts, dutyTeacherAccountGaps, duplicateTeacherAccounts, activeScheduleRelationGaps, homeroomRelationGaps, invalidAttendanceShapes, enrollmentDuplicates, studentMasterIssues, analyticSummary] = await Promise.all([
    query<{ table_name: string; total: number; active_or_confirmed: number }>(`
      select 'teachers' as table_name, count(*)::int as total, count(*) filter (where is_active)::int as active_or_confirmed from teachers
      union all select 'school_classes', count(*)::int, count(*) filter (where is_active)::int from school_classes
      union all select 'academic_years', count(*)::int, count(*) filter (where is_active)::int from academic_years
      union all select 'students', count(*)::int, count(*) filter (where is_active)::int from students
      union all select 'student_enrollments', count(*)::int, count(*) filter (where outcome = 'AKTIF')::int from student_enrollments
      union all select 'users', count(*)::int, count(*) filter (where is_active)::int from users
      union all select 'duty_schedules', count(*)::int, count(*) filter (where is_active)::int from duty_schedules
      union all select 'duty_completions', count(*)::int, count(*) from duty_completions
      union all select 'attendance_records', count(*)::int, count(*) filter (where is_confirmed)::int from attendance_records
    `),
    query<{ id: number; name: string; start_year: number; end_year: number; is_active: boolean }>(`select id,name,start_year,end_year,is_active from academic_years order by is_active desc,start_year desc`),
    query<Issue>(`
      select s.id,s.name,s.student_number,s.class_id,c.name as class_name
      from students s
      left join school_classes c on c.id=s.class_id
      left join student_enrollments se on se.student_id=s.id and se.academic_year_id=(select id from academic_years where is_active=true limit 1)
      where s.is_active=true and s.status='AKTIF' and se.id is null
      order by c.name,s.name
    `),
    query<Issue>(`
      select s.id,s.name,s.class_id as student_class_id,se.class_id as enrollment_class_id,c1.name as student_class,c2.name as enrollment_class
      from students s
      join student_enrollments se on se.student_id=s.id and se.academic_year_id=(select id from academic_years where is_active=true limit 1)
      left join school_classes c1 on c1.id=s.class_id
      left join school_classes c2 on c2.id=se.class_id
      where s.is_active=true and s.status='AKTIF' and s.class_id is distinct from se.class_id
      order by s.name
    `),
    query<Issue>(`
      select se.id,se.student_id,s.name,s.status,s.is_active,se.outcome,se.class_id
      from student_enrollments se
      join students s on s.id=se.student_id
      where se.academic_year_id=(select id from academic_years where is_active=true limit 1)
        and ((s.status='AKTIF' and s.is_active=true and se.outcome <> 'AKTIF')
          or (s.status='PINDAH' and se.outcome <> 'PINDAH')
          or (s.status='LULUS' and se.outcome <> 'LULUS'))
      order by se.id
    `),
    query<Issue>(`select s.id,s.name,s.student_number,s.class_id,s.is_active,s.status from students s left join school_classes c on c.id=s.class_id where s.class_id is null or c.id is null order by s.id`),
    query<Issue>(`
      select ar.id,ar.type,ar.person_name,ar.student_id,ar.teacher_id,ar.class_id,ar.attendance_date,ar.status,ar.recorded_by
      from attendance_records ar
      left join students s on s.id=ar.student_id
      left join teachers t on t.id=ar.teacher_id
      left join school_classes c on c.id=ar.class_id
      left join users u on u.id=ar.recorded_by
      where (ar.type='SISWA' and (ar.student_id is null or s.id is null or ar.class_id is null or c.id is null or u.id is null))
         or (ar.type='GURU' and (ar.teacher_id is null or t.id is null or u.id is null))
      order by ar.id
    `),
    query<Issue>(`
      select ar.id,ar.person_name,ar.student_id,ar.class_id,s.class_id as student_class_id,c1.name as record_class,c2.name as student_class
      from attendance_records ar
      join students s on s.id=ar.student_id
      left join school_classes c1 on c1.id=ar.class_id
      left join school_classes c2 on c2.id=s.class_id
      where ar.type='SISWA' and ar.class_id is distinct from s.class_id
      order by ar.id
    `),
    query<Issue>(`
      select ar.id,ar.type,ar.person_name,s.name as student_name,t.name as teacher_name
      from attendance_records ar
      left join students s on s.id=ar.student_id
      left join teachers t on t.id=ar.teacher_id
      where (ar.type='SISWA' and lower(regexp_replace(trim(ar.person_name),'\\s+',' ','g')) <> lower(regexp_replace(trim(s.name),'\\s+',' ','g')))
         or (ar.type='GURU' and lower(regexp_replace(trim(ar.person_name),'\\s+',' ','g')) <> lower(regexp_replace(trim(t.name),'\\s+',' ','g')))
      order by ar.id
    `),
    query<Issue>(`select ar.id,ar.recorded_by,u.name,u.is_active from attendance_records ar left join users u on u.id=ar.recorded_by where u.id is null order by ar.id`),
    query<Issue>(`
      select dc.id,dc.duty_date,dc.shift,dc.teacher_id,dc.schedule_id,dc.completed_by
      from duty_completions dc
      left join teachers t on t.id=dc.teacher_id
      left join duty_schedules ds on ds.id=dc.schedule_id
      left join users u on u.id=dc.completed_by
      where t.id is null or ds.id is null or u.id is null
      order by dc.id
    `),
    query<Issue>(`
      select dc.id,dc.duty_date,dc.shift,dc.teacher_id,dc.schedule_id,ds.teacher_id as schedule_teacher,ds.weekday,ds.shift as schedule_shift
      from duty_completions dc
      join duty_schedules ds on ds.id=dc.schedule_id
      where dc.teacher_id is distinct from ds.teacher_id
         or dc.shift is distinct from ds.shift
         or ds.weekday <> extract(isodow from dc.duty_date)::int
      order by dc.id
    `),
    query<Issue>(`select ds.id,ds.weekday,ds.shift,ds.teacher_id,t.name,ds.is_active from duty_schedules ds left join teachers t on t.id=ds.teacher_id where ds.is_active=true order by ds.weekday,ds.shift`),
    query<Issue>(`select weekday,shift,count(*)::int as total,array_agg(id order by id) as ids from duty_schedules where is_active=true group by weekday,shift having count(*)>1`),
    query<Issue>(`select type,coalesce(student_id,teacher_id) as person_id,attendance_date,status,count(*)::int as total,array_agg(id order by id) as ids from attendance_records group by type,coalesce(student_id,teacher_id),attendance_date,status having count(*)>1 order by attendance_date`),
    query<Issue>(`select type,coalesce(student_id,teacher_id) as person_id,attendance_date,count(distinct status)::int as statuses,array_agg(distinct status order by status) as status_list,array_agg(id order by id) as ids from attendance_records group by type,coalesce(student_id,teacher_id),attendance_date having count(distinct status)>1 order by attendance_date`),
    query<Issue>(`select t.id,t.name,t.is_active,u.id as user_id,u.username,u.role,u.is_active as user_active from teachers t left join users u on u.teacher_id=t.id where t.is_duty_teacher=true and (u.id is null or u.is_active=false or u.role <> 'GURU_PIKET') order by t.name`),
    query<Issue>(`select teacher_id,count(*)::int as total,array_agg(id order by id) as user_ids,array_agg(username order by username) as usernames from users where teacher_id is not null group by teacher_id having count(*)>1`),
    query<Issue>(`
      select ds.id,ds.weekday,ds.shift,ds.teacher_id,t.name,t.is_active,t.is_duty_teacher,u.id as user_id,u.role,u.is_active as user_active
      from duty_schedules ds
      left join teachers t on t.id=ds.teacher_id
      left join users u on u.teacher_id=t.id
      where ds.is_active=true and (t.id is null or t.is_active=false or t.is_duty_teacher=false or u.id is null or u.role <> 'GURU_PIKET' or u.is_active=false)
      order by ds.weekday,ds.id
    `),
    query<Issue>(`
      select c.id,c.name,c.homeroom_teacher_id,t.name as teacher_name,t.is_active as teacher_active
      from school_classes c
      left join teachers t on t.id=c.homeroom_teacher_id
      where c.is_active=true and c.homeroom_teacher_id is not null and (t.id is null or t.is_active=false)
      order by c.name
    `),
    query<Issue>(`
      select id,type,student_id,teacher_id,class_id,status,attendance_date
      from attendance_records
      where (type='SISWA' and (student_id is null or teacher_id is not null or class_id is null or status='DINAS'))
         or (type='GURU' and (teacher_id is null or student_id is not null or class_id is not null))
      order by id
    `),
    query<Issue>(`select student_id,academic_year_id,count(*)::int as total,array_agg(id order by id) as ids from student_enrollments group by student_id,academic_year_id having count(*)>1`),
    query<Issue>(`
      select 'active_student_without_class' as issue,count(*)::int as total from students where is_active=true and class_id is null
      union all select 'active_student_without_number',count(*)::int from students where is_active=true and student_number is null
      union all select 'active_teacher_without_name',count(*)::int from teachers where is_active=true and nullif(trim(name),'') is null
    `),
    query<{ total: number; students_joinable: number; teachers_joinable: number; student_unjoinable: number; teacher_unjoinable: number }>(`
      select count(*)::int as total,
        count(*) filter (where ar.type='SISWA' and s.id is not null and c.id is not null and u.id is not null)::int as students_joinable,
        count(*) filter (where ar.type='GURU' and t.id is not null and u.id is not null)::int as teachers_joinable,
        count(*) filter (where ar.type='SISWA' and (s.id is null or c.id is null or u.id is null))::int as student_unjoinable,
        count(*) filter (where ar.type='GURU' and (t.id is null or u.id is null))::int as teacher_unjoinable
      from attendance_records ar
      left join students s on s.id=ar.student_id
      left join teachers t on t.id=ar.teacher_id
      left join school_classes c on c.id=ar.class_id
      left join users u on u.id=ar.recorded_by
    `),
  ]);

  const activeYearCount = activeYears.filter((year) => year.is_active).length;
  const summary = {
    ok: activeYearCount === 1
      && activeStudentsWithoutEnrollment.length === 0
      && enrollmentMismatches.length === 0
      && enrollmentStatusMismatches.length === 0
      && orphanStudents.length === 0
      && attendanceLinkGaps.length === 0
      && attendanceClassMismatches.length === 0
      && attendanceNameMismatches.length === 0
      && attendanceRecorderGaps.length === 0
      && dutyCompletionGaps.length === 0
      && dutyCompletionScheduleMismatches.length === 0
      && activeScheduleDuplicates.length === 0
      && attendanceDuplicates.length === 0
      && attendanceConflicts.length === 0
      && dutyTeacherAccountGaps.length === 0
      && duplicateTeacherAccounts.length === 0
      && activeScheduleRelationGaps.length === 0
      && homeroomRelationGaps.length === 0
      && invalidAttendanceShapes.length === 0
      && enrollmentDuplicates.length === 0
      && analyticSummary[0]?.student_unjoinable === 0
      && analyticSummary[0]?.teacher_unjoinable === 0,
    activeYearCount,
    counts,
    activeYears,
    analyticSummary: analyticSummary[0] || null,
    issues: {
      activeStudentsWithoutEnrollment,
      enrollmentMismatches,
      enrollmentStatusMismatches,
      orphanStudents,
      attendanceLinkGaps,
      attendanceClassMismatches,
      attendanceNameMismatches,
      attendanceRecorderGaps,
      dutyCompletionGaps,
      dutyCompletionScheduleMismatches,
      activeScheduleDuplicates,
      attendanceDuplicates,
      attendanceConflicts,
      dutyTeacherAccountGaps,
      duplicateTeacherAccounts,
      activeScheduleRelationGaps,
      homeroomRelationGaps,
      invalidAttendanceShapes,
      enrollmentDuplicates,
      studentMasterIssues,
    },
    activeSchedules,
  };

  console.log(JSON.stringify(summary, null, 2));
  await client.end();
  if (!summary.ok) process.exitCode = 2;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await client.end();
  process.exitCode = 1;
});
