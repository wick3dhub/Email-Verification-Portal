import { sqliteTable, text, integer, blob, integer as sqliteInteger } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const verificationLinks = sqliteTable("verification_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
  renewalRequested: integer("renewal_requested").notNull().default(0), // SQLite does not have boolean, use integer 0/1
  redirectUrl: text("redirect_url"),
});

export const insertVerificationLinkSchema = createInsertSchema(verificationLinks).pick({
  email: true,
  code: true,
  status: true,
  expiresAt: true,
  redirectUrl: true,
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  redirectUrl: text("redirect_url").notNull().default(""),
  showLoadingSpinner: integer("show_loading_spinner").notNull().default(1),
  loadingDuration: integer("loading_duration").notNull().default(3),
  successMessage: text("success_message").notNull().default("Thank you for verifying your email address!"),
  useEmailAutograb: integer("use_email_autograb").notNull().default(0),
  emailAutograbParam: text("email_autograb_param").notNull().default("email"),
  enableBotProtection: integer("enable_bot_protection").notNull().default(1),
  customThankYouPage: text("custom_thank_you_page").notNull().default(""),
  useCustomThankYouPage: integer("use_custom_thank_you_page").notNull().default(0),
  securityLevel: integer("security_level").notNull().default(1),
  useWildcards: integer("use_wildcards").notNull().default(0),
  encryptionSalt: text("encryption_salt").notNull().default(""),
  allowLinkRenewal: integer("allow_link_renewal").notNull().default(1),
  useCustomDomain: integer("use_custom_domain").notNull().default(0),
  customDomain: text("custom_domain").notNull().default(""),
  domainCnameTarget: text("domain_cname_target").notNull().default(""),
  domainVerificationToken: text("domain_verification_token").notNull().default(""),
  domainVerified: integer("domain_verified").notNull().default(0),
  additionalDomains: text("additional_domains").notNull().default("[]"),
  emailSubject: text("email_subject").notNull().default("Please verify your email address"),
  emailTemplate: text("email_template").notNull().default("Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal"),
  senderEmail: text("sender_email").notNull().default("no-reply@wick3d-links.com"),
  senderName: text("sender_name").notNull().default("Wick3d Link Portal"),
  smtpServer: text("smtp_server").notNull().default("localhost"),
  smtpPort: integer("smtp_port").notNull().default(25),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),
  useSocks5Proxy: integer("use_socks5_proxy").notNull().default(0),
  socks5Host: text("socks5_host").notNull().default(""),
  socks5Port: integer("socks5_port").notNull().default(1080),
  socks5Username: text("socks5_username").notNull().default(""),
  socks5Password: text("socks5_password").notNull().default(""),
  socks5MaxAttempts: integer("socks5_max_attempts").notNull().default(300),
  savedTemplates: text("saved_templates").notNull().default("[]"),
  useTelegramNotifications: integer("use_telegram_notifications").notNull().default(0),
  telegramBotToken: text("telegram_bot_token").notNull().default(""),
  telegramChatId: text("telegram_chat_id").notNull().default(""),
  enableRateLimiting: integer("enable_rate_limiting").notNull().default(1),
  rateLimitWindow: integer("rate_limit_window").notNull().default(15),
  rateLimitMaxRequests: integer("rate_limit_max_requests").notNull().default(100),
  rateLimitBlockDuration: integer("rate_limit_block_duration").notNull().default(30),
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
  allowLinkRenewal: true,
  useCustomDomain: true,
  customDomain: true,
  domainCnameTarget: true,
  domainVerificationToken: true,
  domainVerified: true,
  additionalDomains: true,
  emailSubject: true,
  emailTemplate: true,
  senderEmail: true,
  senderName: true,
  smtpServer: true,
  smtpPort: true,
  smtpUser: true,
  smtpPassword: true,
  useSocks5Proxy: true,
  socks5Host: true,
  socks5Port: true,
  socks5Username: true,
  socks5Password: true,
  socks5MaxAttempts: true,
  savedTemplates: true,
  useTelegramNotifications: true,
  telegramBotToken: true,
  telegramChatId: true,
  enableRateLimiting: true,
  rateLimitWindow: true,
  rateLimitMaxRequests: true,
  rateLimitBlockDuration: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type VerificationLink = typeof verificationLinks.$inferSelect;
export type InsertVerificationLink = z.infer<typeof insertVerificationLinkSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingsSchema>;
