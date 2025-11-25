#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const meetingId = process.argv[2];
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';

if (!meetingId) {
  console.error('Usage: node generate-meeting-pages.js <meeting-id>');
  process.exit(1);
}

const OUTPUT_DIR = '.tmp.local/pages';

/**
 * Format seconds to YouTube timestamp parameter (e.g., 202 -> 202)
 */
function formatYouTubeTime(seconds) {
  return Math.floor(seconds);
}

/**
 * Format seconds to readable time (MM:SS or H:MM:SS)
 */
function formatReadableTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Extract YouTube video ID from URL
 */
function getYouTubeVideoId(url) {
  if (!url) return null;

  // Handle different YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^?&\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Generate meeting index page
 */
async function generateMeetingIndex(meeting, chunks) {
  const videoId = getYouTubeVideoId(meeting.youtube_url);
  const formattedDate = new Date(meeting.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let content = `# ${meeting.title}\n\n`;
  content += `**Date:** ${formattedDate}\n\n`;
  content += `**Status:** ${meeting.processing_status}\n\n`;

  if (videoId) {
    content += `## Full Meeting Video\n\n`;
    content += `[![Watch on YouTube](https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)](${meeting.youtube_url})\n\n`;
    content += `[Watch on YouTube](${meeting.youtube_url})\n\n`;
  }

  content += `---\n\n`;
  content += `## Chapters (${chunks.length})\n\n`;

  // Table of contents
  for (const chunk of chunks) {
    const timestamp = formatReadableTime(chunk.start_time);
    const duration = chunk.end_time - chunk.start_time;
    const durationMins = Math.floor(duration / 60);
    const durationSecs = Math.floor(duration % 60);
    const durationText = `${durationMins}m ${durationSecs}s`;
    const chunkFile = `chunk-${chunk.sequence_number}.md`;
    const typeEmoji = {
      procedural: '📋',
      presentation: '📊',
      discussion: '💬',
      public_comment: '🎤',
      vote: '🗳️'
    }[chunk.chunk_type] || '📄';

    content += `### ${chunk.sequence_number}. [${chunk.title}](./${chunkFile}) ${typeEmoji}\n\n`;
    content += `**Time:** ${timestamp} | **Duration:** ${durationText} | **Type:** ${chunk.chunk_type}\n\n`;
    content += `${chunk.summary}\n\n`;
    content += `[View Chapter →](./${chunkFile})\n\n`;
    content += `---\n\n`;
  }

  return content;
}

/**
 * Generate individual chunk page
 */
async function generateChunkPage(meeting, chunk, chunkIndex, totalChunks, apiBaseUrl) {
  const videoId = getYouTubeVideoId(meeting.youtube_url);
  const startTime = formatYouTubeTime(chunk.start_time);
  const readableTime = formatReadableTime(chunk.start_time);
  const duration = chunk.end_time - chunk.start_time;
  const durationMins = Math.floor(duration / 60);
  const durationSecs = Math.floor(duration % 60);
  const durationText = `${durationMins}m ${durationSecs}s`;

  let content = '';

  // Breadcrumb navigation
  content += `[← Back to Meeting](./meeting.md)`;
  if (chunkIndex > 0) {
    content += ` | [← Previous Chapter](./chunk-${chunk.sequence_number - 1}.md)`;
  }
  if (chunkIndex < totalChunks - 1) {
    content += ` | [Next Chapter →](./chunk-${chunk.sequence_number + 1}.md)`;
  }
  content += `\n`;

  // Title
  content += `# ${chunk.title}\n\n`;

  // Time info and meeting
  content += `${readableTime} ⏱️ ${durationText} | **Meeting:** ${meeting.title}\n`;
  content += `**Type:** ${chunk.chunk_type}\n\n`;

  // Video embed
  if (videoId) {
    content += `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=0&mute=1&cc_load_policy=1" `;
    content += `frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" `;
    content += `allowfullscreen></iframe>\n\n`;
  }

  content += `---\n\n`;

  // Summary
  content += `## Summary\n\n`;
  content += `${chunk.summary}\n\n`;

  content += `---\n\n`;

  // Transcript
  content += `## Transcript\n\n`;

  // Fetch chunk with transcript via API
  const chunkResponse = await fetch(`${apiBaseUrl}/api/chunks/${chunk.id}`);

  if (chunkResponse.ok) {
    const chunkWithTranscript = await chunkResponse.json();

    if (chunkWithTranscript.transcript_lines && chunkWithTranscript.transcript_lines.length > 0) {
      let currentSpeaker = null;

      for (const line of chunkWithTranscript.transcript_lines) {
        const timestamp = formatReadableTime(line.start_time);
        const speaker = line.speaker?.name || line.whisperx_speaker_label || 'Unknown';

        // Group consecutive lines from same speaker
        if (speaker !== currentSpeaker) {
          if (currentSpeaker !== null) {
            content += `\n\n`;
          }
          content += `>>**${speaker}** [${timestamp}]\n\n`;
          currentSpeaker = speaker;
        }

        content += `${line.text}\n\n`;
      }

      content += `\n\n`;
    } else {
      content += `*No transcript available for this chapter.*\n\n`;
    }
  } else {
    content += `*Failed to load transcript.*\n\n`;
  }

  content += `---\n\n\n`;

  // Navigation footer
  content += `[← Back to Meeting](./meeting.md)`;
  if (chunkIndex > 0) {
    content += ` | [← Previous Chapter](./chunk-${chunk.sequence_number - 1}.md)`;
  }
  if (chunkIndex < totalChunks - 1) {
    content += ` | [Next Chapter →](./chunk-${chunk.sequence_number + 1}.md)`;
  }
  content += `\n\n`;

  return content;
}

async function main() {
  console.log(`Generating pages for meeting: ${meetingId}\n`);
  console.log(`API: ${API_BASE_URL}\n`);

  // Fetch meeting and chunks via API
  const meetingResponse = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`);

  if (!meetingResponse.ok) {
    console.error(`Failed to fetch meeting: ${meetingResponse.status} ${meetingResponse.statusText}`);
    process.exit(1);
  }

  const meeting = await meetingResponse.json();
  const chunks = meeting.chunks || [];

  if (chunks.length === 0) {
    console.error(`No chunks found for meeting ${meetingId}`);
    process.exit(1);
  }

  // Create output directory
  const meetingDir = path.join(OUTPUT_DIR, meetingId);
  await fs.mkdir(meetingDir, { recursive: true });

  console.log(`Output directory: ${meetingDir}`);
  console.log(`Generating ${chunks.length} chunk pages...\n`);

  // Generate meeting index
  const meetingContent = await generateMeetingIndex(meeting, chunks);
  const meetingPath = path.join(meetingDir, 'meeting.md');
  await fs.writeFile(meetingPath, meetingContent);
  console.log(`✓ Generated ${meetingPath}`);

  // Generate chunk pages
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkContent = await generateChunkPage(meeting, chunk, i, chunks.length, API_BASE_URL);
    const chunkPath = path.join(meetingDir, `chunk-${chunk.sequence_number}.md`);
    await fs.writeFile(chunkPath, chunkContent);
    console.log(`✓ Generated chunk-${chunk.sequence_number}.md`);
  }

  console.log(`\n✅ Done! Generated ${chunks.length + 1} pages in ${meetingDir}/`);
  console.log(`\nOpen the meeting index:`);
  console.log(`  open ${meetingPath}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
