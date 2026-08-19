CREATE TABLE "webauthn_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"challenge" text NOT NULL,
	"flow" varchar(20) NOT NULL,
	"user_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_token_unique" ON "webauthn_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expiry_idx" ON "webauthn_challenges" USING btree ("expires_at");