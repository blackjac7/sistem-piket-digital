CREATE TYPE "public"."enrollment_outcome" AS ENUM('AKTIF', 'NAIK', 'TINGGAL', 'LULUS', 'PINDAH');--> statement-breakpoint
CREATE TYPE "public"."student_gender" AS ENUM('L', 'P');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('AKTIF', 'LULUS', 'PINDAH');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL,
	"start_year" integer NOT NULL,
	"end_year" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"academic_year_id" integer NOT NULL,
	"outcome" "enrollment_outcome" DEFAULT 'AKTIF' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_class_id_school_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "gender" "student_gender";--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "parent_name" varchar(120);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "parent_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "status" "student_status" DEFAULT 'AKTIF' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_name_unique" ON "academic_years" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_enrollment_year_unique" ON "student_enrollments" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "student_enrollment_class_idx" ON "student_enrollments" USING btree ("class_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE set null ON UPDATE no action;