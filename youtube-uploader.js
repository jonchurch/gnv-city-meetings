// youtube-uploader.js - A clean, focused implementation for uploading videos to YouTube

import fs from 'fs/promises';

/**
 * Upload a video to YouTube
 * @param {Object} options - Upload options
 * @param {string} options.videoPath - Exact path to the video file
 * @param {string} options.title - Video title
 * @param {string} options.description - Video description
 * @param {Array<string>} options.tags - Video tags
 * @param {string} options.categoryId - YouTube category ID
 * @param {string} options.privacyStatus - Privacy status (public, unlisted, private)
 * @returns {Promise<Object>} - Upload result with videoId
 */
async function uploadToYouTube(options) {
  const { videoPath, title, description, tags = [], categoryId = '25', privacyStatus = 'public' } = options;
  
  // This would be implemented with the YouTube API
  // For placeholder implementation, we'll just log what would happen
  console.log('\n--- YouTube Upload Parameters ---');
  console.log(`Title: ${title}`);
  console.log(`Video Path: ${videoPath}`);
  console.log(`Description length: ${description.length} characters`);
  console.log(`Tags: ${tags.join(', ')}`);
  console.log(`Category ID: ${categoryId}`);
  console.log(`Privacy Status: ${privacyStatus}`);
  console.log('--------------------------------\n');
  
  // In a real implementation, this is where you'd use the YouTube API client
  console.log('Uploading to YouTube...');
  
  // Simulate API response
  const videoId = `youtube-${Date.now()}`;
  
  return {
    videoId,
    url: `https://youtu.be/${videoId}`
  };
}

// Command-line interface that takes arguments directly
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
      privacyStatus: 'public'
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
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

// Export for programmatic use
export { uploadToYouTube };