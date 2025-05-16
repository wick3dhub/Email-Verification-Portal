import { 
  users, 
  type User, 
  type InsertUser, 
  verificationLinks, 
  type VerificationLink, 
  type InsertVerificationLink,
  settings,
  type Setting,
  type InsertSetting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from 'crypto';
import { generateSecureCode } from './encryption';
import { IStorage } from './storage';

/**
 * Enhanced DatabaseStorage implementation with advanced security features
 * - Implements advanced encryption with 5 security levels
 * - Supports wildcard generation to avoid links being detected as threats
 * - Handles duplicate email detection and re-generation
 */
export class SecureStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
      
    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    console.log(`Successfully updated user credentials for ID ${id}`);
    return updatedUser;
  }
  
  // Verification link operations
  async createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink> {
    const existingLinks = await this.getVerificationLinksByEmail(data.email);
    const insertObj: InsertVerificationLink = {
      email: data.email ?? "",
      code: data.code ?? "",
      status: typeof data.status === "string" ? data.status : "pending",
      expiresAt: typeof data.expiresAt === "number"
        ? new Date(data.expiresAt)
        : data.expiresAt instanceof Date
          ? data.expiresAt
          : new Date(Date.now() + 24 * 60 * 60 * 1000),
      redirectUrl: data.redirectUrl ?? null
    };
    console.log('[createVerificationLink] Insert object:', insertObj);
    const [link] = await db
      .insert(verificationLinks)
      .values(insertObj)
      .returning();
    return {
      ...link,
      regenerated: existingLinks.length > 0
    } as VerificationLink;
  }
  
  async getVerificationLinkByCode(code: string): Promise<VerificationLink | undefined> {
    const [link] = await db
      .select()
      .from(verificationLinks)
      .where(eq(verificationLinks.code, code));
    return link || undefined;
  }
  
  async getVerificationLinksByEmail(email: string): Promise<VerificationLink[]> {
    return db
      .select()
      .from(verificationLinks)
      .where(eq(verificationLinks.email, email));
  }
  
  async getAllVerificationLinks(): Promise<VerificationLink[]> {
    return db
      .select()
      .from(verificationLinks)
      .orderBy(desc(verificationLinks.createdAt));
  }
  
  async updateVerificationLinkStatus(
    id: number, 
    status: string, 
    verifiedAt?: number,
    renewalRequested?: boolean
  ): Promise<VerificationLink | undefined> {
    const updateData: any = { 
      status,
    };
    if (verifiedAt !== undefined) {
      updateData.verifiedAt = verifiedAt;
    }
    if (renewalRequested !== undefined) {
      updateData.renewalRequested = renewalRequested ? 1 : 0;
      console.log(`[SecureStorage] Setting renewalRequested to ${renewalRequested} for link ID ${id}`);
    }
    console.log(`[SecureStorage] Update data for link ${id}:`, updateData);
    try {
      const [link] = await db
        .update(verificationLinks)
        .set(updateData)
        .where(eq(verificationLinks.id, id))
        .returning();
      console.log(`[SecureStorage] Updated link ${id}:`, link);
      return link || undefined;
    } catch (error) {
      console.error(`[SecureStorage] Error updating link ${id}:`, error);
      throw error;
    }
  }
  
  // Helper for cleaning up expired or old verification links
  async clearVerificationLinks(olderThanDays?: number): Promise<number> {
    if (olderThanDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const result = await db.delete(verificationLinks)
        .where(
          and(
            eq(verificationLinks.status, 'pending'),
            sql`${verificationLinks.createdAt} < ${cutoffDate.getTime()}`
          )
        )
        .returning({ id: verificationLinks.id });
        
      return result.length;
    } else {
      // Just delete all pending links if no date specified
      const result = await db.delete(verificationLinks)
        .where(eq(verificationLinks.status, 'pending'))
        .returning({ id: verificationLinks.id });
      
      return result.length;
    }
  }
  
  // Helper to get links grouped by creation date (session)
  async getVerificationLinksGroupedBySession(): Promise<{
    date: string;
    count: number;
    links: VerificationLink[];
  }[]> {
    const allLinks = await this.getAllVerificationLinks();
    // Group links by date (YYYY-MM-DD)
    const groupedLinks = new Map<string, VerificationLink[]>();
    allLinks.forEach(link => {
      // createdAt is number or null, fallback to 0 if null
      const dateKey = new Date(link.createdAt ?? 0).toISOString().split('T')[0];
      if (!groupedLinks.has(dateKey)) {
        groupedLinks.set(dateKey, []);
      }
      groupedLinks.get(dateKey)?.push(link);
    });
    // Convert map to array of objects
    const result = Array.from(groupedLinks.entries()).map(([date, links]) => ({
      date,
      count: links.length,
      links
    }));
    // Sort by date descending (newest first)
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  
  // Settings operations
  async getSettings(): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings);
    if (!setting) {
      // All booleans as 0/1, use camelCase keys
      return this.updateSettings({
        redirectUrl: "https://example.com/thank-you",
        showLoadingSpinner: 1,
        loadingDuration: 3,
        successMessage: "Thank you for verifying your email address!",
        useEmailAutograb: 0,
        emailAutograbParam: "email",
        enableBotProtection: 1,
        customThankYouPage: "",
        useCustomThankYouPage: 0,
        securityLevel: 1,
        useWildcards: 0,
        encryptionSalt: "default-salt-change-me",
        additionalDomains: "[]",
        enableRateLimiting: 1,
        rateLimitWindow: 15,
        rateLimitMaxRequests: 100,
        rateLimitBlockDuration: 30
      });
    }
    return setting;
  }
  
  async updateSettings(data: Partial<InsertSetting>): Promise<Setting> {
    // Check if settings exist
    const existingSettings = await db.select().from(settings);
    // Use camelCase keys and 0/1 for booleans
    const toDb = (v: any, fallback: any) => v !== undefined ? v : fallback;
    if (existingSettings.length === 0) {
      const [setting] = await db
        .insert(settings)
        .values({
          redirectUrl: toDb(data.redirectUrl, "https://example.com/thank-you"),
          showLoadingSpinner: toDb(data.showLoadingSpinner, 1),
          loadingDuration: toDb(data.loadingDuration, 3),
          successMessage: toDb(data.successMessage, "Thank you for verifying your email address!"),
          useEmailAutograb: toDb(data.useEmailAutograb, 0),
          emailAutograbParam: toDb(data.emailAutograbParam, "email"),
          enableBotProtection: toDb(data.enableBotProtection, 1),
          customThankYouPage: toDb(data.customThankYouPage, ""),
          useCustomThankYouPage: toDb(data.useCustomThankYouPage, 0),
          securityLevel: toDb(data.securityLevel, 1),
          useWildcards: toDb(data.useWildcards, 0),
          encryptionSalt: toDb(data.encryptionSalt, "default-salt-change-me"),
          additionalDomains: toDb(data.additionalDomains, "[]"),
          enableRateLimiting: toDb(data.enableRateLimiting, 1),
          rateLimitWindow: toDb(data.rateLimitWindow, 15),
          rateLimitMaxRequests: toDb(data.rateLimitMaxRequests, 100),
          rateLimitBlockDuration: toDb(data.rateLimitBlockDuration, 30)
        })
        .returning();
      return setting;
    } else {
      const [currentSetting] = existingSettings;
      const [updatedSetting] = await db
        .update(settings)
        .set({
          redirectUrl: toDb(data.redirectUrl, currentSetting.redirectUrl),
          showLoadingSpinner: toDb(data.showLoadingSpinner, currentSetting.showLoadingSpinner),
          loadingDuration: toDb(data.loadingDuration, currentSetting.loadingDuration),
          successMessage: toDb(data.successMessage, currentSetting.successMessage),
          useEmailAutograb: toDb(data.useEmailAutograb, currentSetting.useEmailAutograb),
          emailAutograbParam: toDb(data.emailAutograbParam, currentSetting.emailAutograbParam),
          enableBotProtection: toDb(data.enableBotProtection, currentSetting.enableBotProtection),
          customThankYouPage: toDb(data.customThankYouPage, currentSetting.customThankYouPage),
          useCustomThankYouPage: toDb(data.useCustomThankYouPage, currentSetting.useCustomThankYouPage),
          securityLevel: toDb(data.securityLevel, currentSetting.securityLevel),
          useWildcards: toDb(data.useWildcards, currentSetting.useWildcards),
          encryptionSalt: toDb(data.encryptionSalt, currentSetting.encryptionSalt),
          additionalDomains: toDb(data.additionalDomains, currentSetting.additionalDomains),
          enableRateLimiting: toDb(data.enableRateLimiting, currentSetting.enableRateLimiting),
          rateLimitWindow: toDb(data.rateLimitWindow, currentSetting.rateLimitWindow),
          rateLimitMaxRequests: toDb(data.rateLimitMaxRequests, currentSetting.rateLimitMaxRequests),
          rateLimitBlockDuration: toDb(data.rateLimitBlockDuration, currentSetting.rateLimitBlockDuration)
        })
        .where(eq(settings.id, currentSetting.id))
        .returning();
      return updatedSetting;
    }
  }
  
  // Helper method to generate verification codes with enhanced security
  async generateVerificationCode(): Promise<string> {
    const currentSettings = await this.getSettings();
    return generateSecureCode(currentSettings);
  }
}