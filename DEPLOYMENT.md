# Wick3d Link Portal - Deployment Guide for Plesk

This guide provides instructions for deploying the Wick3d Link Portal application on a Plesk environment.

## Prerequisites

- Plesk server with Node.js support
- PostgreSQL database (can be hosted on Plesk or external)
- Access to the server's SSH or Plesk file manager
- Ability to set environment variables in Plesk

## Step 1: Prepare the Server Environment

1. Log in to your Plesk control panel
2. Ensure that Node.js extension is installed
3. Create a new website or use an existing one for deployment
4. Set up a PostgreSQL database if not already available

## Step 2: Upload Files

You can upload the files using one of these methods:

### Option 1: Using Git
```bash
# In the document root of your website
git clone <repository-url>
cd <repository-directory>
```

### Option 2: Upload via FTP/SFTP
Upload all application files to the document root of your website.

### Option 3: Upload via Plesk File Manager
Upload the application as a zip file and extract it to the document root.

## Step 3: Configure Environment Variables

Create a `.env` file in the root directory with the following variables (refer to `.env.example` for a full list):

```
DATABASE_URL=postgresql://user:password@localhost:5432/db_name
SESSION_SECRET=your_secure_random_session_secret_here
NODE_ENV=production
PORT=8080
```

Alternatively, you can set these environment variables through Plesk's interface.

## Step 4: Install Dependencies and Build

SSH into your server and run:

```bash
cd /path/to/app
npm install --production
npm run build
```

## Step 5: Set Up the Database

Run the database migration to create necessary tables:

```bash
npm run db:push
```

## Step 6: Configure Node.js Application in Plesk

1. In Plesk, navigate to the website where you uploaded the files
2. Go to Node.js section
3. Set the following configuration:
   - Document root: `/` (or appropriate subdirectory)
   - Application startup file: `dist/index.js`
   - Application mode: Production
   - Additional NPM packages: (none required, as they are in package.json)

## Step 7: Configure Process Management (Optional)

For better reliability, you can use PM2 with the provided ecosystem.config.js:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Follow the output of the last command to make PM2 start on system boot.

## Step 8: Set Up Proxy Rules in Plesk

1. In Plesk, go to the Apache & nginx Settings for your domain
2. Add the following to the Additional nginx directives:

```
location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Step 9: SSL Configuration

Enable Let's Encrypt SSL certificate for your domain through Plesk.

## Troubleshooting

### Application does not start
- Check the Node.js application logs in Plesk
- Verify that all required environment variables are set
- Check that the database connection is working

### Database connection issues
- Verify the DATABASE_URL is correct
- Check that the PostgreSQL server is running
- Ensure the database user has the necessary permissions

### Session persistence issues
- Make sure SESSION_SECRET is properly set
- Verify that the session database table exists

## Monitoring and Maintenance

- Use the PM2 dashboard for monitoring: `pm2 monit`
- Check logs: `pm2 logs wick3d-link-portal`
- Restart application: `pm2 restart wick3d-link-portal`

## Custom Domain Configuration

The application supports custom domains for verification links. After deploying:

1. Log in to the admin dashboard
2. Go to Settings > Domain Management
3. Add your domains and configure DNS as instructed

For each domain, create a CNAME record pointing to the generated target to enable domain verification.