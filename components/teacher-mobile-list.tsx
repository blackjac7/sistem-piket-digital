"use client";

import Link from "next/link";
import { Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DutyTeacherControl } from "./duty-teacher-control";
import { StatusPill } from "./status-pill";

type TeacherItem = {
  id: number;
  name: string;
  employeeNumber: string | null;
  subject: string | null;
  isDutyTeacher: boolean;
  username: string | null;
  suggestedUsername: string;
};

export function TeacherMobileList({ teachers }: { teachers: TeacherItem[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("id-ID");
    if (!keyword) return teachers;
    return teachers.filter((teacher) => `${teacher.name} ${teacher.subject || ""} ${teacher.username || ""}`.toLocaleLowerCase("id-ID").includes(keyword));
  }, [query, teachers]);

  return <div className="mobile-data-view">
    <label className="mobile-list-search input-icon"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, bidang, atau username" aria-label="Cari guru" /></label>
    <div className="mobile-record-list">
      {filtered.map((teacher) => <article className="mobile-record" key={teacher.id}>
        <div className="mobile-record-heading"><span className="avatar">{teacher.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{teacher.name}</strong><small>{teacher.subject || "Mata pelajaran belum diatur"}</small></span><StatusPill tone={teacher.isDutyTeacher ? "success" : undefined}>{teacher.isDutyTeacher ? "Guru piket" : "Guru"}</StatusPill></div>
        <dl className="mobile-record-details"><div><dt>NIP/NUPTK</dt><dd>{teacher.employeeNumber || "Belum diatur"}</dd></div><div><dt>Username</dt><dd className="mono">{teacher.username ? `@${teacher.username}` : "Belum memiliki akun"}</dd></div></dl>
        <div className="mobile-record-actions"><Link href={`/teachers/${teacher.id}`} className="button button-secondary small"><Pencil aria-hidden="true" /> Edit data</Link><DutyTeacherControl teacherId={teacher.id} teacherName={teacher.name} isDutyTeacher={teacher.isDutyTeacher} username={teacher.username} suggestedUsername={teacher.suggestedUsername} /></div>
      </article>)}
      {!filtered.length && <p className="empty-state">Guru yang dicari tidak ditemukan.</p>}
    </div>
  </div>;
}
