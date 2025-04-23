/**
 * Domain Tracker Service
 * 
 * This service provides functionality to track domain verification state
 * between the frontend and backend, ensuring domains added are properly
 * tracked throughout the verification process regardless of database sync timing.
 */

// Type definition for tracked domain
export interface TrackedDomain {
  domain: string;
  cnameTarget: string;
  timestamp: number;
  isPrimary?: boolean;
  verified?: boolean;
}

// In-memory store for recently added domains
// This helps during the transition period before database updates are visible
class DomainTracker {
  private recentDomains: Map<string, TrackedDomain> = new Map();
  
  /**
   * Add a domain to the tracker
   * @param domain Domain name
   * @param cnameTarget CNAME target value
   * @param isPrimary Whether this is the primary domain
   */
  addDomain(domain: string, cnameTarget: string, isPrimary: boolean = false): void {
    this.recentDomains.set(domain, {
      domain,
      cnameTarget,
      timestamp: Date.now(),
      isPrimary,
      verified: false
    });
    
    console.log(`Domain tracker: Added domain ${domain} with target ${cnameTarget}`);
    console.log(`Domain tracker: Current domains: ${Array.from(this.recentDomains.keys()).join(', ')}`);
    
    // Cleanup old domains after 30 minutes
    setTimeout(() => {
      if (this.recentDomains.has(domain)) {
        this.recentDomains.delete(domain);
        console.log(`Domain tracker: Removed domain ${domain} from tracker (timeout)`);
      }
    }, 30 * 60 * 1000);
  }
  
  /**
   * Get a tracked domain by name
   * @param domain Domain name to lookup
   * @returns Tracked domain info or undefined if not found
   */
  getDomain(domain: string): TrackedDomain | undefined {
    const trackedDomain = this.recentDomains.get(domain);
    if (trackedDomain) {
      console.log(`Domain tracker: Found domain ${domain} in tracker with target ${trackedDomain.cnameTarget}`);
    } else {
      console.log(`Domain tracker: Domain ${domain} not found in tracker`);
    }
    return trackedDomain;
  }
  
  /**
   * Mark a domain as verified
   * @param domain Domain to mark as verified
   */
  markVerified(domain: string): void {
    const trackedDomain = this.recentDomains.get(domain);
    if (trackedDomain) {
      trackedDomain.verified = true;
      this.recentDomains.set(domain, trackedDomain);
      console.log(`Domain tracker: Marked domain ${domain} as verified`);
    }
  }
  
  /**
   * Get all tracked domains
   * @returns Array of all tracked domains
   */
  getAllDomains(): TrackedDomain[] {
    return Array.from(this.recentDomains.values());
  }
  
  /**
   * Clear all tracked domains
   */
  clearAll(): void {
    this.recentDomains.clear();
    console.log('Domain tracker: Cleared all domains from tracker');
  }
}

// Export a singleton instance
export const domainTracker = new DomainTracker();