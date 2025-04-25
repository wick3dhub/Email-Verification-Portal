import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { settings } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { domainTracker } from './services/domainTracker';

// Define the domain and CNAME target to set
const DOMAIN = 'oldcrowinn.com';
const CNAME_TARGET = 'wick3d-351e987c.replit.app';

async function updateDomainDirectly() {
  try {
    console.log(`Starting direct DB update for domain: ${DOMAIN} with CNAME target: ${CNAME_TARGET}`);
    
    // Connect to the database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);
    
    // Update the settings table directly
    const result = await db.update(settings)
      .set({ 
        customDomain: DOMAIN,
        domainCnameTarget: CNAME_TARGET,
        domainVerified: true,
        useCustomDomain: true
      })
      .where(eq(settings.id, 1))
      .returning();
    
    console.log('Database update complete. Result:', result);
    
    // Update the domain tracker
    domainTracker.addDomain(DOMAIN, CNAME_TARGET, true);
    domainTracker.markVerified(DOMAIN);
    
    console.log('Domain tracker updated');
    
    // Verify that the settings were updated
    const updatedSettings = await db.select().from(settings).where(eq(settings.id, 1));
    
    console.log('Updated settings:', {
      customDomain: updatedSettings[0]?.customDomain,
      domainCnameTarget: updatedSettings[0]?.domainCnameTarget,
      domainVerified: updatedSettings[0]?.domainVerified,
      useCustomDomain: updatedSettings[0]?.useCustomDomain
    });
    
    // Close the database connection
    await pool.end();
    
    console.log('Domain direct update completed successfully');
  } catch (error) {
    console.error('Error updating domain directly:', error);
  }
}

// Execute the update script
updateDomainDirectly().then(() => {
  console.log('Direct DB update script finished');
  process.exit(0);
}).catch(error => {
  console.error('Direct DB update script failed:', error);
  process.exit(1);
});