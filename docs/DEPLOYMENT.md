# Deployment Guide

## Overview

This guide covers deployment strategies for the Gainesville City Meetings Pipeline, from local development to production automation.

## Prerequisites

### System Requirements
- **Node.js**: Version 22 or higher (ES modules support)
- **Python 3**: For yt-dlp video extraction
- **Disk Space**: 100GB+ recommended (varies with cleanup policy)
- **Memory**: 512MB+ (video processing can be memory intensive)

### External Dependencies
- **yt-dlp**: Custom fork required for Escribe platform support
- **Google API Access**: YouTube Data API v3 credentials
- **YouTube Channel**: Target channel for video publishing

## Local Development Setup

### 1. Repository Setup
```bash
# Clone repository
git clone [repository-url]
cd gnv-city-meetings

# Install Node.js dependencies
npm install

# Install custom yt-dlp fork
pip install git+https://github.com/robjwells/yt-dlp.git@escribe
```

### 2. Configuration
Create `.env` file with required environment variables:

```bash
# YouTube API Configuration
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback

# YouTube Playlists (optional)
PLAYLIST_CITY_COMMISSION=PLxxxxxxxxxxxxxxxxxx
PLAYLIST_GENERAL_POLICY=PLxxxxxxxxxxxxxxxxxx
PLAYLIST_CITY_PLAN_BOARD=PLxxxxxxxxxxxxxxxxxx
PLAYLIST_UTILITY_ADVISORY_BOARD=PLxxxxxxxxxxxxxxxxxx

# Video Download Tool
YTDLP_PATH=/usr/local/bin/yt-dlp
```

### 3. Database Initialization
```bash
# Initialize database schema
npm run migrate

# Check pipeline status
npm run status
```

### 4. YouTube Authentication
```bash
# First-time OAuth setup (interactive)
npm run upload-youtube -- --auth-only

# Follow browser prompts to authorize application
# Tokens will be saved for future use
```

## Production Deployment

### Container Deployment (Recommended)

#### Dockerfile
```dockerfile
FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install git+https://github.com/robjwells/yt-dlp.git@escribe

# Application setup
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create data directories
RUN mkdir -p data/jobs downloads/metadata downloads/youtube-chapters

# Non-root user for security
RUN useradd -m -u 1001 pipeline
RUN chown -R pipeline:pipeline /app
USER pipeline

CMD ["npm", "run", "status"]
```

#### Docker Compose
```yaml
version: '3.8'

services:
  pipeline:
    build: .
    volumes:
      - ./data:/app/data
      - ./downloads:/app/downloads
      - ./config:/app/config
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
    
  # Optional: Monitoring
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
```

### Server Deployment

#### systemd Service
```ini
[Unit]
Description=Gainesville City Meetings Pipeline
After=network.target

[Service]
Type=simple
User=pipeline
WorkingDirectory=/opt/gnv-city-meetings
ExecStart=/usr/bin/node src/cli/pipeline.js --watch
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/gnv-city-meetings/.env

[Install]
WantedBy=multi-user.target
```

#### Process Management with PM2
```bash
# Install PM2
npm install -g pm2

# Process configuration
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'gnv-meetings-pipeline',
    script: 'src/cli/pipeline.js',
    args: '--watch',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOF

# Start service
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Automated Scheduling

### Cron-based Processing
```bash
# Daily meeting discovery and processing
0 6 * * * cd /opt/gnv-city-meetings && npm run discover

# Weekly backfill for missed meetings
0 3 * * 0 cd /opt/gnv-city-meetings && npm run backfill -- --days=7

# Monthly cleanup of old artifacts
0 2 1 * * cd /opt/gnv-city-meetings && npm run cleanup
```

### GitHub Actions Workflow
```yaml
name: City Meetings Pipeline

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM
  workflow_dispatch:     # Manual trigger

jobs:
  process:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '22'
        
    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.x'
        
    - name: Install dependencies
      run: |
        npm ci
        pip install git+https://github.com/robjwells/yt-dlp.git@escribe
    
    - name: Restore database
      uses: actions/cache@v3
      with:
        path: data/meetings.db
        key: meetings-db-${{ github.sha }}
        restore-keys: meetings-db-
    
    - name: Process meetings
      env:
        GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
        GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
      run: npm run process
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: processing-logs
        path: logs/
```

## Configuration Management

### Environment Variables
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_OAUTH_CLIENT_ID` | YouTube API OAuth client ID | Yes | - |
| `GOOGLE_OAUTH_CLIENT_SECRET` | YouTube API OAuth secret | Yes | - |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL | Yes | `http://localhost:3000/oauth2callback` |
| `YTDLP_PATH` | Path to yt-dlp executable | No | `/usr/local/bin/yt-dlp` |
| `PLAYLIST_*` | YouTube playlist IDs | No | - |
| `NODE_ENV` | Environment mode | No | `development` |

### Configuration Files
```bash
config/
├── production.json      # Production settings
├── development.json     # Development settings
└── database.json        # Database configuration
```

## Security Considerations

### API Credentials
- Store YouTube API credentials securely (environment variables, secrets management)
- Use least-privilege OAuth scopes
- Rotate credentials periodically
- Monitor API usage and rate limits

### File System Security
```bash
# Secure file permissions
chmod 750 /opt/gnv-city-meetings
chmod 640 /opt/gnv-city-meetings/.env
chown -R pipeline:pipeline /opt/gnv-city-meetings

# Database security
chmod 640 data/meetings.db
```

### Network Security
- Restrict outbound connections to required APIs only
- Use HTTPS for all external communications
- Consider VPN or firewall rules for production deployments

## Monitoring and Observability

### Health Checks
```bash
#!/bin/bash
# health-check.sh

# Check database connectivity
sqlite3 data/meetings.db "SELECT COUNT(*) FROM meetings;" > /dev/null || exit 1

# Check disk space
USAGE=$(df /opt/gnv-city-meetings | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $USAGE -gt 90 ]; then
    echo "Disk usage critical: ${USAGE}%"
    exit 1
fi

# Check recent processing activity
RECENT=$(sqlite3 data/meetings.db "SELECT COUNT(*) FROM meetings WHERE updated_at > datetime('now', '-24 hours');")
if [ $RECENT -eq 0 ]; then
    echo "No recent processing activity"
    exit 1
fi

echo "Pipeline healthy"
```

### Logging Configuration
```javascript
// config/logging.js
export const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: 'json',
  transports: [
    { type: 'file', filename: 'logs/pipeline.log' },
    { type: 'console', enabled: process.env.NODE_ENV !== 'production' }
  ]
};
```

### Metrics Collection
```javascript
// Basic metrics endpoints
app.get('/metrics', (req, res) => {
  const stats = await getPipelineStats();
  res.json({
    meetings_total: stats.meetings.total,
    meetings_uploaded: stats.meetings.uploaded,
    jobs_pending: stats.jobs.pending,
    timestamp: new Date().toISOString()
  });
});
```

## Backup and Recovery

### Database Backup
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/backups/gnv-meetings"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
sqlite3 data/meetings.db ".backup $BACKUP_DIR/meetings_$DATE.db"

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz .env config/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### Disaster Recovery
```bash
# Restore from backup
cp /opt/backups/gnv-meetings/meetings_20250623_120000.db data/meetings.db

# Verify database integrity
sqlite3 data/meetings.db "PRAGMA integrity_check;"

# Restart services
systemctl restart gnv-meetings-pipeline
```

## Performance Optimization

### Database Performance
```sql
-- Optimize SQLite for production
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;
```

### Concurrency Settings
```javascript
// Limit concurrent operations
const config = {
  maxConcurrentDownloads: 3,
  maxConcurrentUploads: 2,
  jobBatchSize: 10,
  retryDelay: 5000
};
```

### Resource Management
```bash
# Disk space monitoring
df -h /opt/gnv-city-meetings
du -sh downloads/

# Memory usage
ps aux | grep node
free -h

# CPU usage
top -p $(pgrep -f "gnv-meetings")
```

## Troubleshooting

### Common Issues

#### Database Locked
```bash
# Check for long-running processes
lsof data/meetings.db

# Force unlock (use with caution)
sqlite3 data/meetings.db "BEGIN IMMEDIATE; ROLLBACK;"
```

#### YouTube API Errors
```bash
# Check quota usage
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://www.googleapis.com/youtube/v3/quotaUsage"

# Re-authenticate
rm -f config/youtube-credentials.json
npm run upload-youtube -- --auth-only
```

#### Disk Space Issues
```bash
# Clean up old videos
find downloads/ -name "*.mp4" -mtime +7 -delete

# Clean up job files
npm run cleanup-jobs

# Archive old metadata
tar -czf metadata-archive-$(date +%Y%m).tar.gz downloads/metadata/
```

This deployment guide provides comprehensive coverage for running the pipeline in various environments while maintaining security, reliability, and observability best practices.