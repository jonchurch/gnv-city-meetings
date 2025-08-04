import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import FormData from 'form-data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Base directories - in future can be swapped to S3 paths
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, '..', 'downloads');
const RAW_DIR = path.join(STORAGE_ROOT, 'raw');
const DERIVED_DIR = path.join(STORAGE_ROOT, 'derived');

// Remote file server configuration
const FILE_SERVER_HOST = process.env.FILE_SERVER_HOST || 'localhost';
const FILE_SERVER_PORT = process.env.FILE_SERVER_PORT || '3000';
const IS_LOCAL = process.env.IS_LOCAL === 'true' || process.env.HOSTNAME === FILE_SERVER_HOST;

export const StorageTypes = {
  RAW_VIDEO: 'raw_video',
  RAW_AUDIO: 'raw_audio',
  RAW_AGENDA: 'raw_agenda',
  RAW_TRANSCRIPT: 'raw_transcript',
  DERIVED_CHAPTERS: 'derived_chapters',
  DERIVED_AUDIO: 'derived_audio',
  DERIVED_DIARIZED: 'derived_diarized',
  DERIVED_METADATA: 'derived_metadata',
};

/**
 * Get deterministic path for a storage artifact
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @param {Object} options - Optional parameters
 * @returns {string} - Absolute path to the file
 */
export function pathFor(type, meetingId, options = {}) {
  const safeId = meetingId.replace(/[^a-zA-Z0-9]/g, '_');
  
  switch (type) {
    case StorageTypes.RAW_VIDEO:
      return path.join(RAW_DIR, 'videos', `${safeId}.mp4`);
      
    case StorageTypes.RAW_AUDIO:
      return path.join(RAW_DIR, 'audio', `${safeId}.mp3`);
      
    case StorageTypes.RAW_AGENDA:
      return path.join(RAW_DIR, 'agendas', `${safeId}_agenda.html`);
      
    case StorageTypes.RAW_TRANSCRIPT:
      return path.join(RAW_DIR, 'transcripts', `${safeId}_transcript.txt`);
      
    case StorageTypes.DERIVED_CHAPTERS:
      return path.join(DERIVED_DIR, 'chapters', `${safeId}_chapters.txt`);
      
    case StorageTypes.DERIVED_AUDIO:
      return path.join(DERIVED_DIR, 'audio', `${safeId}.m4a`);
      
    case StorageTypes.DERIVED_DIARIZED:
      return path.join(DERIVED_DIR, 'diarized', `${safeId}_diarized.json`);
      
    case StorageTypes.DERIVED_METADATA:
      return path.join(DERIVED_DIR, 'metadata', `${safeId}_metadata.json`);
      
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

/**
 * Get HTTP URL for remote file access
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @returns {string} - HTTP URL for the file
 */
export function urlFor(type, meetingId) {
  const localPath = pathFor(type, meetingId);
  const relativePath = path.relative(STORAGE_ROOT, localPath);
  return `http://${FILE_SERVER_HOST}:${FILE_SERVER_PORT}/files/${relativePath}`;
}

/**
 * Get the directory for a storage type
 * @param {string} type - One of StorageTypes
 * @returns {string} - Directory path
 */
export function dirFor(type) {
  const typeDir = pathFor(type, 'dummy');
  return path.dirname(typeDir);
}

/**
 * Create all storage directories
 */
export async function ensureStorageDirs() {
  const dirs = Object.values(StorageTypes).map(type => dirFor(type));
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Download a file from remote storage to local path
 * @param {string} url - Remote URL to download from
 * @param {string} localPath - Local path to save to
 */
async function downloadFileFromUrl(url, localPath) {
  console.log(JSON.stringify({
    message: 'Downloading file',
    url: url.replace(FILE_SERVER_HOST, '[HOST]'), // Don't log internal hostnames
    local_path: localPath,
    step: 'download_start'
  }));
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  
  console.log(JSON.stringify({
    message: 'File downloaded successfully',
    local_path: localPath,
    size_bytes: buffer.length,
    step: 'download_complete'
  }));
}

/**
 * Upload a file from local path to remote storage
 * @param {string} localPath - Local file to upload
 * @param {string} type - Storage type for upload endpoint
 * @param {string} meetingId - Meeting ID for upload endpoint
 */
async function uploadFileToRemote(localPath, type, meetingId) {
  const form = new FormData();
  form.append('file', fs.createReadStream(localPath));
  
  const uploadUrl = `http://${FILE_SERVER_HOST}:${FILE_SERVER_PORT}/upload/${type}/${meetingId}`;
  
  console.log(JSON.stringify({
    message: 'Uploading file',
    local_path: localPath,
    upload_url: uploadUrl.replace(FILE_SERVER_HOST, '[HOST]'),
    step: 'upload_start'
  }));
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: form
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const result = await response.json();
  
  console.log(JSON.stringify({
    message: 'File uploaded successfully',
    result,
    step: 'upload_complete'
  }));
  
  return result;
}

/**
 * Read a file from storage to local path (handles local vs remote)
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @param {string} localPath - Local path to save file to
 */
export async function readFile(type, meetingId, localPath) {
  if (IS_LOCAL) {
    // Fast local filesystem copy
    const sourcePath = pathFor(type, meetingId);
    await fs.copyFile(sourcePath, localPath);
    
    console.log(JSON.stringify({
      message: 'File copied locally',
      source_path: sourcePath,
      local_path: localPath,
      step: 'local_copy'
    }));
  } else {
    // Remote download via HTTP
    const url = urlFor(type, meetingId);
    await downloadFileFromUrl(url, localPath);
  }
}

/**
 * Write a file from local path to storage (handles local vs remote)
 * @param {string} localPath - Local file to store
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 */
export async function writeFile(localPath, type, meetingId) {
  if (IS_LOCAL) {
    // Fast local filesystem copy
    const destPath = pathFor(type, meetingId);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(localPath, destPath);
    
    console.log(JSON.stringify({
      message: 'File copied locally',
      local_path: localPath,
      dest_path: destPath,
      step: 'local_copy'
    }));
  } else {
    // Remote upload via HTTP
    await uploadFileToRemote(localPath, type, meetingId);
  }
}

/**
 * Check if a file exists in storage
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @returns {Promise<boolean>}
 */
export async function exists(type, meetingId) {
  if (IS_LOCAL) {
    const filePath = pathFor(type, meetingId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  } else {
    // Check via HTTP HEAD request
    const url = urlFor(type, meetingId);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Get file size in bytes
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @returns {Promise<number>} - File size in bytes
 */
export async function getFileSize(type, meetingId) {
  if (IS_LOCAL) {
    const filePath = pathFor(type, meetingId);
    const stats = await fs.stat(filePath);
    return stats.size;
  } else {
    // Get size via HTTP HEAD request
    const url = urlFor(type, meetingId);
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`File not found: ${url}`);
    }
    return parseInt(response.headers.get('content-length') || '0');
  }
}
