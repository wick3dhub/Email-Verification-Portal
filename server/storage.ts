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
import { eq, and, desc } from "drizzle-orm";
import crypto from 'crypto';
import { generateSecureCode } from './encryption';

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Verification link operations
  createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink>;
  getVerificationLinkByCode(code: string): Promise<VerificationLink | undefined>;
  getVerificationLinksByEmail(email: string): Promise<VerificationLink[]>;
  getAllVerificationLinks(): Promise<VerificationLink[]>;
  updateVerificationLinkStatus(id: number, status: string, verifiedAt?: Date): Promise<VerificationLink | undefined>;
  
  // Settings operations
  getSettings(): Promise<Setting | undefined>;
  updateSettings(data: Partial<InsertSetting>): Promise<Setting>;
  
  // Helper for generating verification codes
  generateVerificationCode(): Promise<string>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private verificationLinks: Map<number, VerificationLink>;
  private settingsData: Setting | undefined;
  private userCurrentId: number;
  private verificationLinkCurrentId: number;
  private settingsCurrentId: number;

  constructor() {
    this.users = new Map();
    this.verificationLinks = new Map();
    this.userCurrentId = 1;
    this.verificationLinkCurrentId = 1;
    this.settingsCurrentId = 1;
    
    // Initialize with admin user
    this.createUser({
      username: "admin@example.com",
      password: "password123"
    });
    
    // Initialize with default settings
    this.settingsData = {
      id: this.settingsCurrentId++,
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
      // Custom message settings
      emailSubject: "Please verify your email address",
      emailTemplate: "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
      smtpServer: "localhost",
      smtpPort: 25,
      smtpUser: "",
      smtpPassword: "",
      senderEmail: "no-reply@wick3d-links.com",
      senderName: "Wick3d Link Portal"
    };
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Verification link operations
  async createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink> {
    const id = this.verificationLinkCurrentId++;
    const verificationLink: VerificationLink = {
      ...data,
      id,
      status: 'pending',
      createdAt: new Date(),
      verifiedAt: null
    };
    this.verificationLinks.set(id, verificationLink);
    return verificationLink;
  }
  
  async getVerificationLinkByCode(code: string): Promise<VerificationLink | undefined> {
    return Array.from(this.verificationLinks.values()).find(
      (link) => link.code === code
    );
  }
  
  async getVerificationLinksByEmail(email: string): Promise<VerificationLink[]> {
    return Array.from(this.verificationLinks.values()).filter(
      (link) => link.email === email
    );
  }
  
  async getAllVerificationLinks(): Promise<VerificationLink[]> {
    return Array.from(this.verificationLinks.values());
  }
  
  async updateVerificationLinkStatus(id: number, status: string, verifiedAt: Date | undefined = undefined): Promise<VerificationLink | undefined> {
    const verificationLink = this.verificationLinks.get(id);
    if (verificationLink) {
      const updatedLink: VerificationLink = {
        ...verificationLink,
        status,
        verifiedAt: verifiedAt || verificationLink.verifiedAt
      };
      this.verificationLinks.set(id, updatedLink);
      return updatedLink;
    }
    return undefined;
  }
  
  // Settings operations
  async getSettings(): Promise<Setting | undefined> {
    return this.settingsData;
  }
  
  async updateSettings(data: Partial<InsertSetting>): Promise<Setting> {
    if (!this.settingsData) {
      // Create default settings if they don't exist
      this.settingsData = {
        id: this.settingsCurrentId++,
        redirectUrl: data.redirectUrl || "",
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
        // Custom email settings
        emailSubject: data.emailSubject || "Please verify your email address",
        emailTemplate: data.emailTemplate || "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
        smtpServer: data.smtpServer || "localhost",
        smtpPort: data.smtpPort || 25,
        smtpUser: data.smtpUser || "",
        smtpPassword: data.smtpPassword || "",
        senderEmail: data.senderEmail || "no-reply@wick3d-links.com",
        senderName: data.senderName || "Wick3d Link Portal"
      };
    } else {
      // Update existing settings
      this.settingsData = {
        ...this.settingsData,
        redirectUrl: data.redirectUrl !== undefined ? data.redirectUrl : this.settingsData.redirectUrl,
        showLoadingSpinner: data.showLoadingSpinner !== undefined ? data.showLoadingSpinner : this.settingsData.showLoadingSpinner,
        loadingDuration: data.loadingDuration !== undefined ? data.loadingDuration : this.settingsData.loadingDuration,
        successMessage: data.successMessage !== undefined ? data.successMessage : this.settingsData.successMessage,
        useEmailAutograb: data.useEmailAutograb !== undefined ? data.useEmailAutograb : this.settingsData.useEmailAutograb,
        emailAutograbParam: data.emailAutograbParam !== undefined ? data.emailAutograbParam : this.settingsData.emailAutograbParam,
        enableBotProtection: data.enableBotProtection !== undefined ? data.enableBotProtection : this.settingsData.enableBotProtection,
        customThankYouPage: data.customThankYouPage !== undefined ? data.customThankYouPage : this.settingsData.customThankYouPage,
        useCustomThankYouPage: data.useCustomThankYouPage !== undefined ? data.useCustomThankYouPage : this.settingsData.useCustomThankYouPage,
        securityLevel: data.securityLevel !== undefined ? data.securityLevel : this.settingsData.securityLevel,
        useWildcards: data.useWildcards !== undefined ? data.useWildcards : this.settingsData.useWildcards,
        encryptionSalt: data.encryptionSalt !== undefined ? data.encryptionSalt : this.settingsData.encryptionSalt,
        // Email settings
        emailSubject: data.emailSubject !== undefined ? data.emailSubject : this.settingsData.emailSubject,
        emailTemplate: data.emailTemplate !== undefined ? data.emailTemplate : this.settingsData.emailTemplate,
        smtpServer: data.smtpServer !== undefined ? data.smtpServer : this.settingsData.smtpServer,
        smtpPort: data.smtpPort !== undefined ? data.smtpPort : this.settingsData.smtpPort,
        smtpUser: data.smtpUser !== undefined ? data.smtpUser : this.settingsData.smtpUser,
        smtpPassword: data.smtpPassword !== undefined ? data.smtpPassword : this.settingsData.smtpPassword,
        senderEmail: data.senderEmail !== undefined ? data.senderEmail : this.settingsData.senderEmail,
        senderName: data.senderName !== undefined ? data.senderName : this.settingsData.senderName
      };
    }
    
    return this.settingsData;
  }
  
  // Helper method to generate verification codes with enhanced security
  async generateVerificationCode(): Promise<string> {
    const settings = await this.getSettings();
    if (settings && settings.securityLevel > 1) {
      // Use advanced encryption if security level is greater than 1
      try {
        return generateSecureCode(settings);
      } catch (error) {
        console.warn("Failed to generate secure code for MemStorage, falling back to simple code", error);
      }
    }
    
    // Fallback to simple code generation
    return crypto.randomBytes(16).toString('hex');
  }
}

export class DatabaseStorage implements IStorage {
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
    const [link] = await db
      .insert(verificationLinks)
      .values({
        ...data,
        status: 'pending',
        createdAt: new Date(),
        verifiedAt: null
      })
      .returning();
    return link;
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
        // Custom message settings
        emailSubject: "Please verify your email address",
        emailTemplate: "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
        smtpServer: "localhost",
        smtpPort: 25,
        smtpUser: "",
        smtpPassword: "",
        senderEmail: "no-reply@wick3d-links.com",
        senderName: "Wick3d Link Portal"
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
          // Custom message settings
          emailSubject: data.emailSubject || "Please verify your email address",
          emailTemplate: data.emailTemplate || "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
          smtpServer: data.smtpServer || "localhost",
          smtpPort: data.smtpPort || 25,
          smtpUser: data.smtpUser || "",
          smtpPassword: data.smtpPassword || "",
          senderEmail: data.senderEmail || "no-reply@wick3d-links.com",
          senderName: data.senderName || "Wick3d Link Portal"
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
          encryptionSalt: data.encryptionSalt !== undefined ? data.encryptionSalt : currentSetting.encryptionSalt
        })
        .where(eq(settings.id, currentSetting.id))
        .returning();
      return updatedSetting;
    }
  }
  
  // Helper method to generate verification codes with enhanced security
  async generateVerificationCode(): Promise<string> {
    const settings = await this.getSettings();
    if (settings && settings.securityLevel > 1) {
      // Use advanced encryption if security level is greater than 1
      try {
        return generateSecureCode(settings);
      } catch (error) {
        console.warn("Failed to generate secure code for DatabaseStorage, falling back to simple code", error);
      }
    }
    
    // Fallback to simple code generation
    return crypto.randomBytes(16).toString('hex');
  }
}

import { SecureStorage } from './secureStorage';

// Initialize storage with enhanced secure database implementation
export const storage = new SecureStorage();

// Create default admin user if it doesn't exist
(async () => {
  // Check if admin user exists
  const admin = await storage.getUserByUsername("admin@example.com");
  if (!admin) {
    // Create admin user
    await storage.createUser({
      username: "admin@example.com",
      password: "password123"
    });
    console.log("Default admin user created");
  }
})().catch(err => console.error("Error initializing database:", err));