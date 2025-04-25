/**
 * Domain Verification Service
 * 
 * This service provides real-time domain verification using multiple DNS resolution methods
 * for maximum compatibility and reliability.
 */
import crypto from 'crypto';

/**
 * Verify a domain's CNAME configuration using multiple DNS providers
 * This uses three different DNS resolution methods for maximum compatibility:
 * 1. Node.js DNS module
 * 2. Google DNS API
 * 3. Cloudflare DNS API
 * 
 * @param domain Domain to verify
 * @param cnameTarget Expected CNAME target
 * @returns Object containing verification result and details
 */
export async function verifyDomainCname(domain: string, cnameTarget: string) {
  const dns = await import('dns');
  const util = await import('util');
  const resolveCname = util.promisify(dns.resolveCname);
  
  let cnameRecords: string[] = [];
  const errorMessages: string[] = [];
  let verified = false;
  
  // Method 1: Standard Node.js DNS resolution
  try {
    console.log(`🔍 Method 1: Resolving CNAME records using Node DNS for: ${domain}`);
    cnameRecords = await resolveCname(domain);
    console.log(`🔍 DNS resolution result for ${domain}:`, cnameRecords);
  } catch (nodeErr: any) {
    console.log(`🔍 Node DNS resolution failed for ${domain}: ${nodeErr.message}`);
    errorMessages.push(`Node DNS resolution: ${nodeErr.message}`);
  }
  
  // Method 2: Public DNS API - Google DNS API
  if (cnameRecords.length === 0) {
    try {
      console.log(`🔍 Method 2: Trying Google DNS API for ${domain}...`);
      const response = await fetch(`https://dns.google/resolve?name=${domain}&type=CNAME`);
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const googleRecords = dnsData.Answer
          .filter((record: any) => record.type === 5) // Type 5 is CNAME
          .map((record: any) => record.data.replace(/\.$/, '')); // Remove trailing dot
          
        console.log(`🔍 Google DNS API records for ${domain}:`, googleRecords);
        
        if (googleRecords.length > 0) {
          cnameRecords = googleRecords;
        }
      }
    } catch (googleErr: any) {
      console.log(`🔍 Google DNS API check failed: ${googleErr.message}`);
      errorMessages.push(`Google DNS API: ${googleErr.message}`);
    }
  }
  
  // Method 3: CloudFlare DNS API (as a backup)
  if (cnameRecords.length === 0) {
    try {
      console.log(`🔍 Method 3: Trying Cloudflare DNS API for ${domain}...`);
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CNAME`, {
        headers: { 'Accept': 'application/dns-json' }
      });
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const cloudflareRecords = dnsData.Answer
          .filter((record: any) => record.type === 5) // Type 5 is CNAME
          .map((record: any) => record.data.replace(/\.$/, '')); // Remove trailing dot
          
        console.log(`🔍 Cloudflare DNS API records for ${domain}:`, cloudflareRecords);
        
        if (cloudflareRecords.length > 0) {
          cnameRecords = cloudflareRecords;
        }
      }
    } catch (cfErr: any) {
      console.log(`🔍 Cloudflare DNS API check failed: ${cfErr.message}`);
      errorMessages.push(`Cloudflare DNS API: ${cfErr.message}`);
    }
  }
  
  // Log all CNAME records found
  console.log(`🔍 All CNAME records for ${domain}:`, cnameRecords);
  
  // Check if any of the CNAME records match our target
  verified = cnameRecords.some(record => {
    // Compare normalized records (no trailing dots, lowercase)
    const normalizedRecord = record.toLowerCase().replace(/\.$/, '');
    const normalizedTarget = cnameTarget.toLowerCase().replace(/\.$/, '');
    
    // Flexible matching - accept partial matches
    const isExactMatch = normalizedRecord === normalizedTarget;
    const isPartialMatch = normalizedRecord.includes(normalizedTarget) || 
                         normalizedTarget.includes(normalizedRecord);
    
    console.log(`🔍 Comparing: [${normalizedRecord}] with target [${normalizedTarget}]:`);
    console.log(`🔍 - Exact match: ${isExactMatch}`);
    console.log(`🔍 - Partial match: ${isPartialMatch}`);
    
    return isExactMatch || isPartialMatch;
  });
  
  console.log(`${verified ? '✅' : '❌'} Domain ${domain} verification result: ${verified ? 'VERIFIED' : 'NOT VERIFIED'}`);
  
  return {
    verified,
    records: cnameRecords,
    errors: errorMessages,
    details: {
      foundRecords: cnameRecords,
      expectedTarget: cnameTarget,
      methods: [
        { name: 'Node.js DNS', successful: errorMessages.length === 0 || errorMessages[0].includes('Node DNS') === false },
        { name: 'Google DNS API', successful: errorMessages.length <= 1 || errorMessages[1].includes('Google DNS') === false },
        { name: 'Cloudflare DNS API', successful: errorMessages.length <= 2 || errorMessages[2].includes('Cloudflare DNS') === false }
      ]
    }
  };
}

/**
 * Generate a random CNAME target for domains
 * @returns Random CNAME target in format "wick3d-xxxxxxxx.replit.app"
 */
export function generateCnameTarget(): string {
  // Using Node.js crypto for random bytes
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `wick3d-${randomHex}.replit.app`;
}