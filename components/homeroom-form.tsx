"use client";

import { useActionState } from "react";
import { updateHomeroomAction, type ActionState } from "@/app/actions";
import { MutationRequestInput } from "./mutation-request-input";
import { SubmitButton } from "./submit-button";

type Teacher = { id: number; name: string };

export function HomeroomForm({ classId, teacherId, teachers }: { classId: number; teacherId: number | null; teachers: Teacher[] }) {
  const [state, action] = useActionState(updateHomeroomAction, {} as ActionState);

  return <form action={action}>
    <MutationRequestInput resetKey={state} />
    <input type="hidden" name="classId" value={classId} />
    <select name="teacherId" defaultValue={teacherId || ""} aria-label="Wali kelas">
      <option value="">Tanpa wali kelas</option>
      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
    </select>
    <SubmitButton className="button-secondary small" pendingLabel="Menyimpan...">Simpan</SubmitButton>
    {state.error && <p className="form-message error" role="alert">{state.error}</p>}
    {state.success && <p className="form-message success" role="status">{state.success}</p>}
  </form>;
}
