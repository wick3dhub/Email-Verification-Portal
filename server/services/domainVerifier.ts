/**
 * Domain Verification Service
 * 
 * This service provides simple, direct domain verification using TXT records 
 * which is more compatible with services like Cloudflare.
 */
import crypto from 'crypto';

/**
 * Verify a domain's ownership using TXT record verification
 * This uses multiple DNS resolution methods for maximum reliability:
 * 1. Node.js DNS module
 * 2. Google DNS API
 * 3. Cloudflare DNS API
 * 
 * @param domain Domain to verify
 * @param verificationToken The expected TXT record value
 * @returns Object containing verification result and details
 */
export async function verifyDomainOwnership(domain: string, verificationToken: string) {
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
    console.log(`🔍 DNS TXT resolution result for ${domain}:`, txtRecords);
  } catch (nodeErr: any) {
    console.log(`🔍 Node DNS resolution failed for ${domain}: ${nodeErr.message}`);
    errorMessages.push(`Node DNS resolution: ${nodeErr.message}`);
  }
  
  // Method 2: Public DNS API - Google DNS API for TXT records
  if (txtRecords.length === 0) {
    try {
      console.log(`🔍 Method 2: Trying Google DNS API for TXT records on ${domain}...`);
      const response = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`);
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const googleRecords = dnsData.Answer
          .filter((record: any) => record.type === 16) // Type 16 is TXT
          .map((record: any) => {
            // Google DNS API returns TXT record data as a single string, potentially with quotes
            const data = record.data.replace(/^"(.*)"$/, '$1');
            return [data];
          });
          
        console.log(`🔍 Google DNS API TXT records for ${domain}:`, googleRecords);
        
        if (googleRecords.length > 0) {
          txtRecords = googleRecords;
        }
      }
    } catch (googleErr: any) {
      console.log(`🔍 Google DNS API check failed: ${googleErr.message}`);
      errorMessages.push(`Google DNS API: ${googleErr.message}`);
    }
  }
  
  // Method 3: CloudFlare DNS API for TXT records
  if (txtRecords.length === 0) {
    try {
      console.log(`🔍 Method 3: Trying Cloudflare DNS API for TXT records on ${domain}...`);
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
        headers: { 'Accept': 'application/dns-json' }
      });
      const dnsData = await response.json();
      
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        const cloudflareRecords = dnsData.Answer
          .filter((record: any) => record.type === 16) // Type 16 is TXT
          .map((record: any) => {
            // Cloudflare DNS API returns TXT record data as a string, potentially with quotes
            const data = record.data.replace(/^"(.*)"$/, '$1');
            return [data];
          });
          
        console.log(`🔍 Cloudflare DNS API TXT records for ${domain}:`, cloudflareRecords);
        
        if (cloudflareRecords.length > 0) {
          txtRecords = cloudflareRecords;
        }
      }
    } catch (cfErr: any) {
      console.log(`🔍 Cloudflare DNS API check failed: ${cfErr.message}`);
      errorMessages.push(`Cloudflare DNS API: ${cfErr.message}`);
    }
  }
  
  // Flatten and normalize TXT records for easier checking
  const flatTxtRecords = txtRecords.flat().map(record => record.trim());
  console.log(`🔍 All flattened TXT records for ${domain}:`, flatTxtRecords);
  
  // Check if any of the TXT records contain our verification token
  verified = flatTxtRecords.some(record => {
    const recordContainsToken = record.includes(verificationToken);
    console.log(`🔍 Checking if record [${record}] contains token [${verificationToken}]: ${recordContainsToken}`);
    return recordContainsToken;
  });
  
  console.log(`${verified ? '✅' : '❌'} Domain ${domain} verification result: ${verified ? 'VERIFIED' : 'NOT VERIFIED'}`);
  
  return {
    verified,
    records: flatTxtRecords,
    errors: errorMessages,
    details: {
      foundRecords: flatTxtRecords,
      expectedToken: verificationToken,
      methods: [
        { name: 'Node.js DNS', successful: errorMessages.length === 0 || !errorMessages[0].includes('Node DNS') },
        { name: 'Google DNS API', successful: errorMessages.length <= 1 || !errorMessages[1]?.includes('Google DNS') },
        { name: 'Cloudflare DNS API', successful: errorMessages.length <= 2 || !errorMessages[2]?.includes('Cloudflare DNS') }
      ]
    }
  };
}

/**
 * Generate a verification token for domain ownership verification
 * @param domain The domain to generate a token for
 * @returns A verification token in format "wick3d-verification=xxxxxxxx"
 */
export function generateVerificationToken(domain: string): string {
  // Using Node.js crypto for random bytes
  const randomHex = crypto.randomBytes(4).toString('hex');
  // Create a domain-specific token that's easy to verify
  return `wick3d-verification=${randomHex}`;
}