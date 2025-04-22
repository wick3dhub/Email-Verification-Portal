import crypto from 'crypto';
import { Setting } from '@shared/schema';

/**
 * Advanced encryption utility to generate secure verification codes
 * with multiple levels of security and wildcard options to avoid detection
 */
export async function generateSecureCode(settings: Setting | undefined): Promise<string> {
  const securityLevel = settings?.securityLevel || 1;
  const useWildcards = settings?.useWildcards || false;
  const salt = settings?.encryptionSalt || "default-salt-change-me";
  
  // Base code using random bytes (level 1)
  let code = crypto.randomBytes(16).toString('hex');
  
  // Apply higher levels of encryption if requested
  if (securityLevel > 1) {
    // Level 2: Add timestamp-based component
    if (securityLevel >= 2) {
      const timestamp = Date.now().toString();
      const timestampHash = crypto.createHash('sha256').update(timestamp + salt).digest('hex').substring(0, 8);
      code = code.substring(0, 24) + timestampHash;
    }
    
    // Level 3: Add email-domain specific signature
    if (securityLevel >= 3) {
      const domainHash = crypto.createHash('md5').update('verification-domain' + salt).digest('hex').substring(0, 8);
      code = code.substring(0, 24) + domainHash;
    }
    
    // Level 4: Add layered encryption
    if (securityLevel >= 4) {
      code = crypto.createHmac('sha256', salt).update(code).digest('hex').substring(0, 32);
    }
    
    // Level 5: Double layered encryption with multiple algorithms
    if (securityLevel >= 5) {
      const firstLayer = crypto.createHash('sha512').update(code + salt).digest('hex');
      code = crypto.createHmac('sha256', salt).update(firstLayer).digest('hex').substring(0, 32);
    }
  }
  
  // Apply wildcards if enabled - making detection as threats more difficult
  if (useWildcards) {
    // Insert random special characters at specific positions
    const wildcardChars = '!@#$%^&*()_+-={}[]|:;<>,.?/~';
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
  
  return code;
}