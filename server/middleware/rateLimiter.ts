import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { storage } from '../storage';

// In-memory store for blocked IPs
const blockedIPs = new Map<string, number>();

/**
 * Creates a rate limiter middleware based on settings
 * This advanced rate limiter:
 * 1. Gets settings from the database to apply dynamic rate limiting
 * 2. Tracks blocked IPs for longer durations
 * 3. Applies different limits to different endpoints
 * 4. Provides detailed information about the rate limit in headers
 */
export async function createRateLimiter(path: string = 'default') {
  // Get settings from the database
  const settings = await storage.getSettings();
  
  if (!settings || !settings.enableRateLimiting) {
    // If rate limiting is disabled, use a pass-through middleware
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  
  const windowMs = settings.rateLimitWindow * 60 * 1000; // Convert minutes to milliseconds
  const maxRequests = settings.rateLimitMaxRequests;
  const blockDuration = settings.rateLimitBlockDuration * 60 * 1000; // Convert minutes to milliseconds
  
  // Determine max requests based on the path
  let pathMaxRequests = maxRequests;
  
  // Apply stricter limits for authentication routes
  if (path.includes('auth') || path.includes('login')) {
    pathMaxRequests = Math.max(5, Math.floor(maxRequests / 10)); // 10% of normal limit or at least 5
  }
  
  // Apply stricter limits for verification routes
  if (path.includes('verification')) {
    pathMaxRequests = Math.max(20, Math.floor(maxRequests / 3)); // 33% of normal limit or at least 20
  }
  
  // Check if IP is in the blocked list
  const checkBlocked = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const blockedUntil = blockedIPs.get(ip);
    
    if (blockedUntil && blockedUntil > Date.now()) {
      const remainingTimeMs = blockedUntil - Date.now();
      const remainingTimeMin = Math.ceil(remainingTimeMs / 60000);
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `You have been blocked for excessive requests. Try again in ${remainingTimeMin} minutes.`
      });
    }
    
    // Remove from blocked list if time has expired
    if (blockedUntil && blockedUntil <= Date.now()) {
      blockedIPs.delete(ip);
    }
    
    next();
  };
  
  // Create the rate limiter with the specified settings
  const limiter = rateLimit({
    windowMs,
    max: pathMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests, please try again later.'
    },
    handler: (req, res, next, options) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Block the IP for the specified duration
      blockedIPs.set(ip, Date.now() + blockDuration);
      
      res.status(options.statusCode).json(options.message);
    },
    keyGenerator: (req) => {
      // Use IP address as the key
      return req.ip || req.socket.remoteAddress || 'unknown';
    }
  });
  
  // Combine blocked IP check and rate limiter
  return (req: Request, res: Response, next: NextFunction) => {
    checkBlocked(req, res, (err?: any) => {
      if (err) return next(err);
      limiter(req, res, next);
    });
  };
}

/**
 * Creates separate rate limiters for different routes
 * @returns An object containing various rate limiter middlewares
 */
export async function createRateLimiters() {
  return {
    general: await createRateLimiter('default'),
    auth: await createRateLimiter('auth'),
    verification: await createRateLimiter('verification')
  };
}