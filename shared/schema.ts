import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const verificationLinks = pgTable("verification_links", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
});

export const insertVerificationLinkSchema = createInsertSchema(verificationLinks).pick({
  email: true,
  code: true,
  expiresAt: true,
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  redirectUrl: text("redirect_url").notNull().default(""),
  showLoadingSpinner: boolean("show_loading_spinner").notNull().default(true),
  loadingDuration: integer("loading_duration").notNull().default(3),
  successMessage: text("success_message").notNull().default("Thank you for verifying your email address!"),
  useEmailAutograb: boolean("use_email_autograb").notNull().default(false),
  emailAutograbParam: text("email_autograb_param").notNull().default("email"),
  enableBotProtection: boolean("enable_bot_protection").notNull().default(true),
  customThankYouPage: text("custom_thank_you_page").notNull().default(""),
  useCustomThankYouPage: boolean("use_custom_thank_you_page").notNull().default(false),
});

export const insertSettingsSchema = createInsertSchema(settings).pick({
  redirectUrl: true,
  showLoadingSpinner: true,
  loadingDuration: true,
  successMessage: true,
  useEmailAutograb: true,
  emailAutograbParam: true,
  enableBotProtection: true,
  customThankYouPage: true,
  useCustomThankYouPage: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type VerificationLink = typeof verificationLinks.$inferSelect;
export type InsertVerificationLink = z.infer<typeof insertVerificationLinkSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingsSchema>;
