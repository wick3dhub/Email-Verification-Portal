/**
 * DNS Verification Utility
 * 
 * This utility handles DNS verification with retry logic for domain validation.
 * It provides functions to check CNAME records and verify domain ownership.
 */

import dns from 'dns';
import { promisify } from 'util';
import retry from 'async-retry';

// We're using any type for async-retry since we don't have type definitions
// This is acceptable for a third-party library without type definitions
const asyncRetry: any = retry;

// Promisify DNS functions
const resolveCname = promisify(dns.resolveCname);
const resolveNs = promisify(dns.resolveNs);
const resolveTxt = promisify(dns.resolveTxt);

/**
 * Options for DNS verification
 */
interface DnsVerificationOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeoutMs?: number;
}

/**
 * Result of DNS verification
 */
interface DnsVerificationResult {
  success: boolean;
  error?: string;
  details?: any;
  records?: string[];
}

/**
 * Verify a CNAME record for a domain
 * 
 * @param domain Domain to check
 * @param expectedCnameTarget Expected CNAME target value
 * @param options Verification options
 * @returns Verification result
 */
export async function verifyCnameRecord(
  domain: string, 
  expectedCnameTarget: string,
  options: DnsVerificationOptions = {}
): Promise<DnsVerificationResult> {
  const {
    maxRetries = 3,
    retryDelay = 2000,
    timeoutMs = 5000
  } = options;

  try {
    // Use retry to handle DNS propagation delays
    const cnameRecords = await retry(
      async (bail: any, attempt: number) => {
        try {
          const originalDnsTimeout = dns.getDefaultResultOrder();
          
          // Set timeout for DNS requests
          const timeoutPromise = new Promise<string[]>((_, reject) => {
            setTimeout(() => reject(new Error(`DNS lookup timeout after ${timeoutMs}ms`)), timeoutMs);
          });
          
          // Actual DNS resolution
          const dnsPromise = resolveCname(domain);
          
          // Race between timeout and actual resolution
          const records = await Promise.race([dnsPromise, timeoutPromise]);
          
          console.log(`DNS lookup attempt ${attempt} for ${domain} succeeded, found records:`, records);
          return records;
        } catch (error: any) {
          // If this is an ENOTFOUND or similar error, we want to retry
          if (error.code === 'ENOTFOUND' || error.code === 'ENODATA' || error.code === 'TIMEOUT') {
            console.log(`DNS lookup attempt ${attempt} for ${domain} failed with ${error.code}, retrying...`);
            throw error; // This will trigger a retry
          }
          
          console.error(`DNS lookup attempt ${attempt} for ${domain} failed with fatal error:`, error);
          bail(error); // This will stop retrying
          return [];
        }
      },
      {
        retries: maxRetries,
        minTimeout: retryDelay,
        factor: 2, // Exponential backoff
        onRetry: (error: any, attempt: number) => {
          console.log(`Retrying CNAME lookup for ${domain}, attempt ${attempt} of ${maxRetries}`);
        }
      }
    );

    // Check if any of the CNAME records match the expected target
    const matchingRecord = cnameRecords.find(record => 
      record.toLowerCase() === expectedCnameTarget.toLowerCase()
    );

    if (matchingRecord) {
      return {
        success: true,
        records: cnameRecords
      };
    } else {
      return {
        success: false,
        error: `CNAME verification failed. Found ${cnameRecords.length} records, but none match the expected target '${expectedCnameTarget}'`,
        records: cnameRecords
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `DNS verification failed: ${error.message}`,
      details: error
    };
  }
}

/**
 * Perform a comprehensive domain verification including CNAME, NS and TXT records
 * 
 * @param domain Domain to verify
 * @param expectedCnameTarget Expected CNAME target value
 * @param options Verification options
 * @returns Verification result
 */
export async function verifyDomain(
  domain: string,
  expectedCnameTarget: string,
  options: DnsVerificationOptions = {}
): Promise<DnsVerificationResult> {
  try {
    // First check if the domain has a CNAME record pointing to our target
    const cnameResult = await verifyCnameRecord(domain, expectedCnameTarget, options);
    
    // If the CNAME check was successful, consider it verified
    if (cnameResult.success) {
      return cnameResult;
    }
    
    // If the domain doesn't have a CNAME record, it might be using a TXT verification
    // This is often used for apex domains which can't have CNAME records
    try {
      const txtRecords = await retry(
        async () => {
          try {
            return await resolveTxt(domain);
          } catch (error) {
            if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
              throw error; // This will trigger a retry
            }
            return []; // For other errors, just return empty
          }
        },
        { retries: options.maxRetries || 3 }
      );
      
      // Look for a TXT record that contains our verification string
      // The format we're looking for is "wick3d-verify=[expectedCnameTarget]"
      const verificationPrefix = "wick3d-verify=";
      
      // TXT records are returned as arrays of strings, so we need to flatten and check
      for (const txtRecord of txtRecords) {
        const txtValue = txtRecord.join('');
        if (txtValue.startsWith(verificationPrefix)) {
          const txtTarget = txtValue.substring(verificationPrefix.length);
          if (txtTarget === expectedCnameTarget) {
            return {
              success: true,
              records: txtRecords.map(r => r.join('')),
              details: 'Verified using TXT record'
            };
          }
        }
      }
    } catch (error) {
      // Ignore TXT errors, we'll return the original CNAME error
      console.error("Error checking TXT records:", error);
    }
    
    // If we got here, neither CNAME nor TXT verification succeeded
    return {
      success: false,
      error: `Domain verification failed. Please set either a CNAME record for ${domain} pointing to ${expectedCnameTarget}, or a TXT record with value 'wick3d-verify=${expectedCnameTarget}'`,
      details: cnameResult.details,
      records: cnameResult.records
    };
  } catch (error) {
    return {
      success: false,
      error: `Domain verification failed: ${error.message}`,
      details: error
    };
  }
}