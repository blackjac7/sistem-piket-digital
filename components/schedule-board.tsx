"use client";

import { closestCenter, DndContext, DragEndEvent, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deleteScheduleAction, moveScheduleAction } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { StatusPill } from "@/components/status-pill";

type ScheduleItem = {
  id: number;
  teacher: string;
  weekday: number;
  shift: "PAGI" | "SIANG";
  start: string;
  end: string;
};

type Day = { value: number; label: string };

function initials(name: string) {
  return name.split(" ").map((word) => word[0]).join("").slice(0, 2);
}

function ScheduleEntry({ item, dayLabel, disabled }: { item: ScheduleItem; dayLabel: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, data: { weekday: item.weekday }, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return <div ref={setNodeRef} style={style} className={`schedule-entry${isDragging ? " is-dragging" : ""}`}>
    <button className="schedule-drag-handle" type="button" aria-label={`Pindahkan jadwal ${item.teacher}`} title="Seret untuk memindahkan jadwal" disabled={disabled} {...attributes} {...listeners}><GripVertical aria-hidden="true" /></button>
    <span className="avatar">{initials(item.teacher)}</span>
    <div><strong>{item.teacher}</strong><small>{item.start.slice(0, 5)}–{item.end.slice(0, 5)}</small></div>
    <StatusPill tone="info">{item.shift}</StatusPill>
    <form action={deleteScheduleAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton label={`Hapus jadwal ${item.teacher}`} title="Hapus jadwal piket?" description="Jadwal akan langsung hilang dari penugasan mingguan." message={`Hapus jadwal ${item.teacher} pada hari ${dayLabel}, shift ${item.shift.toLowerCase()}?`} confirmLabel="Hapus jadwal" /></form>
  </div>;
}

function ScheduleDay({ day, items, disabled }: { day: Day; items: ScheduleItem[]; disabled: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${day.value}`, data: { weekday: day.value } });
  return <section ref={setNodeRef} className={`schedule-day${isOver ? " is-drop-target" : ""}`}>
    <header><strong>{day.label}</strong><span>{items.length} petugas</span></header>
    <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
      {items.map((item) => <ScheduleEntry item={item} dayLabel={day.label} disabled={disabled} key={item.id} />)}
    </SortableContext>
    {!items.length && <p className="day-empty">{isOver ? "Lepaskan di sini" : "Belum ada petugas"}</p>}
  </section>;
}

export function ScheduleBoard({ schedules, days }: { schedules: ScheduleItem[]; days: Day[] }) {
  const [items, setItems] = useState(schedules);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeItem = useMemo(() => items.find((item) => item.id === activeId), [activeId, items]);

  function handleDragStart(event: { active: { id: string | number } }) {
    setError("");
    setActiveId(Number(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (isPending) return;
    const itemId = Number(event.active.id);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const targetWeekday = Number(event.over?.data.current?.weekday ?? event.over?.id?.toString().replace("day-", ""));
    if (!Number.isInteger(targetWeekday) || targetWeekday < 1 || targetWeekday > 6 || targetWeekday === item.weekday) return;

    const previousWeekday = item.weekday;
    setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, weekday: targetWeekday } : entry));
    startTransition(async () => {
      const result = await moveScheduleAction(itemId, targetWeekday);
      if (result.error) {
        setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, weekday: previousWeekday } : entry));
        setError(result.error);
      }
    });
  }

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
    {error && <p className="schedule-board-message error" role="alert">{error}</p>}
    <div className={`schedule-board${isPending ? " is-saving" : ""}`} aria-busy={isPending}>
      {days.map((day) => <ScheduleDay key={day.value} day={day} items={items.filter((item) => item.weekday === day.value)} disabled={isPending} />)}
    </div>
    <DragOverlay>{activeItem ? <div className="schedule-entry schedule-entry-overlay"><span className="avatar">{initials(activeItem.teacher)}</span><div><strong>{activeItem.teacher}</strong><small>{activeItem.start.slice(0, 5)}–{activeItem.end.slice(0, 5)}</small></div><StatusPill tone="info">{activeItem.shift}</StatusPill></div> : null}</DragOverlay>
  </DndContext>;
}
