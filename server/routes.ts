import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import os from "os";
import type { Setting } from "@shared/schema";
import { domainTracker } from "./services/domainTracker";
import { getDomainReputation } from './services/domainReputation';
import { verifyDomainOwnership, generateVerificationToken } from './services/domainVerifier';

// This file uses the domainTracker service to improve domain verification reliability
// The tracker ensures domain/verification-token pairs are properly tracked between frontend and backend
// throughout the TXT record verification process, regardless of database sync timing.

// Define interface for domain objects
interface DomainInfo {
  domain: string;
  verificationToken: string;
  verified: boolean;
}

// Helper function to check TXT records using multiple DNS providers
async function checkTxtRecords(domain: string, verificationToken: string) {
  const dns = await import('dns');
  const util = await import('util');
  const resolveTxt = util.promisify(dns.resolveTxt);
  
  let txtRecords: string[][] = [];
  const errorMessages: string[] = [];
  let verified = false;
  
  // Method 1: Standard Node.js DNS resolution for TXT records
  try {
    console.log(`🔍 Method 1: Resolving TXT records using Node DNS for: ${domain}`);
    txtRecords = await resolveTxt(domain);
    console.log(`🔍 DNS TXT record resolution result for ${domain}:`, txtRecords);
  } catch (nodeErr: any) {
    console.log(`🔍 Node DNS TXT resolution failed for ${domain}: ${nodeErr.message}`);
    errorMessages.push(`Node DNS resolution: ${nodeErr.message}`);
  }
  
  // Method 2: Public DNS API - Google DNS API
  if (txtRecords.length === 0) {
    try {
      console.log(`🔍 Method 2: Trying Google DNS API for TXT records of ${domain}...`);
      const response = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`);
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const googleRecords = dnsData.Answer
          .filter((record: any) => record.type === 16) // Type 16 is TXT
          .map((record: any) => [record.data.replace(/\.$/, '').replace(/^"(.*)"$/, '$1')]); // Remove trailing dot and quotes
          
        console.log(`🔍 Google DNS API TXT records for ${domain}:`, googleRecords);
        
        if (googleRecords.length > 0) {
          txtRecords = googleRecords;
        }
      }
    } catch (googleErr: any) {
      console.log(`🔍 Google DNS API TXT check failed: ${googleErr.message}`);
      errorMessages.push(`Google DNS API: ${googleErr.message}`);
    }
  }
  
  // Method 3: CloudFlare DNS API (as a backup)
  if (txtRecords.length === 0) {
    try {
      console.log(`🔍 Method 3: Trying Cloudflare DNS API for TXT records of ${domain}...`);
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
        headers: { 'Accept': 'application/dns-json' }
      });
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const cloudflareRecords = dnsData.Answer
          .filter((record: any) => record.type === 16) // Type 16 is TXT
          .map((record: any) => [record.data.replace(/\.$/, '').replace(/^"(.*)"$/, '$1')]); // Remove trailing dot and quotes
          
        console.log(`🔍 Cloudflare DNS API TXT records for ${domain}:`, cloudflareRecords);
        
        if (cloudflareRecords.length > 0) {
          txtRecords = cloudflareRecords;
        }
      }
    } catch (cfErr: any) {
      console.log(`🔍 Cloudflare DNS API TXT check failed: ${cfErr.message}`);
      errorMessages.push(`Cloudflare DNS API: ${cfErr.message}`);
    }
  }
  
  // Log all TXT records found
  console.log(`🔍 All TXT records for ${domain}:`, txtRecords);
  
  // Check if any of the TXT records match our verification token
  verified = txtRecords.some(record => {
    // Compare normalized records (no trailing dots, lowercase)
    const normalizedRecord = Array.isArray(record) ? record.join('').toLowerCase() : record.toLowerCase();
    const normalizedToken = verificationToken.toLowerCase();
    
    // Flexible matching - accept partial matches
    const isExactMatch = normalizedRecord === normalizedToken;
    const isPartialMatch = normalizedRecord.includes(normalizedToken) || 
                          normalizedToken.includes(normalizedRecord);
    
    console.log(`🔍 Comparing: [${normalizedRecord}] with token [${normalizedToken}]:`);
    console.log(`🔍 - Exact match: ${isExactMatch}`);
    console.log(`🔍 - Partial match: ${isPartialMatch}`);
    
    return isExactMatch || isPartialMatch;
  });
  
  console.log(`${verified ? '✅' : '❌'} Domain ${domain} verification result: ${verified ? 'VERIFIED' : 'NOT VERIFIED'}`);
  
  return {
    verified,
    records: txtRecords,
    errors: errorMessages,
    details: {
      foundRecords: txtRecords,
      expectedToken: verificationToken,
      methods: [
        { name: 'Node.js DNS', successful: errorMessages.length === 0 || errorMessages[0].includes('Node DNS') === false },
        { name: 'Google DNS API', successful: errorMessages.length <= 1 || errorMessages[1].includes('Google DNS') === false },
        { name: 'Cloudflare DNS API', successful: errorMessages.length <= 2 || errorMessages[2].includes('Cloudflare DNS') === false }
      ]
    }
  };
}

/**
 * Background verification for domains
 * Attempts to verify a domain's TXT record repeatedly without blocking the user
 * @param domain Domain to verify
 * @param verificationToken Expected TXT record verification token (format: wick3d-verification=TOKEN)
 * @param attempts Current attempt count (used for recursion)
 * @param maxAttempts Maximum number of verification attempts
 * @param delayMs Delay between verification attempts in milliseconds
 */
async function verifyDomainInBackground(
  domain: string, 
  verificationToken: string, 
  attempts: number = 0, 
  maxAttempts: number = 30, 
  delayMs: number = 20000 // Default 20s between attempts
) {
  console.log(`[Background Verification] Starting for domain ${domain} with verification token ${verificationToken} (attempt ${attempts+1}/${maxAttempts})`);
  // Skip if reached max attempts
  if (attempts >= maxAttempts) {
    console.log(`Maximum verification attempts (${maxAttempts}) reached for domain: ${domain}`);
    return;
  }
  
  console.log(`[Background Verification] Checking domain ${domain} (attempt ${attempts + 1}/${maxAttempts})`);
  
  try {
    // First check our tracker for the domain
    const trackedDomain = domainTracker.getDomain(domain);
    if (trackedDomain && trackedDomain.verified) {
      console.log(`[Background Verification] Domain ${domain} is already verified in our tracker`);
      return;
    }
    
    // Also check database settings
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
    
    // Log the current settings state to help debug
    console.log(`[Background Verification] Primary domain: ${settings.customDomain}, Checking: ${domain}`);
    console.log(`[Background Verification] Additional domains: ${settings.additionalDomains}`);
    
    // If tracked domain exists, use that information instead
    if (trackedDomain) {
      console.log(`[Background Verification] Using tracked domain data: ${trackedDomain.domain} with verification token ${trackedDomain.verificationToken}`);
      // Use the tracker's verification token, but we'll still continue with verification
    } 
    // If it's not the primary domain, find it in the additional domains
    else if (!isPrimaryDomain) {
      console.log(`[Background Verification] Looking for ${domain} in additional domains`);
      
      // Check each domain in the additionalDomains array
      const domainInfo = additionalDomains.find(d => {
        console.log(`[Background Verification] Comparing with: ${JSON.stringify(d)}`);
        return d && typeof d === 'object' && d.domain === domain;
      });
      
      if (!domainInfo) {
        console.error(`Domain ${domain} not found in settings during verification`);
        return;
      }
      
      // If domain is already verified, no need to continue
      if (domainInfo.verified) {
        console.log(`Domain ${domain} is already verified in database settings`);
        // Add to tracker as verified
        const verificationToken = domainInfo.verificationToken || domainInfo.cnameTarget; // Support both formats
        domainTracker.addDomain(domain, verificationToken, false);
        domainTracker.markVerified(domain);
        return;
      }
      
      // Make sure this domain is in our tracker
      if (!trackedDomain) {
        const verificationToken = domainInfo.verificationToken || domainInfo.cnameTarget; // Support both formats
        domainTracker.addDomain(domain, verificationToken, false);
        console.log(`[Background Verification] Added domain ${domain} to tracker from additional domains`);
      }
    } else if (settings.domainVerified) {
      // Primary domain is already verified
      console.log(`Primary domain ${domain} is already verified in database settings`);
      // Add to tracker as verified if not already there
      if (!trackedDomain) {
        const verificationToken = settings.domainVerificationToken || settings.domainCnameTarget || 'verified'; // Support both formats
        domainTracker.addDomain(domain, verificationToken, true);
        domainTracker.markVerified(domain);
        console.log(`[Background Verification] Added verified primary domain ${domain} to tracker`);
      }
      return;
    } else if (!trackedDomain) {
      // Primary domain but not verified and not in tracker yet
      const verificationToken = settings.domainVerificationToken || settings.domainCnameTarget || 'pending-verification'; // Support both formats
      domainTracker.addDomain(domain, verificationToken, true);
      console.log(`[Background Verification] Added primary domain ${domain} to tracker`);
    }
    
    // Import domain verifier service
    const { verifyDomainOwnership } = await import('./services/domainVerifier');
    const trackedDomainInfo = trackedDomain || domainTracker.getDomain(domain);
    const verificationToken = trackedDomainInfo?.verificationToken || 'wick3d-verification=unknown';

    try {
      // Check domain ownership using TXT record verification
      console.log(`[Background Verification] Attempting domain verification for ${domain} using token ${verificationToken}...`);
      const verificationResult = await verifyDomainOwnership(domain, verificationToken);
      
      console.log(`[Background Verification] Verification results for ${domain}:`, {
        verified: verificationResult.verified,
        foundRecords: verificationResult.records
      });
      
      // Simply use the result from the verifier service
      const verified = verificationResult.verified;
      
      if (verified) {
        console.log(`[Background Verification] Domain ${domain} verified successfully!`);
        
        // Update our domain tracker
        domainTracker.markVerified(domain);
        console.log(`[Background Verification] Domain ${domain} marked as verified in domain tracker`);
        
        // Update verification status in the database
        if (isPrimaryDomain) {
          console.log(`[Background Verification] Updating primary domain verification status`);
          // Update primary domain status
          await storage.updateSettings({
            domainVerified: true
          });
          
          // Verify the update was successful
          const updatedSettings = await storage.getSettings();
          console.log(`[Background Verification] Primary domain verification updated:`, 
            updatedSettings ? { domainVerified: updatedSettings.domainVerified } : 'Settings not found');
        } else {
          console.log(`[Background Verification] Updating additional domain verification status`);
          // Update additional domain status with robust handling
          let updatedDomains = [...additionalDomains]; // Ensure we have a copy
          
          // Check if domain exists in the list
          const domainExists = additionalDomains.some(d => d.domain === domain);
          if (!domainExists) {
            console.log(`[Background Verification] Domain ${domain} not found in additional domains, adding it`);
            updatedDomains.push({
              domain,
              verificationToken,
              verified: true,
              verifiedAt: new Date().toISOString(),
              addedAt: new Date().toISOString()
            });
          } else {
            // Update existing domain
            updatedDomains = additionalDomains.map(d => {
              if (d.domain === domain) {
                console.log(`[Background Verification] Setting domain ${domain} as verified in additional domains`);
                return {
                  ...d,
                  verified: true,
                  verifiedAt: new Date().toISOString()
                };
              }
              return d;
            });
          }
          
          console.log(`[Background Verification] Saving updated additional domains:`, updatedDomains);
          
          // Get the freshest settings before updating
          const freshSettings = await storage.getSettings();
          const currentJson = freshSettings?.additionalDomains || '[]';
          
          console.log(`[Background Verification] Current domains before update: ${currentJson}`);
          
          await storage.updateSettings({
            additionalDomains: JSON.stringify(updatedDomains)
          });
          
          // Verify the update was successful
          const updatedSettings = await storage.getSettings();
          console.log(`[Background Verification] Additional domains updated:`, 
            updatedSettings ? updatedSettings.additionalDomains : 'Settings not found');
        }
        return; // Successfully verified, exit the function
      }
    } catch (dnsError: any) {
      // DNS error - TXT record not found or still propagating
      console.log(`[Background Verification] DNS error for ${domain}: ${dnsError.message}`);
    }
    
    // Schedule next verification attempt with exponential backoff
    const nextDelay = Math.min(delayMs * 1.5, 300000); // Cap at 5 minutes
    console.log(`[Background Verification] Will try again in ${nextDelay / 1000}s`);
    
    setTimeout(() => {
      verifyDomainInBackground(domain, verificationToken, attempts + 1, maxAttempts, nextDelay);
    }, delayMs);
  } catch (error) {
    console.error(`[Background Verification] Error verifying domain ${domain}:`, error);
    
    // Continue with retry despite error
    setTimeout(() => {
      verifyDomainInBackground(domain, verificationToken, attempts + 1, maxAttempts, delayMs);
    }, delayMs);
  }
}

// Helper function to determine the appropriate domain for verification links
async function getVerificationDomain(req: Request, domainOption: string = 'default'): Promise<string> {
  try {
    const settings = await storage.getSettings();
    const defaultDomain = req.get('host') || 'localhost:5000';
    
    // If custom domains are disabled, return default domain
    if (!settings?.useCustomDomain) {
      return defaultDomain;
    }
    
    // Handle special domain options
    if (domainOption === 'default') {
      // For default option, use primary domain if verified
      if (settings.customDomain && settings.domainVerified) {
        return settings.customDomain;
      }
      return defaultDomain;
    } 
    
    // Check for specific domain request
    if (domainOption !== 'random' && domainOption !== 'default') {
      // First check if the domain is in our tracker and verified
      const trackedDomain = domainTracker.getDomain(domainOption);
      if (trackedDomain && trackedDomain.verified) {
        console.log(`Using verified tracked domain: ${trackedDomain.domain}`);
        return trackedDomain.domain;
      }
      
      // User is requesting a specific domain - check if it's the primary and verified
      if (domainOption === settings.customDomain && settings.domainVerified) {
        return settings.customDomain;
      }
      
      // Check additional domains
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        const requestedDomain = additionalDomains.find((d: any) => 
          d.domain === domainOption && d.verified === true
        );
        
        if (requestedDomain) {
          // Add to tracker if not already there
          if (!trackedDomain) {
            const verificationToken = requestedDomain.verificationToken || requestedDomain.cnameTarget || 'verified-domain';
            domainTracker.addDomain(requestedDomain.domain, verificationToken, false);
            domainTracker.markVerified(requestedDomain.domain);
          }
          return requestedDomain.domain;
        }
      } catch (err) {
        console.error("Error parsing additional domains for domain selection:", err);
      }
    }
    
    // For random option or if specific domain wasn't found, get a random verified domain
    if (domainOption === 'random' || domainOption !== 'default') {
      const verifiedDomains = [];
      
      // First get all verified domains from our tracker
      const allTrackedDomains = domainTracker.getAllDomains();
      for (const domain of allTrackedDomains) {
        if (domain.verified) {
          verifiedDomains.push(domain.domain);
        }
      }
      
      // If no verified domains in tracker, check settings
      if (verifiedDomains.length === 0) {
        // Add primary domain if verified
        if (settings.customDomain && settings.domainVerified) {
          verifiedDomains.push(settings.customDomain);
        }
        
        // Add verified additional domains
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          for (const domain of additionalDomains) {
            if (domain.verified === true) {
              verifiedDomains.push(domain.domain);
            }
          }
        } catch (err) {
          console.error("Error parsing additional domains for random selection:", err);
        }
      }
      
      // If we have verified domains, pick a random one
      if (verifiedDomains.length > 0) {
        const randomIndex = Math.floor(Math.random() * verifiedDomains.length);
        return verifiedDomains[randomIndex];
      }
    }
    
    // Fallback to default if no suitable domain found
    return defaultDomain;
  } catch (error) {
    console.error("Error getting verification domain:", error);
    // Fallback to request host
    return req.get('host') || 'localhost:5000';
  }
}

import { handleDomainCheck } from "./routes/domainCheck";

export async function registerRoutes(app: Express, requireAuth?: (req: Request, res: Response, next: NextFunction) => void): Promise<Server> {
  // Initialize domain tracker with existing domains from database
  try {
    const settings = await storage.getSettings();
    if (settings) {
      // Add primary domain if it exists
      if (settings.customDomain) {
        console.log(`Adding primary domain to tracker: ${settings.customDomain}`);
        const verificationToken = settings.domainVerificationToken || settings.domainCnameTarget || 'primary-domain';
        domainTracker.addDomain(
          settings.customDomain, 
          verificationToken, 
          true
        );
        
        // Mark as verified if applicable
        if (settings.domainVerified) {
          console.log(`Marking primary domain as verified in tracker: ${settings.customDomain}`);
          domainTracker.markVerified(settings.customDomain);
        }
      }
      
      // Add additional domains if they exist
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        if (additionalDomains && additionalDomains.length) {
          console.log(`Found ${additionalDomains.length} additional domains to add to tracker`);
          for (const domain of additionalDomains) {
            if (domain && domain.domain) {
              console.log(`Adding additional domain to tracker: ${domain.domain}`);
              const verificationToken = domain.verificationToken || domain.cnameTarget || 'additional-domain';
              domainTracker.addDomain(
                domain.domain, 
                verificationToken, 
                false
              );
              
              // Mark as verified if applicable
              if (domain.verified) {
                console.log(`Marking additional domain as verified in tracker: ${domain.domain}`);
                domainTracker.markVerified(domain.domain);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error parsing additional domains during tracker initialization:`, e);
      }
    }
  } catch (e) {
    console.error(`Error initializing domain tracker:`, e);
  }
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
    const user = await storage.getUserByUsername(username);
    // Hash the input password before comparing
    const { createHash } = await import("crypto");
    const hashedInput = createHash('sha256').update(password).digest('hex');
    // Debug log
    console.log('LOGIN DEBUG:', { username, password, hashedInput, user });
    if (!user || user.password !== hashedInput) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    return res.status(200).json({ 
      id: user.id,
      username: user.username
    });
  });
  
  // Update admin credentials endpoint
  app.post("/api/auth/update-credentials", requireAuth ? requireAuth : (req, res, next) => next(), async (req: Request, res: Response) => {
    try {
      const { currentUsername, currentPassword, newUsername, newPassword } = req.body;
      if (!currentUsername || !currentPassword || !newUsername || !newPassword) {
        return res.status(400).json({ 
          success: false,
          message: "All fields are required: currentUsername, currentPassword, newUsername, newPassword" 
        });
      }
      // First verify the current credentials
      const user = await storage.getUserByUsername(currentUsername);
      const { createHash } = await import("crypto");
      const hashedCurrent = createHash('sha256').update(currentPassword).digest('hex');
      if (!user || user.password !== hashedCurrent) {
        return res.status(401).json({ 
          success: false,
          message: "Current credentials are invalid" 
        });
      }
      // Check if new username already exists (and it's not the current user)
      if (newUsername !== currentUsername) {
        const existingUser = await storage.getUserByUsername(newUsername);
        if (existingUser) {
          return res.status(400).json({ 
            success: false,
            message: "This username is already taken" 
          });
        }
      }
      // Hash the new password before saving
      const hashedNew = createHash('sha256').update(newPassword).digest('hex');
      // Update the user credentials
      if ('updateUser' in storage) {
        await (storage as any).updateUser(user.id, {
          username: newUsername,
          password: hashedNew
        });
      } else {
        await storage.createUser({
          username: newUsername,
          password: hashedNew
        });
      }
      return res.status(200).json({ 
        success: true, 
        message: "Credentials updated successfully",
        username: newUsername
      });
    } catch (error) {
      console.error("Error updating admin credentials:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update credentials. Please try again."
      });
    }
  });
  
  // Email batch processing and verification link generation
  app.post("/api/verification/generate", requireAuth ? requireAuth : (req, res, next) => next(), async (req: Request, res: Response) => {
    try {
      const emailBatchSchema = z.object({
        emails: z.string().nonempty(),
        expireDays: z.number().int().min(1).default(7),
        domain: z.string().optional().default('default'),
        redirectUrl: z.string().optional() // Allow custom redirect URL for this batch
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
          expiresAt,
          redirectUrl: validatedData.redirectUrl // Store the session-specific redirect URL
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
  app.get("/api/verification/links", requireAuth ? requireAuth : (req, res, next) => next(), async (req: Request, res: Response) => {
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
  app.post("/api/verification/clear", requireAuth ? requireAuth : (req, res, next) => next(), async (req: Request, res: Response) => {
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
      const { email, useCustomTemplate = false, domain: domainOption = 'default', redirectUrl } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Calculate new expiration date (7 days by default)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      // Generate new code with enhanced security
      const code = await storage.generateVerificationCode();
      
      // If no redirectUrl is provided, try to find a previous link to use its redirectUrl
      let customRedirectUrl = redirectUrl;
      if (!customRedirectUrl) {
        const existingLinks = await storage.getVerificationLinksByEmail(email);
        if (existingLinks.length > 0) {
          // Use the most recent link's redirectUrl if it exists
          customRedirectUrl = existingLinks[0].redirectUrl;
        }
      }
      
      // Create new verification link
      const verificationLink = await storage.createVerificationLink({
        email,
        code,
        expiresAt,
        redirectUrl: customRedirectUrl
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
        // Get link-specific redirectUrl if available, or use global settings
        const redirectUrl = link.redirectUrl || settings?.redirectUrl;
        
        // Return response requiring bot check but don't verify yet
        return res.status(200).json({
          success: true,
          botProtectionRequired: true,
          email: link.email,
          settings,
          redirectUrl
        });
      }
      
      // If we reached here, either bot protection is disabled or the check passed
      
      // Mark as verified
      await storage.updateVerificationLinkStatus(link.id, 'verified', new Date());
      
      // Use link-specific redirectUrl if available, otherwise use global setting
      const redirectUrl = link.redirectUrl || settings?.redirectUrl;
      
      return res.status(200).json({ 
        success: true,
        botProtectionRequired: false,
        email: link.email,
        settings,
        redirectUrl // Include the redirectUrl in the response
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

  // Get all domains with reputation scores
  app.get("/api/domains", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
      }
      
      const defaultDomain = req.get('host') || 'localhost:5000';
      const domains = [];
      
      // Add default domain
      domains.push({
        id: 'default',
        name: defaultDomain,
        type: 'default'
      });
      
      // Detailed list of all domains (including unverified) for admin purposes
      const allDomains = [];
      
      // Track domains we've already added to avoid duplicates
      const addedDomains = new Set<string>();
      
      // Get domains from the tracker first
      const trackedDomains = domainTracker.getAllDomains();
      console.log(`Found ${trackedDomains.length} domains in tracker`);
      
      // First check specifically for neareastdance.com which might be missing
      const neareastDomain = trackedDomains.find(d => d.domain === 'neareastdance.com');
      if (neareastDomain) {
        allDomains.push({
          domain: 'neareastdance.com',
          isPrimary: true,
          cnameTarget: neareastDomain.verificationToken,
          verified: neareastDomain.verified
        });
        addedDomains.add('neareastdance.com');
        console.log('Manually added neareastdance.com to domain list');
      }
      
      // Add all tracked domains that aren't already added
      trackedDomains.forEach(trackedDomain => {
        if (!addedDomains.has(trackedDomain.domain)) {
          allDomains.push({
            domain: trackedDomain.domain,
            isPrimary: trackedDomain.isPrimary || false,
            cnameTarget: trackedDomain.verificationToken,
            verified: trackedDomain.verified || false
          });
          addedDomains.add(trackedDomain.domain);
          console.log(`Added tracked domain: ${trackedDomain.domain}`);
        }
      });
      
      // Add primary domain if set and not already added
      if (settings.customDomain && !addedDomains.has(settings.customDomain)) {
        allDomains.push({
          domain: settings.customDomain,
          isPrimary: true,
          cnameTarget: settings.domainCnameTarget,
          verified: settings.domainVerified
        });
        addedDomains.add(settings.customDomain);
        console.log(`Added primary domain: ${settings.customDomain}`);
      }
      
      // Add additional domains from settings that aren't already added
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        
        if (Array.isArray(additionalDomains)) {
          additionalDomains.forEach(domainEntry => {
            let domainName;
            
            if (typeof domainEntry === 'string') {
              // Old format
              domainName = domainEntry;
              if (!addedDomains.has(domainName)) {
                allDomains.push({
                  domain: domainName,
                  isPrimary: false,
                  verified: false,
                  needsMigration: true
                });
                addedDomains.add(domainName);
                console.log(`Added old format domain: ${domainName}`);
              }
            } else {
              // New format
              domainName = domainEntry.domain;
              if (domainName && !addedDomains.has(domainName)) {
                allDomains.push({
                  domain: domainName,
                  isPrimary: false,
                  cnameTarget: domainEntry.cnameTarget,
                  verified: domainEntry.verified
                });
                addedDomains.add(domainName);
                console.log(`Added new format domain: ${domainName}`);
              }
            }
          });
        }
      } catch (err) {
        console.error("Error parsing additional domains:", err);
      }
      
      // Add reputation data to each domain
      for (const domain of allDomains) {
        // Check if the domain already has reputation data in our tracker
        const trackedDomain = domainTracker.getDomain(domain.domain);
        
        // If domain has reputation data in tracker, use it
        if (trackedDomain && trackedDomain.reputation) {
          domain.reputation = {
            score: trackedDomain.reputation.score,
            risk: trackedDomain.reputation.risk,
            lastChecked: new Date(trackedDomain.reputation.lastChecked).toISOString(),
            source: trackedDomain.reputation.source
          };
          
          // Add visual indicator
          domain.indicator = {
            color: trackedDomain.reputation.score >= 70 ? 'green' : 
                   (trackedDomain.reputation.score >= 40 ? 'yellow' : 'red'),
            label: trackedDomain.reputation.score >= 70 ? 'Good' : 
                   (trackedDomain.reputation.score >= 40 ? 'Medium' : 'Poor')
          };
        } else {
          // Default "unknown" reputation
          domain.reputation = {
            score: 50,
            risk: 'unknown',
            lastChecked: null,
            source: 'none'
          };
          
          domain.indicator = {
            color: 'gray',
            label: 'Unknown'
          };
        }
      }
      
      // Sort domains: primary first, then by verification status (verified first)
      allDomains.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        return 0;
      });
      
      return res.status(200).json({
        success: true,
        domains,
        all: allDomains
      });
    } catch (error) {
      console.error("Error fetching domains with reputation:", error);
      return res.status(500).json({ 
        success: false,
        message: "Failed to fetch domains"
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
  


  // Add domain endpoint - adds the domain and generates a random CNAME target
  app.post("/api/domain/add", async (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      
      if (!domain) {
        console.log("Domain add error: No domain provided");
        return res.status(400).json({ 
          success: false,
          message: "Domain is required" 
        });
      }
      
      console.log(`🌐 Adding domain: ${domain}`);
      
      // Simple domain validation
      if (!domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/)) {
        console.log(`❌ Domain validation failed for: ${domain}`);
        return res.status(400).json({
          success: false,
          message: "Invalid domain format"
        });
      }
      
      // Get existing settings
      const settings = await storage.getSettings();
      
      if (!settings) {
        console.log("❌ Domain add error: No settings found in database");
        return res.status(404).json({ 
          success: false,
          message: "Settings not found" 
        });
      }
      
      // Log current domains before adding
      try {
        console.log(`🌐 Current primary domain: "${settings.customDomain}"`);
        console.log(`🌐 Current CNAME target: "${settings.domainCnameTarget}"`);
        console.log(`🌐 Domain verification status: ${settings.domainVerified}`);
        
        const additionalDomainsRaw = settings.additionalDomains || '[]';
        console.log(`🌐 Additional domains before adding: ${additionalDomainsRaw}`);
      } catch (e) {
        console.log(`Error logging current domains: ${e}`);
      }
      
      // Generate a verification token for TXT record
      const verificationToken = generateVerificationToken(domain);
      console.log(`🌐 Generated verification token: ${verificationToken}`);
      
      // Check if this is the first domain being added
      if (!settings.customDomain || settings.customDomain === '') {
        console.log(`🌐 Adding as primary domain: ${domain}`);
        
        // Update settings with new domain as the primary domain (unverified initially)
        await storage.updateSettings({
          customDomain: domain,
          domainVerificationToken: verificationToken, // Use verification token instead of CNAME
          domainVerified: false, // Always start unverified
          useCustomDomain: true
        });
        
        // Double-check that domain was stored properly by getting settings again
        const afterUpdate = await storage.getSettings();
        console.log(`✅ Primary domain set to: ${afterUpdate?.customDomain}`);
        console.log(`✅ Primary domain verification token: ${afterUpdate?.domainVerificationToken}`);
        console.log(`✅ Primary domain verified: ${afterUpdate?.domainVerified}`);
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
          (d: any) => typeof d === 'object' && d.domain === domain
        );
        
        if (existingDomainIndex >= 0) {
          // Update existing domain record with new verification token
          additionalDomains[existingDomainIndex] = {
            domain,
            verificationToken,
            verified: false, // Reset verification status with new token
            addedAt: new Date().toISOString()
          };
        } else {
          // Add new domain record
          additionalDomains.push({
            domain,
            verificationToken,
            verified: false,
            addedAt: new Date().toISOString()
          });
        }
        
        // Update settings with additional domains
        await storage.updateSettings({
          additionalDomains: JSON.stringify(additionalDomains),
          useCustomDomain: true // Make sure custom domains are enabled
        });
        
        // Double-check that additional domains were stored properly
        const afterUpdate = await storage.getSettings();
        console.log(`✅ Additional domains updated: ${afterUpdate?.additionalDomains}`);
      }
      
      // Get updated settings
      const finalSettings = await storage.getSettings();
      
      // Store domain in our tracker for consistent verification
      const isPrimaryDomain = (!settings.customDomain || settings.customDomain === '' || settings.customDomain === domain);
      domainTracker.addDomain(domain, verificationToken, isPrimaryDomain);
      console.log(`✅ Added domain ${domain} to tracker with verification token ${verificationToken} (isPrimary: ${isPrimaryDomain})`);
      
      // IMPORTANT: Domain is saved but not verified yet. 
      // We need to wait for the admin to configure DNS before trying verification.
      console.log(`✅ Domain saved successfully. To verify, add TXT record then use the verify button.`);
      
      // Return success with verification token information for admin to configure
      return res.status(200).json({
        success: true,
        message: "Domain added successfully. Please add the TXT record as shown below.",
        domain: domain,
        verificationToken: verificationToken,
        instructions: `Create a TXT record for ${domain} with the value: ${verificationToken}`,
        verificationStatus: "pending",
        autoVerified: false,
        note: "After you configure your domain's DNS, click the 'Verify' button to check your configuration.",
        settings: finalSettings // Include updated settings so frontend can use this data
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
  // Get domain reputation from various sources
  app.get("/api/domain/reputation/:domain", async (req: Request, res: Response) => {
    try {
      const { domain } = req.params;
      const forceRefresh = req.query.refresh === 'true';
      
      if (!domain) {
        return res.status(400).json({
          success: false,
          message: "Domain parameter is required"
        });
      }
      
      console.log(`Checking reputation for domain: ${domain}, force refresh: ${forceRefresh}`);
      
      // Get domain reputation data
      const reputation = await getDomainReputation(domain, forceRefresh);
      
      // Add the domain to our tracker if it's not already there
      let trackedDomain = domainTracker.getDomain(domain);
      if (!trackedDomain) {
        // If not in tracker, add it with a placeholder CNAME target
        domainTracker.addDomain(domain, 'reputation-check', false);
        trackedDomain = domainTracker.getDomain(domain);
      }
      
      // Update the domain reputation in our tracker
      domainTracker.updateDomainReputation(domain, reputation);
      
      return res.status(200).json({
        success: true,
        domain,
        reputation: {
          score: reputation.score,
          risk: reputation.risk,
          lastChecked: new Date(reputation.lastChecked).toISOString(),
          source: reputation.source,
          details: reputation.details
        },
        // Add visual indicator based on score
        indicator: {
          color: reputation.score >= 70 ? 'green' : (reputation.score >= 40 ? 'yellow' : 'red'),
          label: reputation.score >= 70 ? 'Good' : (reputation.score >= 40 ? 'Medium' : 'Poor')
        }
      });
    } catch (error) {
      console.error(`Error checking domain reputation:`, error);
      return res.status(500).json({
        success: false,
        message: "Failed to check domain reputation. Please try again later."
      });
    }
  });

  // Force verify a domain (for testing and administrative purposes)
  app.post("/api/domain/force-verify", async (req: Request, res: Response) => {
    try {
      const { domain, forceVerify = true } = req.body;
      
      if (!domain) {
        return res.status(400).json({
          success: false,
          message: "Domain is required"
        });
      }
      
      console.log(`⭐ Force-verifying domain ${domain}`);
      
      // Get settings
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(404).json({
          success: false,
          message: "Settings not found"
        });
      }
      
      // Check if this is the primary domain
      if (settings.customDomain === domain) {
        // Update primary domain verification status
        await storage.updateSettings({
          domainVerified: true,
          useCustomDomain: true
        });
        
        console.log(`⭐ Force-verified primary domain ${domain}`);
      } else {
        // Check in additional domains
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          
          // Find and update the specific domain
          const updatedDomains = additionalDomains.map((d: any) => {
            if (typeof d === 'object' && d.domain === domain) {
              return {
                ...d,
                verified: true
              };
            }
            return d;
          });
          
          await storage.updateSettings({
            additionalDomains: JSON.stringify(updatedDomains)
          });
          
          console.log(`⭐ Force-verified additional domain ${domain}`);
        } catch (err) {
          console.error("Error updating additional domain:", err);
          return res.status(500).json({
            success: false,
            message: "Failed to force-verify domain"
          });
        }
      }
      
      // Update in domain tracker
      const trackedDomain = domainTracker.getDomain(domain);
      if (trackedDomain) {
        domainTracker.markVerified(domain);
        console.log(`⭐ Marked domain ${domain} as verified in tracker`);
      } else {
        // If not in tracker, add it with verification token from settings or a placeholder
        const verificationToken = domain === settings.customDomain ? 
          settings.domainVerificationToken || 'force-verified' :
          'force-verified';
        
        domainTracker.addDomain(domain, verificationToken, domain === settings.customDomain);
        domainTracker.markVerified(domain);
        console.log(`⭐ Added and verified domain ${domain} in tracker`);
      }
      
      // Get updated settings
      const updatedSettings = await storage.getSettings();
      
      return res.status(200).json({
        success: true,
        message: `Domain ${domain} force-verified successfully`,
        domain,
        verified: true,
        settings: updatedSettings
      });
    } catch (error) {
      console.error("Error force-verifying domain:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to force-verify domain"
      });
    }
  });

  // Update domain CNAME target - for use with curl or API clients
  app.post("/api/domain/update-cname", async (req: Request, res: Response) => {
    try {
      const { domain, cnameTarget } = req.body;
      
      if (!domain || !cnameTarget) {
        return res.status(400).json({
          success: false,
          message: "Domain and CNAME target are required"
        });
      }
      
      console.log(`Updating CNAME target for domain ${domain} to ${cnameTarget}`);
      
      // Get settings
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(404).json({
          success: false,
          message: "Settings not found"
        });
      }
      
      // Variable to track if domain was found and updated
      let domainUpdated = false;
      
      // Check if this is the primary domain
      const isPrimaryDomain = settings.customDomain === domain;
      console.log(`Is primary domain check: ${domain} === ${settings.customDomain} = ${isPrimaryDomain}`);
      
      if (isPrimaryDomain) {
        // Update primary domain CNAME target
        await storage.updateSettings({
          domainCnameTarget: cnameTarget,
          customDomain: domain // Ensure domain is set correctly
        });
        
        domainUpdated = true;
        console.log(`Updated primary domain ${domain} CNAME target to ${cnameTarget}`);
      } else {
        // Check in additional domains
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          const domainExists = additionalDomains.some((d: any) => 
            typeof d === 'object' && d.domain === domain
          );
          
          console.log(`Domain ${domain} exists in additional domains: ${domainExists}`);
          
          if (domainExists) {
            // Update in additional domains
            const updatedDomains = additionalDomains.map((d: any) => {
              if (typeof d === 'object' && d.domain === domain) {
                return {
                  ...d,
                  cnameTarget,
                  verified: false // Reset verification when CNAME changes
                };
              }
              return d;
            });
            
            await storage.updateSettings({
              additionalDomains: JSON.stringify(updatedDomains)
            });
            
            domainUpdated = true;
            console.log(`Updated additional domain ${domain} CNAME target to ${cnameTarget}`);
          } else {
            // If not found but has empty primary domain, make this the primary
            if (!settings.customDomain) {
              await storage.updateSettings({
                customDomain: domain,
                domainCnameTarget: cnameTarget,
                domainVerified: false,
                useCustomDomain: true
              });
              
              domainUpdated = true;
              console.log(`Set ${domain} as primary domain with CNAME target ${cnameTarget}`);
            } else {
              // Add to additional domains if not found anywhere
              console.log(`Adding ${domain} to additional domains with CNAME ${cnameTarget}`);
              additionalDomains.push({
                domain,
                cnameTarget,
                verified: false,
                addedAt: new Date().toISOString()
              });
              
              await storage.updateSettings({
                additionalDomains: JSON.stringify(additionalDomains),
                useCustomDomain: true
              });
              
              domainUpdated = true;
              console.log(`Added ${domain} to additional domains with CNAME ${cnameTarget}`);
            }
          }
        } catch (err) {
          console.error("Error updating additional domain:", err);
          
          // Add as new domain if JSON parsing failed
          try {
            await storage.updateSettings({
              additionalDomains: JSON.stringify([{
                domain,
                cnameTarget,
                verified: false,
                addedAt: new Date().toISOString()
              }])
            });
            
            domainUpdated = true;
            console.log(`Added ${domain} as first additional domain with CNAME ${cnameTarget}`);
          } catch (innerErr) {
            console.error("Failed to add domain as additional domain:", innerErr);
            return res.status(500).json({
              success: false,
              message: "Failed to update or add domain"
            });
          }
        }
      }
      
      // If domain wasn't found and updated, return error
      if (!domainUpdated) {
        console.log(`Unable to update domain ${domain} - not found in any settings`);
        return res.status(404).json({
          success: false,
          message: "Domain not found in settings"
        });
      }
      
      // Update domain tracker
      console.log(`Updating domain tracker for ${domain} with CNAME ${cnameTarget}`);
      domainTracker.addDomain(domain, cnameTarget, isPrimaryDomain);
      
      // Start background verification with the updated CNAME target
      console.log(`Starting background verification for ${domain} with CNAME ${cnameTarget}`);
      setTimeout(() => {
        verifyDomainInBackground(domain, cnameTarget);
      }, 2000);
      
      // In development mode, auto-verify the domain
      if (process.env.NODE_ENV === 'development') {
        console.log(`Development mode: Auto-verifying domain ${domain}`);
        
        // Set a timeout to simulate verification after a few seconds
        setTimeout(async () => {
          try {
            // Mark as verified in tracker
            domainTracker.markDomainAsVerified(domain);
            console.log(`Development mode: Marked ${domain} as verified in tracker`);
            
            // Update settings to mark domain as verified
            if (isPrimaryDomain) {
              await storage.updateSettings({
                domainVerified: true,
                useCustomDomain: true
              });
              console.log(`Development mode: Marked primary domain ${domain} as verified in settings`);
            } else {
              try {
                const updatedSettings = await storage.getSettings();
                if (updatedSettings) {
                  const additionalDomains = JSON.parse(updatedSettings.additionalDomains || '[]');
                  
                  const updatedDomains = additionalDomains.map((d: any) => {
                    if (typeof d === 'object' && d.domain === domain) {
                      return {
                        ...d,
                        verified: true
                      };
                    }
                    return d;
                  });
                  
                  await storage.updateSettings({
                    additionalDomains: JSON.stringify(updatedDomains)
                  });
                  console.log(`Development mode: Marked additional domain ${domain} as verified in settings`);
                }
              } catch (err) {
                console.error("Development mode: Error updating domain verification status:", err);
              }
            }
          } catch (err) {
            console.error("Development mode: Error auto-verifying domain:", err);
          }
        }, 5000);
      }
      
      // Get updated settings to return to the client
      const updatedSettings = await storage.getSettings();
      
      return res.status(200).json({
        success: true,
        message: "Domain CNAME target updated successfully",
        domain,
        cnameTarget,
        isPrimaryDomain,
        verificationInProgress: true,
        autoVerifyInDev: process.env.NODE_ENV === 'development',
        settings: updatedSettings
      });
    } catch (error) {
      console.error("Error updating domain CNAME target:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update domain CNAME target"
      });
    }
  });

  // Real-time domain verification endpoint
  app.post("/api/domain/check", handleDomainCheck);

  app.post("/api/settings", requireAuth ? requireAuth : (req, res, next) => next(), async (req: Request, res: Response) => {
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
      
      // Get custom redirect URL if provided
      const redirectUrl = req.body.redirectUrl;
      
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
            expiresAt,
            redirectUrl // Include custom redirectUrl if provided
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
  // Debug endpoint for domain tracker
  app.get("/api/debug/domain-tracker", async (req: Request, res: Response) => {
    try {
      const trackedDomains = domainTracker.getAllDomains();
      console.log("Domain tracker content:", JSON.stringify(trackedDomains));
      
      // Get settings to compare with tracker
      const settings = await storage.getSettings();
      
      return res.status(200).json({
        success: true,
        domains: trackedDomains,
        settings: {
          customDomain: settings?.customDomain,
          useCustomDomain: settings?.useCustomDomain,
          domainVerified: settings?.domainVerified,
          verificationToken: settings?.domainVerificationToken,
          additionalDomains: settings?.additionalDomains
        }
      });
    } catch (error) {
      console.error("Error getting domain tracker data:", error);
      return res.status(500).json({
        success: false,
        error: "Error retrieving domain tracker data"
      });
    }
  });

  // Debug endpoint to list all users and their password hashes
  app.get("/api/debug/users", async (req: Request, res: Response) => {
    try {
      const storageAny = storage as any;
      if (!('getAllUsers' in storageAny)) {
        // Fallback: scan IDs 1-10
        const users = [];
        for (let i = 1; i <= 10; i++) {
          const user = await storageAny.getUser(i);
          if (user) users.push(user);
        }
        return res.status(200).json(users);
      }
      const users = await storageAny.getAllUsers();
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  return httpServer;
}
