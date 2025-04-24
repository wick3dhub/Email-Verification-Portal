/**
 * Domain Reputation Service
 * 
 * This service provides domain reputation scoring using various free public APIs.
 * It helps determine a domain's trustworthiness and risk level.
 */

import { domainTracker, TrackedDomain } from './domainTracker';

// Sources for domain reputation checking
const REPUTATION_SOURCES = {
  IPQUALITYSCORE: 'ipqualityscore',
  GOOGLE_SAFE_BROWSING: 'google_safe_browsing',
  WHOIS: 'whois',
  DNS_LOOKUP: 'dns_lookup',
  URLSCAN: 'urlscan'
};

/**
 * Map risk scores from various sources to a standardized 0-100 scale
 * @param score Original score
 * @param min Minimum value of original scale
 * @param max Maximum value of original scale
 * @param invert Whether to invert the scale (if higher original score means higher risk)
 * @returns Standardized score from 0-100 where 100 is best/safest
 */
function normalizeScore(score: number, min: number, max: number, invert: boolean = false): number {
  // Convert to 0-100 scale
  const normalized = ((score - min) / (max - min)) * 100;
  
  // Invert if needed (e.g., if original scale has higher = more risky)
  return invert ? 100 - normalized : normalized;
}

/**
 * Get risk classification based on score
 * @param score Normalized score (0-100)
 * @returns Risk classification
 */
function classifyRisk(score: number): 'low' | 'medium' | 'high' | 'unknown' {
  if (score >= 70) return 'low';
  if (score >= 40) return 'medium';
  return 'high';
}

/**
 * Check domain reputation using IPQualityScore's API (free tier)
 * This is a free API that provides domain reputation information without requiring API key
 * @param domain Domain to check
 * @returns Reputation data
 */
async function checkIPQualityScore(domain: string): Promise<TrackedDomain['reputation']> {
  try {
    // Use their free domain check API
    const response = await fetch(`https://www.ipqualityscore.com/api/json/domainReputation/free-api/${domain}`);
    const data = await response.json();
    
    // IPQS returns a 'success' field to indicate if the check was successful
    if (data.success) {
      // Higher risk score = higher risk, so invert it for our scale
      const score = normalizeScore(1 - data.risk_score, 0, 1, false) * 100;
      
      return {
        score: Math.round(score),
        risk: classifyRisk(score),
        lastChecked: Date.now(),
        source: REPUTATION_SOURCES.IPQUALITYSCORE,
        details: {
          riskScore: data.risk_score,
          suspicious: data.suspicious,
          spammy: data.spammy,
          malware: data.malware,
          phishing: data.phishing,
          parking: data.parking,
          domain_age: data.domain_age,
        }
      };
    }
    
    throw new Error(data.message || 'IPQualityScore check failed');
  } catch (error) {
    console.error(`IPQualityScore check failed for ${domain}:`, error);
    
    // Fallback to DNS-based reputation estimation
    return checkDNSReputation(domain);
  }
}

/**
 * Estimate domain reputation based on DNS records and domain age
 * Used as a fallback when API-based checks fail
 * @param domain Domain to check
 * @returns Reputation data
 */
async function checkDNSReputation(domain: string): Promise<TrackedDomain['reputation']> {
  try {
    // Basic DNS-based reputation check
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
    const dnsData = await response.json();
    
    // Get WHOIS data for domain age if available
    let domainAge = 0;
    try {
      // Try to get WHOIS data using a public API
      const whoisResponse = await fetch(`https://whoisjson.com/api/v1/whois?domain=${domain}`);
      const whoisData = await whoisResponse.json();
      
      if (whoisData.created_date) {
        const createdDate = new Date(whoisData.created_date);
        const ageInDays = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        domainAge = Math.round(ageInDays);
      }
    } catch (whoisError) {
      console.log(`WHOIS lookup failed for ${domain}, using minimal domain age`);
    }
    
    // Calculate a basic score based on DNS records
    let baseScore = 50; // Start with neutral score
    
    // Domains with MX records are more likely to be legitimate
    if (dnsData.Answer && dnsData.Answer.length > 0) {
      baseScore += 10;
    }
    
    // Domain age factor (older domains are generally more trustworthy)
    if (domainAge > 0) {
      // Add up to 40 points for domain age (max boost at 2 years / 730 days)
      const ageBonus = Math.min(40, (domainAge / 730) * 40);
      baseScore += ageBonus;
    }
    
    // Cap score at 100
    const finalScore = Math.min(100, baseScore);
    
    return {
      score: Math.round(finalScore),
      risk: classifyRisk(finalScore),
      lastChecked: Date.now(),
      source: REPUTATION_SOURCES.DNS_LOOKUP,
      details: {
        hasMX: (dnsData.Answer && dnsData.Answer.length > 0) || false,
        domainAge: domainAge,
        dnsLookupStatus: dnsData.Status
      }
    };
  } catch (error) {
    console.error(`DNS reputation check failed for ${domain}:`, error);
    
    // Last resort fallback - return unknown reputation
    return {
      score: 50, // Neutral score
      risk: 'unknown',
      lastChecked: Date.now(),
      source: 'fallback',
      details: {
        error: 'All reputation checks failed'
      }
    };
  }
}

/**
 * Get domain reputation score
 * Tries multiple sources and provides normalized scores
 * @param domain Domain to check
 * @param forceRefresh Force refresh even if recent data exists
 * @returns Domain reputation data
 */
export async function getDomainReputation(domain: string, forceRefresh: boolean = false): Promise<TrackedDomain['reputation']> {
  // Check if we already have recent data
  const trackedDomain = domainTracker.getDomain(domain);
  if (!forceRefresh && trackedDomain?.reputation && domainTracker.hasRecentReputationData(domain)) {
    console.log(`Using cached reputation data for ${domain}`);
    return trackedDomain.reputation;
  }
  
  console.log(`Checking reputation for domain: ${domain}`);
  
  try {
    // Start with IPQualityScore as primary source
    const reputation = await checkIPQualityScore(domain);
    
    // Update tracker with new reputation data
    domainTracker.updateDomainReputation(domain, reputation);
    
    return reputation;
  } catch (error) {
    console.error(`All reputation checks failed for ${domain}:`, error);
    
    // Return unknown reputation if all checks fail
    const fallbackReputation = {
      score: 50,
      risk: 'unknown' as 'low' | 'medium' | 'high' | 'unknown',
      lastChecked: Date.now(),
      source: 'error',
      details: {
        error: 'All reputation sources failed'
      }
    };
    
    // Update tracker with fallback reputation
    domainTracker.updateDomainReputation(domain, fallbackReputation);
    
    return fallbackReputation;
  }
}