# Gainesville City Meetings Downloader

A Node.js tool to download video recordings of Gainesville city government meetings from the Escribe platform, extract meeting agendas with timestamps, and generate YouTube chapter markers.

## Features

- Fetches city meetings with video recordings from the Gainesville city portal
- Extracts agenda items with their timestamps from meeting pages
- Downloads videos using custom fork of yt-dlp
- Generates YouTube-compatible chapter markers for easy navigation
- Smart tracking to avoid processing duplicates
- Docker support for consistent environments
- GitHub Actions workflow for automation

## Requirements

For local development:
- Node.js 22 or higher
- Python 3
- [Custom fork of yt-dlp](https://github.com/robjwells/yt-dlp) (until [this PR](https://github.com/yt-dlp/yt-dlp/pull/11607) is merged upstream)

For deployment:
- Docker
- GitHub Actions (optional)

## Setup

### Docker (Recommended)

```bash
# Build the Docker image
docker build -t gnv-city-meetings .

# Run with Docker
docker run -v $(pwd)/downloads:/app/downloads gnv-city-meetings npm run process
```

### Local Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Install the custom yt-dlp fork: `pip install -e git+https://github.com/robjwells/yt-dlp.git#egg=yt-dlp`
4. Update the `YTDLP_PATH` in `unified-processor.js` if needed

## Usage

### Process Flow

The system works in three separate stages:
1. Extract meeting metadata and chapter markers
2. Download meeting videos
3. Upload videos to YouTube (optional)

### Commands

```bash
# Complete process (metadata extraction + video download)
npm run process

# Metadata extraction only (no video downloads)
npm run metadata-only

# Download videos for meetings that have metadata extracted
npm run download-videos

# Upload videos to YouTube (requires configuration)
npm run upload-youtube

# Force reprocessing of all meetings
npm run force-process
```

You can specify a date range for processing:

```bash
npm run process -- --start=2025-01-01T00:00:00-04:00 --end=2025-12-31T00:00:00-04:00
```

### Smart Processing

The tool automatically tracks processed meetings in `./downloads/processed-meetings.json`, making it perfect for scheduled jobs - it will only process new meetings.

### Output Files

Files are organized as follows:
- Videos: `./downloads/DATE_MEETING_NAME.mp4`
- Metadata: `./downloads/metadata/DATE_MEETING_NAME_agenda.json`
- YouTube Chapters: `./downloads/youtube-chapters/DATE_MEETING_NAME_youtube_chapters.txt`

## GitHub Actions Integration

The included workflow file (`.github/workflows/cron-download.yml`) sets up automatic processing on a schedule:

1. Extracts metadata and chapter markers
2. Downloads new meeting videos
3. Uploads to YouTube (requires configuration)
4. Cleans up videos after upload to save space

## YouTube Workflow

After uploading a video to YouTube:
1. Find the corresponding YouTube chapters file in `./downloads/youtube-chapters/`
2. Copy the text contents
3. Paste into the YouTube video description
4. Save changes

YouTube will automatically recognize the timestamps as chapter markers, making it easy for viewers to navigate to specific agenda items.

## License

ISC
