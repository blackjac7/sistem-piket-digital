ALTER TYPE "public"."user_role" ADD VALUE 'WAKASEK_KURIKULUM' BEFORE 'GURU_PIKET';--> statement-breakpoint
CREATE TABLE "duty_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer,
	"teacher_id" integer NOT NULL,
	"completed_by" integer,
	"duty_date" date NOT NULL,
	"shift" "shift_type" NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "duty_schedule_unique";--> statement-breakpoint
ALTER TABLE "duty_schedules" ADD COLUMN "inactive_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duty_completions" ADD CONSTRAINT "duty_completions_schedule_id_duty_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."duty_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_completions" ADD CONSTRAINT "duty_completions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_completions" ADD CONSTRAINT "duty_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duty_completion_unique" ON "duty_completions" USING btree ("teacher_id","duty_date","shift");--> statement-breakpoint
CREATE INDEX "duty_completion_date_idx" ON "duty_completions" USING btree ("duty_date");--> statement-breakpoint
CREATE INDEX "duty_schedule_lookup_idx" ON "duty_schedules" USING btree ("teacher_id","weekday","shift");