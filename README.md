# Gainesville City Meetings Downloader

A Node.js-ish tool to download video recordings of Gainesville city government meetings from the Escribe platform.

Currently it looks at the current month's calendar, checks for meetings with a video available, downloads them.

## Features

- Fetches city meetings with video recordings for the current month from the Gainesville city portal
- Downloads videos using yt-dlp
- Organizes downloads with consistent naming conventions

## Requirements

- Node.js 22 or higher
- Python 3 (for yt-dlp)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed

## Setup

1. Clone this repository
2. Update the `YTDLP_PATH` in `index.js` to point to your yt-dlp installation if needed
3. Run `npm install` to install dependencies

## Usage

```bash
node index.js
```

The script will:
1. Check for meetings in the current month with video recordings
2. Download videos to the `./downloads` directory
3. Name files using the format `DATE_MEETING_NAME.ext`

## Configuration

Edit `index.js` to modify:

- `BASE_URL`: The base URL for the Gainesville city meetings portal
- `DOWNLOAD_DIR`: Where to save downloaded videos
- `YTDLP_PATH`: Path to your yt-dlp installation

## License

ISC
