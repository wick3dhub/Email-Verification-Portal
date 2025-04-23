import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp } from './production';

// Load environment variables from .env file if present
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  console.log('Loading environment variables from .env file');
  dotenv.config();
}

// Set default port for production
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Validate essential environment variables
const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please make sure these are set in your .env file or Plesk environment variables');
  process.exit(1);
}

async function startServer() {
  try {
    // Initialize the application
    const { app, httpServer } = await initializeApp();
    
    // Start listening for connections
    httpServer.listen(PORT, () => {
      console.log(`Production server is running on port ${PORT}`);
      console.log(`Started at: ${new Date().toISOString()}`);
      console.log('--------------------------------------------------');
    });
    
    // Handle process termination
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('SIGINT received. Shutting down gracefully...');
      httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
    return { app, httpServer };
  } catch (error) {
    console.error('Failed to start production server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Unhandled error during server startup:', error);
  process.exit(1);
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});