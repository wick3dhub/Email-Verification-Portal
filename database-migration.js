import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Load environment variables
dotenv.config();

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Create a new database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');
    
    // Begin a transaction
    await client.query('BEGIN');
    
    // First check if the column exists
    const checkColumnSQL = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'settings' 
      AND column_name = 'domain_verification_token';
    `;
    
    const { rows } = await client.query(checkColumnSQL);
    
    if (rows.length === 0) {
      console.log('Adding domain_verification_token column to settings table...');
      
      // Add the new column
      await client.query(`
        ALTER TABLE settings 
        ADD COLUMN domain_verification_token TEXT NOT NULL DEFAULT '';
      `);
      
      console.log('Column added successfully.');
    } else {
      console.log('Column domain_verification_token already exists.');
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    
    console.log('Migration completed successfully!');
  } catch (error) {
    // Rollback the transaction in case of error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
  
  // Close the pool
  await pool.end();
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });