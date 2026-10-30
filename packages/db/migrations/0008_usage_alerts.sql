CREATE TABLE "usage_alert" (
	"organization_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"metric" text NOT NULL,
	"threshold" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_alert" ADD CONSTRAINT "usage_alert_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_alert_unique_idx" ON "usage_alert" USING btree ("organization_id","period_start","metric","threshold");