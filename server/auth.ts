import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import { createHash, randomBytes } from "crypto";
import { Pool } from "@neondatabase/serverless";
import connectPgSimple from "connect-pg-simple";
import { db } from "./db";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export async function setupAuth(app: Express, pool: Pool) {
  // Initialize session store with PostgreSQL
  const PgSession = connectPgSimple(session);
  
  // Generate a secure session secret or use from environment
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
  
  // Set up session middleware
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session", // Default session table name
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production", // Use secure cookies in production
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
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
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    try {
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // This depends on whether the password is already hashed in the database
      // For now, we're doing direct comparison (needs to be improved)
      if (user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Set user ID in session
      req.session.userId = user.id;
      
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
  
  app.get("/api/auth/check", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ authenticated: false });
    }
    
    try {
      const user = await storage.getUser(req.session.userId);
      
      if (!user) {
        return res.status(401).json({ authenticated: false });
      }
      
      return res.status(200).json({
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
        },
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