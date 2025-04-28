import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const METADATA_DIR = './downloads/metadata';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generate YouTube chapters format from agenda metadata
 * @param {string} metadataFilePath - Path to the agenda metadata JSON file
 * @returns {string} - YouTube chapters format text
 */
async function generateYouTubeChapters(metadataFilePath) {
  try {
    // Read and parse the metadata file
    const metadata = JSON.parse(await fs.readFile(metadataFilePath, 'utf8'));
    const { meetingTitle, meetingDate, agendaItems } = metadata;
    
    // Filter out items without timestamps and sort by timeStart
    const chaptersItems = agendaItems
      .filter(item => item.timeStart !== null)
      .sort((a, b) => a.timeStart - b.timeStart);
    
    if (chaptersItems.length === 0) {
      console.log('No timestamped agenda items found');
      return '';
    }
    
    // Format the date for the title
    const formattedDate = meetingDate.split(' ')[0].replace(/\//g, '-');
    
    // Create chapter lines in YouTube format (00:00:00 Chapter Title)
    let chaptersText = `${meetingTitle} - ${formattedDate}\n\n`;
    chaptersText += 'Chapters:\n';
    
    for (const item of chaptersItems) {
      // YouTube requires the first chapter to start at 00:00:00
      // If our first chapter doesn't start at 0, add a "Pre-meeting" chapter
      if (item === chaptersItems[0] && item.startTime !== '00:00:00') {
        chaptersText += `00:00:00 Pre-meeting\n`;
      }
      
      chaptersText += `${item.startTime} ${item.title}\n`;
    }
    
    return chaptersText;
  } catch (error) {
    console.error('Error generating YouTube chapters:', error);
    throw error;
  }
}

/**
 * Generate YouTube chapters for all metadata files
 */
async function generateAllYouTubeChapters() {
  try {
    // Create output directory
    const outputDir = path.join(__dirname, 'downloads', 'youtube-chapters');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Get all metadata files
    const metadataDir = path.join(__dirname, METADATA_DIR);
    const files = await fs.readdir(metadataDir);
    const metadataFiles = files.filter(file => file.endsWith('_agenda.json'));
    
    console.log(`Found ${metadataFiles.length} metadata files`);
    
    for (const file of metadataFiles) {
      const metadataPath = path.join(metadataDir, file);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      // Create output filename based on meeting date and title
      const { meetingTitle, meetingDate } = metadata;
      const safeDate = meetingDate.split(' ')[0].replace(/\//g, '-');
      const safeTitle = meetingTitle.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
      const outputFilename = `${safeDate}_${safeTitle}_youtube_chapters.txt`;
      const outputPath = path.join(outputDir, outputFilename);
      
      // Generate chapters
      const chaptersText = await generateYouTubeChapters(metadataPath);
      
      if (chaptersText) {
        // Write to file
        await fs.writeFile(outputPath, chaptersText);
        console.log(`Generated YouTube chapters for ${safeTitle} (${safeDate}) at: ${outputPath}`);
      } else {
        console.log(`No chapters generated for ${safeTitle} (${safeDate})`);
      }
    }
  } catch (error) {
    console.error('Error generating all YouTube chapters:', error);
    throw error;
  }
}

// Run the generator
generateAllYouTubeChapters().catch(console.error);