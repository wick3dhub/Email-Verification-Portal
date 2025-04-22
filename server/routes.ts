import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
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
        expireDays: z.number().int().min(1).default(7)
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
        
        // Generate the URL for client
        generatedLinks.push({
          email: verificationLink.email,
          code: verificationLink.code,
          url: `/verify/${verificationLink.code}`,
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
  app.post("/api/verification/resend", async (req: Request, res: Response) => {
    try {
      const { email, useCustomTemplate = false } = req.body;
      
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
      
      // Get verification URL
      const verificationUrl = `${req.protocol}://${req.get('host')}/verify/${verificationLink.code}`;
      
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
              url: `/verify/${verificationLink.code}`,
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
        url: `/verify/${verificationLink.code}`,
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
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      return res.status(200).json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      return res.status(500).json({ message: "Failed to fetch settings" });
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
        encryptionSalt: z.string().optional()
      });
      
      const validatedData = settingsSchema.parse(req.body);
      const updatedSettings = await storage.updateSettings(validatedData);
      
      return res.status(200).json(updatedSettings);
    } catch (error) {
      console.error("Error updating settings:", error);
      return res.status(400).json({ message: "Invalid settings data" });
    }
  });
  
  // Download verification links as text file
  app.post("/api/verification/download", async (req: Request, res: Response) => {
    try {
      const { links } = req.body;
      
      if (!links || !Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ message: "No links provided" });
      }
      
      const baseUrl = process.env.BASE_URL || req.get('host') || 'localhost:5000';
      const linkTexts = links.map(link => `${baseUrl}/verify/${link.code}`).join('\n');
      
      res.status(200).json({ content: linkTexts });
    } catch (error) {
      console.error("Error generating download file:", error);
      return res.status(500).json({ message: "Failed to generate download file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
