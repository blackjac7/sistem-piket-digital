ALTER TABLE "school_calendar" ADD CONSTRAINT "school_calendar_published_no_overlap" EXCLUDE USING gist (
	daterange("start_date", "end_date", '[]') WITH &&
) WHERE ("is_active" = true AND "is_published" = true);
