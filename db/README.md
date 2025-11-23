# Database Setup

## Quick Start

### 1. Start PostgreSQL
```bash
docker-compose up -d postgres
```

The schema will automatically be applied on first run.

### 2. Verify Setup
```bash
# Check if postgres is running
docker ps | grep postgres

# Connect to database
docker exec -it gnv-meetings-postgres psql -U gnv_meetings_user -d gnv_meetings

# Inside psql, verify tables exist:
\dt

# View speakers that were seeded:
SELECT * FROM speakers;

# Exit psql:
\q
```

### 3. Add DATABASE_URL to .env
```bash
# Add this line to your .env file:
DATABASE_URL=postgresql://gnv_meetings_user:gnv_meetings_dev_password@localhost:5432/gnv_meetings
```

## Schema Overview

### Application Data Tables

**meetings** - Core meeting records with metadata and processing status
**speakers** - Global registry of people who speak at meetings
**speaker_samples** - Voice samples for voiceprint training
**transcript_lines** - Force-aligned transcript with speaker labels
**chunks** - Semantic segments (like YouTube chapters)
**meeting_summaries** - High-level meeting overviews

### Helper View

**ready_meetings** - Meetings that are fully processed and ready for display

## Resetting the Database

If you need to start fresh (drop all data and recreate schema):

```bash
# Stop postgres
docker-compose down

# Remove the postgres volume
docker volume rm gnv-city-meetings_postgres-data

# Start postgres again (schema will be reapplied)
docker-compose up -d postgres
```

## Schema File

The complete schema is in `db/schema.sql`. This is a single file approach - when we're ready to deploy to production, we'll create a proper migration system.

## Connection Info

- **Host:** localhost
- **Port:** 5432
- **Database:** gnv_meetings
- **User:** gnv_meetings_user
- **Password:** gnv_meetings_dev_password

## Next Steps

After the schema is set up:
1. Create query helpers (`db/queries.js`)
2. Update workers to write to PostgreSQL instead of SQLite
3. Build REST API on top of this schema
