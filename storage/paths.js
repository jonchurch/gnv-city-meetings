import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Base directories - in future can be swapped to S3 paths
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, '..', 'downloads');
const RAW_DIR = path.join(STORAGE_ROOT, 'raw');
const DERIVED_DIR = path.join(STORAGE_ROOT, 'derived');

export const StorageTypes = {
  RAW_VIDEO: 'raw_video',
  RAW_AGENDA: 'raw_agenda',
  RAW_TRANSCRIPT: 'raw_transcript',
  DERIVED_CHAPTERS: 'derived_chapters',
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
      
    case StorageTypes.RAW_AGENDA:
      return path.join(RAW_DIR, 'agendas', `${safeId}_agenda.html`);
      
    case StorageTypes.RAW_TRANSCRIPT:
      return path.join(RAW_DIR, 'transcripts', `${safeId}_transcript.txt`);
      
    case StorageTypes.DERIVED_CHAPTERS:
      return path.join(DERIVED_DIR, 'chapters', `${safeId}_chapters.txt`);
      
    case StorageTypes.DERIVED_DIARIZED:
      return path.join(DERIVED_DIR, 'diarized', `${safeId}_diarized.jsonl`);
      
    case StorageTypes.DERIVED_METADATA:
      return path.join(DERIVED_DIR, 'metadata', `${safeId}_metadata.json`);
      
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
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
  const { promises: fs } = await import('fs');
  
  const dirs = Object.values(StorageTypes).map(type => dirFor(type));
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Check if a file exists in storage
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @returns {Promise<boolean>}
 */
export async function exists(type, meetingId) {
  const { promises: fs } = await import('fs');
  const filePath = pathFor(type, meetingId);
  
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Future-proof method for getting S3 URLs
 * @param {string} type - One of StorageTypes
 * @param {string} meetingId - Meeting ID
 * @returns {string} - URL or path
 */
export function urlFor(type, meetingId) {
  // For now, return file:// URLs
  // In future, this could return S3 URLs
  const filePath = pathFor(type, meetingId);
  return `file://${filePath}`;
}