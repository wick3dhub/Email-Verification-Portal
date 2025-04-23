// This is a production server wrapper for Plesk environments
// It handles specific Plesk requirements and provides additional logging

import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file if present
try {
  if (fs.existsSync(path.join(process.cwd(), '.env'))) {
    console.log('Loading environment variables from .env file');
    const dotenv = await import('dotenv');
    dotenv.config();
  }
} catch (err) {
  console.error('Error loading .env file:', err);
}

// Set default port for Plesk
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

// Import the application
const { app } = await import('./dist/index.js');

// Create HTTP server
const server = createServer(app);

// Handle errors
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please check for other running applications.`);
    process.exit(1);
  }
});

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Server is listening on ${HOST}:${PORT}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('--------------------------------------------------');
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});