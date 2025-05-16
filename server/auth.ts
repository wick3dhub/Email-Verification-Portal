import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    testValue?: string;
  }
}

export async function setupAuth(app: Express) {
  // Use default MemoryStore for sessions (for SQLite, consider connect-sqlite3 for production)
  // const PgSession = connectPgSimple(session);
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
  
  // Set up session middleware with specific configuration for Replit environment
  app.use(
    session({
      // store: new PgSession({ pool, ... }), // Remove Postgres session store
      name: 'wick3d_portal_sid',
      secret: sessionSecret,
      resave: true, 
      rolling: true,
      saveUninitialized: true,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        path: '/',
        sameSite: 'lax', // Use lax for better compatibility
      },
    })
  );
  
  // Authentication middleware
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    // Check if user is authenticated via session
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      // Get user from database
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Attach user to request
      (req as any).user = user;
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  
  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    console.log(`Login attempt for username: ${username}`);
    
    if (!username || !password) {
      console.log("Login error: Missing username or password");
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    try {
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        console.log(`Login failed: User ${username} not found`);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // This depends on whether the password is already hashed in the database
      // For now, we're doing direct comparison (needs to be improved)
      if (user.password !== password) {
        console.log(`Login failed: Invalid password for ${username}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      console.log(`User ${username} authenticated successfully, setting session`);
      
      // Set directly without regenerate
      req.session.userId = user.id;
      
      // Save immediately
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log(`Session saved successfully for user ${username}, session ID: ${req.sessionID}`);
            console.log(`Session data after save:`, req.session);
            resolve();
          }
        });
      });
      
      // Return success
      return res.status(200).json({
        id: user.id,
        username: user.username,
      });
      
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Error logging out" });
      }
      res.status(200).json({ message: "Logged out successfully" });
    });
  });
  
  // Test routes for session debugging
  app.get("/api/auth/session-test", (req: Request, res: Response) => {
    // Set a simple value in the session
    req.session.testValue = "test-" + Date.now();
    
    req.session.save((err) => {
      if (err) {
        console.error("Session test save error:", err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      console.log("Session test value set:", {
        id: req.sessionID,
        testValue: req.session.testValue,
        cookie: req.session.cookie
      });
      
      res.json({ 
        success: true, 
        message: "Session test value set", 
        sessionId: req.sessionID,
        testValue: req.session.testValue
      });
    });
  });
  
  app.get("/api/auth/session-check", (req: Request, res: Response) => {
    console.log("Session test check:", {
      id: req.sessionID,
      testValue: req.session.testValue,
      cookie: req.session.cookie
    });
    
    res.json({
      success: true,
      hasTestValue: !!req.session.testValue,
      testValue: req.session.testValue || null,
      sessionId: req.sessionID
    });
  });

  app.get("/api/auth/check", async (req: Request, res: Response) => {
    console.log("Auth check request received");
    console.log("Session data:", {
      id: req.sessionID,
      cookie: req.session.cookie,
      userId: req.session.userId,
      headers: {
        cookie: req.headers.cookie
      }
    });
    
    if (!req.session.userId) {
      console.log("No userId in session, returning 401");
      return res.status(401).json({ authenticated: false });
    }
    
    try {
      console.log(`Looking up user with ID ${req.session.userId}`);
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        console.log(`User with ID ${req.session.userId} not found in database`);
        // Clean up the invalid session
        req.session.destroy(() => {});
        return res.status(401).json({ authenticated: false });
      }
      
      console.log(`User found: ${user.username}, authenticated successfully`);
      
      // Refresh the session to extend its life
      req.session.touch();
      
      // Save the session to ensure it persists
      await new Promise<void>((resolve) => {
        req.session.save((err) => {
          if (err) {
            console.error("Error refreshing session:", err);
          }
          resolve();
        });
      });
      
      return res.status(200).json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
        },
        sessionId: req.sessionID
      });
    } catch (error) {
      console.error("Auth check error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Update admin credentials endpoint
  app.post("/api/auth/update-credentials", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentUsername, currentPassword, newUsername, newPassword } = req.body;
      
      if (!currentUsername || !currentPassword || !newUsername || !newPassword) {
        return res.status(400).json({ 
          success: false,
          message: "All fields are required: currentUsername, currentPassword, newUsername, newPassword" 
        });
      }
      
      console.log(`Attempting to update credentials from ${currentUsername} to ${newUsername}`);
      
      // Get the current user from the session
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      // Verify the current credentials
      if (user.username !== currentUsername || user.password !== currentPassword) {
        console.log("Current credentials don't match");
        return res.status(401).json({ 
          success: false,
          message: "Current credentials are invalid" 
        });
      }
      
      // Check if new username already exists (and it's not the current user)
      if (newUsername !== currentUsername) {
        const existingUser = await storage.getUserByUsername(newUsername);
        if (existingUser && existingUser.id !== user.id) {
          console.log(`Username ${newUsername} already exists`);
          return res.status(400).json({ 
            success: false,
            message: "Username already exists" 
          });
        }
      }
      
      // Update user with new credentials
      const updatedUser = await storage.updateUser(user.id, {
        username: newUsername,
        password: newPassword
      });
      
      console.log(`Credentials updated successfully for user ID ${user.id}`);
      
      return res.status(200).json({ 
        success: true,
        message: "Credentials updated successfully",
        user: {
          id: updatedUser.id,
          username: updatedUser.username
        }
      });
    } catch (error) {
      console.error("Error updating credentials:", error);
      return res.status(500).json({ 
        success: false,
        message: "Failed to update credentials due to server error" 
      });
    }
  });
  
  return { requireAuth };
}