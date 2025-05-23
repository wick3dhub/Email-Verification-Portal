/**
 * Domain check endpoint for real-time verification using TXT records
 */
import { Request, Response } from "express";
import { storage } from "../storage"; 
import { domainTracker } from "../services/domainTracker";
import { verifyDomainOwnership } from "../services/domainVerifier";

export async function handleDomainCheck(req: Request, res: Response) {
  try {
    const { domain } = req.body;
    
    console.log(`🔍 REAL-TIME Domain check request for: ${domain}`);
    
    if (!domain) {
      console.log("❌ Domain check error: No domain provided");
      return res.status(400).json({ 
        success: false,
        message: "Domain is required" 
      });
    }
    
    // Get existing settings
    const settings = await storage.getSettings();
    
    if (!settings) {
      console.log("❌ Domain check error: No settings found in database");
      return res.status(404).json({ 
        success: false,
        message: "Settings not found" 
      });
    }
    
    console.log(`🔍 Looking up domain: ${domain}`);
    console.log(`🔍 Current primary domain: "${settings.customDomain}"`);
    
    // Determine domain info (primary or additional)
    let isPrimaryDomain = settings.customDomain === domain;
    let verificationToken = settings.domainVerificationToken; // Using verificationToken instead of cnameTarget
    let domainFound = false;
    
    // Check if it's in domain tracker first (most reliable source)
    const trackedDomain = domainTracker.getDomain(domain);
    if (trackedDomain) {
      console.log(`🔍 Domain ${domain} found in tracker with token ${trackedDomain.verificationToken}`);
      verificationToken = trackedDomain.verificationToken;
      isPrimaryDomain = trackedDomain.isPrimary || false;
      domainFound = true;
    }
    // Check if it's the primary domain
    else if (isPrimaryDomain) {
      console.log(`🔍 Domain ${domain} is the primary domain with verification token ${verificationToken}`);
      domainFound = true;
    }
    // Check in additional domains
    else {
      try {
        const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
        const additionalDomain = additionalDomains.find((d: any) => 
          typeof d === 'object' && d.domain === domain
        );
        
        if (additionalDomain) {
          console.log(`🔍 Domain ${domain} found in additional domains with token ${additionalDomain.verificationToken}`);
          verificationToken = additionalDomain.verificationToken;
          domainFound = true;
        }
      } catch (err) {
        console.error("Error checking additional domains:", err);
      }
    }
    
    // If domain wasn't found anywhere, return error
    if (!domainFound) {
      console.log(`❌ Domain ${domain} not found in tracker or settings`);
      return res.status(404).json({
        success: false,
        message: "Domain not found. Please add it first."
      });
    }
    
    if (!verificationToken) {
      console.log(`❌ No verification token found for domain ${domain}`);
      return res.status(400).json({
        success: false,
        message: "No verification token found for this domain"
      });
    }
    
    console.log(`🔍 Performing real-time verification for ${domain} with token ${verificationToken}`);
    
    // Use our verification service
    const verificationResult = await verifyDomainOwnership(domain, verificationToken);
    
    // If verified, update domain status
    if (verificationResult.verified) {
      console.log(`✅ Domain ${domain} verified successfully!`);
      
      // Update domain tracker
      domainTracker.markVerified(domain);
      console.log(`✅ Domain tracker updated for ${domain}`);
      
      // Update settings
      if (isPrimaryDomain) {
        console.log(`✅ Updating primary domain verification status`);
        await storage.updateSettings({
          domainVerified: true,
          useCustomDomain: true
        });
      } else {
        console.log(`✅ Updating additional domain verification status`);
        try {
          const additionalDomains = JSON.parse(settings.additionalDomains || '[]');
          
          const updatedDomains = additionalDomains.map((d: any) => {
            if (typeof d === 'object' && d.domain === domain) {
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
        } catch (err) {
          console.error(`Error updating additional domain status:`, err);
        }
      }
      
      // Get updated settings
      const updatedSettings = await storage.getSettings();
      
      return res.status(200).json({
        success: true,
        domain,
        verificationToken,
        verified: true,
        message: "Domain verified successfully!",
        details: verificationResult.details,
        settings: updatedSettings
      });
    } else {
      // Not verified, return instructions
      console.log(`❌ Domain ${domain} verification failed`);
      
      return res.status(200).json({
        success: true,
        domain,
        verificationToken,
        verified: false,
        message: "Domain verification failed. Please check your DNS settings.",
        instructions: `Create a TXT record for ${domain} with the value: ${verificationToken}. DNS changes can take some time to propagate.`,
        details: verificationResult.details
      });
    }
  } catch (error) {
    console.error(`❌ Error checking domain:`, error);
    return res.status(500).json({
      success: false,
      message: "Server error while checking domain. Please try again later."
    });
  }
}