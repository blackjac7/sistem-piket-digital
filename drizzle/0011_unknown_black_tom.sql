CREATE TYPE "public"."school_calendar_status" AS ENUM('LIBUR', 'TUTUP_DARURAT', 'KEGIATAN_KHUSUS', 'HARI_PENGGANTI');--> statement-breakpoint
CREATE TABLE "school_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "school_calendar_status" NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"schedule_weekday" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_calendar_date_order_check" CHECK ("school_calendar"."start_date" <= "school_calendar"."end_date"),
	CONSTRAINT "school_calendar_weekday_check" CHECK ("school_calendar"."schedule_weekday" IS NULL OR ("school_calendar"."schedule_weekday" BETWEEN 1 AND 6)),
	CONSTRAINT "school_calendar_replacement_weekday_check" CHECK (("school_calendar"."status" = 'HARI_PENGGANTI' AND "school_calendar"."schedule_weekday" IS NOT NULL) OR ("school_calendar"."status" <> 'HARI_PENGGANTI' AND "school_calendar"."schedule_weekday" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "school_calendar" ADD CONSTRAINT "school_calendar_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_calendar_date_idx" ON "school_calendar" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "school_calendar_active_idx" ON "school_calendar" USING btree ("is_active","is_published","start_date");
