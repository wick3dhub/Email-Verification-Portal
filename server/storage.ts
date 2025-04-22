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
import crypto from 'crypto';

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
  generateVerificationCode(): string;
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
      successMessage: "Thank you for verifying your email address!"
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
        successMessage: data.successMessage || "Thank you for verifying your email address!"
      };
    } else {
      // Update existing settings
      this.settingsData = {
        ...this.settingsData,
        redirectUrl: data.redirectUrl !== undefined ? data.redirectUrl : this.settingsData.redirectUrl,
        showLoadingSpinner: data.showLoadingSpinner !== undefined ? data.showLoadingSpinner : this.settingsData.showLoadingSpinner,
        loadingDuration: data.loadingDuration !== undefined ? data.loadingDuration : this.settingsData.loadingDuration,
        successMessage: data.successMessage !== undefined ? data.successMessage : this.settingsData.successMessage
      };
    }
    
    return this.settingsData;
  }
  
  // Helper method to generate verification codes
  generateVerificationCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}

export const storage = new MemStorage();
