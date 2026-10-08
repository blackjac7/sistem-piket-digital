"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardPlus } from "lucide-react";
import { completeDutyForDateAction, type ActionState } from "@/app/actions";
import { MutationRequestInput } from "./mutation-request-input";
import { SubmitButton } from "./submit-button";

export type DutyWindowItem = {
  dutyDate: string;
  label: string;
  weekdayLabel: string;
  hint: string;
  completed: boolean;
  isToday: boolean;
  /** Dua digit tanggal, dipakai sebagai penanda visual. */
  day: string;
};

export function DutyWindowCard({
  items,
  windowDays,
  scopeNote,
}: {
  items: DutyWindowItem[];
  windowDays: number;
  scopeNote: string;
}) {
  const [state, action] = useActionState(
    completeDutyForDateAction,
    {} as ActionState,
  );
  const pending = items.filter((item) => !item.completed);

  return (
    <section
      className={`duty-window-card${pending.length ? "" : " completed"}`}
    >
      <header>
        <span className="stat-icon green">
          <CalendarClock aria-hidden="true" />
        </span>
        <div>
          <strong>Jadwal piket Anda</strong>
          <small>
            {scopeNote} Pengisian susulan dibuka {windowDays} hari setelah
            tanggal jadwal.
          </small>
        </div>
        {!items.length && (
          <span className="status-pill neutral">Belum ada jadwal</span>
        )}
        {!!items.length && !pending.length && (
          <span className="status-pill success">Semua selesai</span>
        )}
      </header>
      <div className="duty-window-list">
        {items.map((item) => (
          <article key={item.dutyDate} className={item.completed ? "done" : ""}>
            <span className="duty-day" aria-hidden="true">
              {item.day}
              {item.isToday && <small>ini</small>}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {item.weekdayLabel} · {item.hint}
              </small>
            </div>
            {item.completed ? (
              <span className="status-pill success">
                <CheckCircle2 aria-hidden="true" /> Selesai
              </span>
            ) : (
              <form action={action}>
                <MutationRequestInput resetKey={state} />
                <input type="hidden" name="dutyDate" value={item.dutyDate} />
                <SubmitButton
                  className="button button-secondary small"
                  pendingLabel="Menutup..."
                >
                  Tutup tugas
                </SubmitButton>
              </form>
            )}
          </article>
        ))}
        {!items.length && (
          <div className="empty-block small">
            <CalendarClock aria-hidden="true" />
            <p>Belum ada jadwal piket aktif pada akun Anda.</p>
          </div>
        )}
      </div>
      {state.error && (
        <p className="form-message error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="form-message success" role="status">
          {state.success}
        </p>
      )}
      {pending.length > 0 && (
        <footer>
          <ClipboardPlus aria-hidden="true" />
          <span>
            Lupa mengisi absensi? Catat dulu di halaman absensi, lalu tutup
            tugas di sini.
          </span>
          <Link href="/attendance" className="text-link">
            Buka absensi
          </Link>
        </footer>
      )}
    </section>
  );
}
