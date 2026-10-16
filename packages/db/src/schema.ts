import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

export * from "./auth-schema";

/** One Clicky install: an app (or environment) belonging to an organization. */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull().unique(),
    allowedOrigins: text("allowed_origins").array().notNull().default([]),
    /** ProjectSettings from @clicky/shared; always read through parseProjectSettings. */
    settings: jsonb("settings").notNull().default({}),
    /** Last time the SDK successfully initialised from an allowed origin. */
    lastSeenAt: timestamp("last_seen_at"),
    lastSeenUrl: text("last_seen_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_organizationId_idx").on(table.organizationId)],
);

export const projectRelations = relations(project, ({ one }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
}));
