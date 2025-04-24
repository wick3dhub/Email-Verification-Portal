import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from '@neondatabase/serverless';
import { randomBytes } from 'crypto';

// Declare session data type
declare module 'express-session' {
  interface SessionData {
    testData: {
      value: string;
      timestamp: number;
    };
  }
}

// Create a simple Express app to test session functionality
async function testSessionFunctionality() {
  try {
    // Create Express app
    const app = express();
    
    // Initialize PostgreSQL connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    
    // Initialize session store with PostgreSQL
    const PgSession = connectPgSimple(session);
    
    // Generate a secure session secret
    const sessionSecret = randomBytes(32).toString('hex');
    
    // Set up session middleware with ideal configuration
    app.use(
      session({
        store: new PgSession({
          pool,
          tableName: "session",
          createTableIfMissing: true,
          pruneSessionInterval: 60
        }),
        name: 'test_session_sid',
        secret: sessionSecret,
        resave: false,
        rolling: true,
        saveUninitialized: false,
        cookie: {
          secure: false,
          httpOnly: true,
          maxAge: 1000 * 60 * 60 * 24, // 1 day
          path: '/',
          sameSite: 'lax',
        },
      })
    );
    
    // Test routes
    app.get('/set-session', (req, res) => {
      req.session.testData = { value: 'test-value', timestamp: Date.now() };
      
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save error' });
        }
        
        console.log('Session data set:', {
          id: req.sessionID,
          data: req.session.testData,
          cookie: req.session.cookie
        });
        
        res.json({ 
          message: 'Session data set',
          sessionId: req.sessionID
        });
      });
    });
    
    app.get('/get-session', (req, res) => {
      console.log('Session check:', {
        id: req.sessionID,
        data: req.session.testData,
        cookie: req.session.cookie
      });
      
      if (!req.session.testData) {
        return res.status(404).json({ error: 'No session data found' });
      }
      
      res.json({ 
        message: 'Session data retrieved',
        data: req.session.testData,
        sessionId: req.sessionID
      });
    });
    
    app.get('/clear-session', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.status(500).json({ error: 'Session destroy error' });
        }
        
        res.json({ message: 'Session destroyed' });
      });
    });
    
    // Start server
    const port = 3333;
    app.listen(port, () => {
      console.log(`Test server listening on port ${port}`);
      console.log(`- To set session: http://localhost:${port}/set-session`);
      console.log(`- To get session: http://localhost:${port}/get-session`);
      console.log(`- To clear session: http://localhost:${port}/clear-session`);
    });
  } catch (error) {
    console.error('Test server error:', error);
  }
}

// Run test if executed directly
if (require.main === module) {
  testSessionFunctionality().catch(console.error);
}

export { testSessionFunctionality };