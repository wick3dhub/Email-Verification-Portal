import express, { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { Pool } from '@neondatabase/serverless';
import { registerRoutes } from './routes';
import { log, serveStatic } from './vite';
import path from 'path';
import fs from 'fs';
import { setupAuth } from './auth';
import cors from 'cors';
import { createRateLimiters } from './middleware/rateLimiter';

// Initialize application with production settings
async function initializeApp() {
  try {
    // Create Express app
    const app = express();
    
    // Enable JSON parsing and other middleware
    app.use(express.json());
    app.use(cors());
    
    // Create rate limiters (if rate limiting is enabled in settings)
    const rateLimiters = await createRateLimiters();
    
    // Apply general rate limiter to all API routes
    app.use('/api', rateLimiters.general);
    
    // Apply stricter rate limiters to auth and verification endpoints
    app.use('/api/auth', rateLimiters.auth);
    app.use('/api/verification', rateLimiters.verification);
    
    // Initialize pool and database connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    
    // Setup authentication
    const { requireAuth } = await setupAuth(app, pool);
    
    // Register API routes
    const httpServer = await registerRoutes(app, requireAuth);
    
    // Serve static files from the "dist" directory
    serveStatic(app);
    
    // Enhanced error handling for production
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error('Global error handler:', err);
      
      // Don't expose internal error details in production
      res.status(500).json({
        error: 'An internal server error occurred',
        code: err.code || 'INTERNAL_ERROR',
        // Don't include stack traces or detailed messages in production
      });
    });
    
    // Handle 404 errors
    app.use((req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      
      // Serve the index.html for client-side routing
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
    
    // Return created app and server
    return { app, httpServer };
  } catch (error) {
    console.error('Failed to initialize production app:', error);
    throw error;
  }
}

export { initializeApp };