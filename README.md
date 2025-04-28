# Gainesville City Meetings Downloader

A Node.js tool to download video recordings of Gainesville city government meetings from the Escribe platform, extract meeting agendas with timestamps, and generate YouTube chapter markers.

## Features

- Fetches city meetings with video recordings from the Gainesville city portal
- Extracts agenda items with their timestamps from meeting pages
- Downloads videos using yt-dlp
- Generates YouTube-compatible chapter markers from agenda items
- Organizes downloads with consistent naming conventions

## Requirements

- Node.js 22 or higher
- Python 3 (for yt-dlp)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed

## Setup

1. Clone this repository
2. Update the `YTDLP_PATH` in `unified-processor.js` to point to your yt-dlp installation if needed
3. Run `npm install` to install dependencies

## Usage

### Complete Process (Download + Extract + Generate Chapters)

```bash
npm run process
```

Or specify a date range:

```bash
npm run process -- --start=2025-01-01T00:00:00-04:00 --end=2025-12-31T00:00:00-04:00
```

### Extract Metadata Only (No Video Download)

```bash
npm run metadata-only
```

### Results

The script will:
1. Check for meetings with video recordings
2. Extract agenda items with timestamps for each meeting
3. Generate YouTube-compatible chapter markers
4. Download videos (unless using `metadata-only`)

Files will be organized as follows:
- Videos: `./downloads/DATE_MEETING_NAME.mp4`
- Metadata: `./downloads/metadata/DATE_MEETING_NAME_agenda.json`
- YouTube Chapters: `./downloads/youtube-chapters/DATE_MEETING_NAME_youtube_chapters.txt`

## YouTube Workflow

After uploading a video to YouTube:
1. Find the corresponding YouTube chapters file in `./downloads/youtube-chapters/`
2. Copy the text contents
3. Paste into the YouTube video description
4. Save changes

YouTube will automatically recognize the timestamps as chapter markers.

## Configuration

Edit `unified-processor.js` to modify:

- `BASE_URL`: The base URL for the Gainesville city meetings portal
- `DOWNLOAD_DIR`: Where to save downloaded videos
- `YTDLP_PATH`: Path to your yt-dlp installation

## License

ISC
