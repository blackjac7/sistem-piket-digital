"use client";

import { useActionState } from "react";
import { confirmAllAttendanceAction } from "@/app/actions";
import { ConfirmFormButton } from "./confirm-form-button";
import { MutationRequestInput } from "./mutation-request-input";

export function ConfirmAllAttendance({ pendingCount }: { pendingCount: number }) {
  const [state, action] = useActionState(confirmAllAttendanceAction, {});

  if (!pendingCount && !state.error && !state.success) return null;

  return <div className="attendance-bulk-confirm">
    {pendingCount > 0 && <form action={action}>
      <MutationRequestInput resetKey={state} />
      <ConfirmFormButton
        label={`Konfirmasi semua (${pendingCount})`}
        icon="check-all"
        options={{
          title: `Konfirmasi ${pendingCount} catatan absensi?`,
          description: "Semua catatan berstatus Belum akan dikunci dan tidak dapat diubah lagi.",
          message: "Pastikan seluruh status ketidakhadiran sudah diperiksa sebelum melanjutkan.",
          confirmLabel: "Ya, konfirmasi semua",
        }}
      />
    </form>}
    {state.error && <p className="form-message error" role="alert">{state.error}</p>}
    {state.success && <p className="form-message success" role="status">{state.success}</p>}
  </div>;
}
