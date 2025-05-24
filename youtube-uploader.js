// youtube-uploader.js - Implementation for uploading videos to YouTube

import fs from 'fs/promises';
import fsExtra from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import open from 'open';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.credentials');
const TOKEN_PATH = path.join(TOKEN_DIR, 'youtube-upload-token.json');

// Get client credentials from environment variables
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost';

// Create an OAuth2 client with the given credentials
async function authorize() {
  try {
    // Check if required environment variables are set
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('Error: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env file');
      process.exit(1);
    }

    // Create OAuth client
    const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    
    // Check if we have previously stored a token
    try {
      const token = await fs.readFile(TOKEN_PATH, 'utf8');
      oAuth2Client.setCredentials(JSON.parse(token));
      return oAuth2Client;
    } catch (err) {
      return getNewToken(oAuth2Client);
    }
  } catch (error) {
    console.error('Error during authorization:', error);
    throw error;
  }
}

// Get and store new token after prompting for user authorization
async function getNewToken(oAuth2Client) {
  try {
    // Generate an auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force to get refresh token
    });

    console.log('Authorize this app by visiting this url:', authUrl);
    await open(authUrl); // Automatically open the URL in the default browser

    // Create readline interface for code input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Wait for the user to enter the code
    const code = await new Promise((resolve) => {
      rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        resolve(code);
      });
    });

    // Exchange code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Store the token to disk for later program executions
    await fsExtra.ensureDir(TOKEN_DIR);
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Token stored to', TOKEN_PATH);

    return oAuth2Client;
  } catch (error) {
    console.error('Error getting new token:', error);
    throw error;
  }
}

/**
 * Upload a video to YouTube
 * @param {Object} options - Upload options
 * @param {string} options.videoPath - Exact path to the video file
 * @param {string} options.title - Video title
 * @param {string} options.description - Video description
 * @param {Array<string>} options.tags - Video tags
 * @param {string} options.categoryId - YouTube category ID
 * @param {string} options.privacyStatus - Privacy status (public, unlisted, private)
 * @param {string|string[]} options.playlistIds - YouTube playlist ID(s) to add the video to
 * @returns {Promise<Object>} - Upload result with videoId
 */
async function uploadToYouTube(options) {
  const { 
    videoPath, 
    title, 
    description, 
    tags = [], 
    categoryId = '25', // News & Politics
    privacyStatus = 'unlisted',
    playlistIds = []
  } = options;
  
  try {
    console.log('\n--- YouTube Upload Parameters ---');
    console.log(`Title: ${title}`);
    console.log(`Video Path: ${videoPath}`);
    console.log(`Description length: ${description.length} characters`);
    console.log(`Tags: ${tags.join(', ')}`);
    console.log(`Category ID: ${categoryId}`);
    console.log(`Privacy Status: ${privacyStatus}`);
    console.log(`Playlist IDs: ${playlistIds.length > 0 ? (Array.isArray(playlistIds) ? playlistIds.join(', ') : playlistIds) : 'None'}`);
    console.log('--------------------------------\n');
    
    // Verify the video file exists
    await fs.access(videoPath);
    
    // Get authorized client
    const auth = await authorize();
    const youtube = google.youtube({
      version: 'v3',
      auth
    });
    
    // Prepare the upload
    console.log('Starting YouTube upload...');
    
    // Setup upload parameters
    const fileSize = (await fs.stat(videoPath)).size;
    
    // Upload file
    const res = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId,
          defaultLanguage: 'en',
          defaultAudioLanguage: 'en'
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        }
      },
      media: {
        body: fsExtra.createReadStream(videoPath)
      }
    }, {
      // Optional progress monitoring
      // this iife is cheeky lol
      onUploadProgress: (function() {
        let lastReportedProgress = 0;
        return evt => {
          const progress = (evt.bytesRead / fileSize) * 100;
          const currentTenPercent = Math.floor(progress / 10) * 10;
          
          // Only log when we cross a 10% threshold
          if (currentTenPercent > lastReportedProgress) {
            console.log(`${currentTenPercent}% complete`);
            lastReportedProgress = currentTenPercent;
          }
        };
      })()
    });
    
    // Success! Video uploaded
    console.log('Upload successful!');
    const videoId = res.data.id;
    const videoUrl = `https://youtu.be/${videoId}`;
    
    // Add to playlists if playlist IDs were provided
    const playlistResults = [];
    
    if (playlistIds.length > 0) {
      // Convert single ID to array for consistent processing if it's not already an array
      const playlistIdArray = Array.isArray(playlistIds) ? playlistIds : [playlistIds];
      
      // Filter out null/undefined/empty playlist IDs
      const validPlaylistIds = playlistIdArray.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      for (const playlistId of validPlaylistIds) {
        try {
          console.log(`Adding video to playlist: ${playlistId}`);
          const result = await youtube.playlistItems.insert({
            part: 'snippet',
            requestBody: {
              snippet: {
                playlistId: playlistId,
                resourceId: {
                  kind: 'youtube#video',
                  videoId: videoId
                }
              }
            }
          });
          console.log(`Successfully added to playlist: ${playlistId}`);
          playlistResults.push({
            playlistId,
            success: true
          });
        } catch (playlistError) {
          console.error(`Error adding to playlist ${playlistId}:`, playlistError);
          if (playlistError.response) {
            console.error('API response error:', playlistError.response.data);
          }
          playlistResults.push({
            playlistId,
            success: false,
            error: playlistError.message
          });
        }
      }
    }
    
    return {
      videoId,
      url: videoUrl,
      playlistResults: playlistResults.length > 0 ? playlistResults : null
    };
  } catch (error) {
    console.error('Error in upload:', error);
    
    // More detailed error information
    if (error.response) {
      console.error('API response error:', error.response.data);
    }
    
    throw error;
  }
}

// Command-line interface
async function main() {
  // Parse command line args or environment variables
  const videoPath = process.argv[2] || process.env.VIDEO_PATH;
  const title = process.argv[3] || process.env.VIDEO_TITLE;
  const descriptionFile = process.argv[4] || process.env.DESCRIPTION_FILE;
  
  if (!videoPath || !title) {
    console.error('Usage: node youtube-uploader.js <videoPath> <title> [descriptionFile]');
    console.error('   OR: Set environment variables VIDEO_PATH, VIDEO_TITLE, and optionally DESCRIPTION_FILE');
    process.exit(1);
  }
  
  // Verify the video file exists
  try {
    await fs.access(videoPath);
  } catch (error) {
    console.error(`Error: Video file not found at ${videoPath}`);
    process.exit(1);
  }
  
  // Read description file if provided
  let description = '';
  if (descriptionFile) {
    try {
      description = await fs.readFile(descriptionFile, 'utf8');
    } catch (error) {
      console.warn(`Warning: Could not read description file: ${error.message}`);
      description = title;
    }
  } else {
    description = title;
  }
  
  // Do the upload
  try {
    const result = await uploadToYouTube({
      videoPath,
      title,
      description,
      tags: ['Gainesville', 'City Meeting', 'Government'],
      categoryId: '25', // News & Politics
      privacyStatus: 'unlisted'
    });
    
    console.log('Upload successful!');
    console.log(`Video ID: ${result.videoId}`);
    console.log(`URL: ${result.url}`);
    
    // Return success info that could be consumed by other scripts
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

// Export for programmatic use
export { uploadToYouTube };
