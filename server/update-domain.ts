import { storage } from './storage';
import { domainTracker } from './services/domainTracker';

async function updateDomain() {
  const domain = 'oldcrowinn.com';
  const cnameTarget = 'wick3d-351e987c.replit.app';
  
  console.log(`Updating domain ${domain} with CNAME target ${cnameTarget}`);
  
  try {
    // Get current settings
    const settings = await storage.getSettings();
    if (!settings) {
      console.error('Settings not found');
      return;
    }

    // Update settings with the domain
    await storage.updateSettings({
      customDomain: domain,
      domainCnameTarget: cnameTarget,
      domainVerified: true,
      useCustomDomain: true
    });
    
    console.log('Settings updated successfully');
    
    // Update domain tracker
    domainTracker.addDomain(domain, cnameTarget, true);
    domainTracker.markVerified(domain);
    
    console.log(`Domain tracker updated for ${domain}`);
    
    // Get updated settings to confirm
    const updatedSettings = await storage.getSettings();
    console.log('Updated settings:', {
      customDomain: updatedSettings?.customDomain,
      domainCnameTarget: updatedSettings?.domainCnameTarget,
      domainVerified: updatedSettings?.domainVerified,
      useCustomDomain: updatedSettings?.useCustomDomain
    });
    
    console.log('Domain update completed successfully');
  } catch (error) {
    console.error('Error updating domain:', error);
  }
}

// Execute the update
updateDomain().then(() => {
  console.log('Domain update script finished');
}).catch(err => {
  console.error('Domain update script failed:', err);
});