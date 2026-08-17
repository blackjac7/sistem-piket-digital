ALTER TABLE "audit_logs" ADD COLUMN "request_id" varchar(36);--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_request_id_unique" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "duty_schedule_active_unique" ON "duty_schedules" USING btree ("teacher_id","weekday","shift") WHERE "duty_schedules"."is_active" = true;