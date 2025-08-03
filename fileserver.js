import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { pathFor, StorageTypes } from './storage/paths.js';

const PORT = process.env.FILE_SERVER_PORT || 3000;
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), 'downloads');

const app = express();

function isValidStorageType(type) {
  return Object.values(StorageTypes).includes(type);
}

function isValidMeetingId(meetingId) {
  if (!meetingId || typeof meetingId !== 'string') return false;
  if (meetingId.length > 100) return false; // Reasonable limit
  return /^[a-zA-Z0-9_-]+$/.test(meetingId);
}

function isPathSafe(filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(STORAGE_ROOT);
    return resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot;
  } catch {
    return false;
  }
}

app.use('/files', (req, res, next) => {
  const requestedPath = path.join(STORAGE_ROOT, req.path);
  
  if (!isPathSafe(requestedPath)) {
    console.error(`Path traversal attempt blocked: ${req.path}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
}, express.static(STORAGE_ROOT, {
  dotfiles: 'deny',  // Don't serve hidden files
  index: false       // Don't serve directory listings
}));

const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: {
    files: 1
  }
});

app.post('/upload/:type/:meetingId', upload.single('file'), async (req, res) => {
  try {
    const { type, meetingId } = req.params;
    
    // Validate inputs
    if (!isValidStorageType(type)) {
      await fs.unlink(req.file.path).catch(() => {}); // Clean up temp file
      return res.status(400).json({ error: 'Invalid storage type' });
    }
    
    if (!isValidMeetingId(meetingId)) {
      await fs.unlink(req.file.path).catch(() => {}); // Clean up temp file
      return res.status(400).json({ error: 'Invalid meeting ID format' });
    }
    
    const destPath = pathFor(type, meetingId);
    
    // Verify destination is within storage root
    if (!isPathSafe(destPath)) {
      await fs.unlink(req.file.path).catch(() => {}); // Clean up temp file
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(req.file.path, destPath);
    
    console.log(`File uploaded: type=${type}, meetingId=${meetingId}, size=${req.file.size}`);
    res.json({ success: true, path: path.relative(STORAGE_ROOT, destPath) });
    
  } catch (error) {
    console.error(`Upload error: ${error.message}`);
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    storage_root: STORAGE_ROOT,
    uptime: process.uptime()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(`Server error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Couldn't start fileserver: ${err.message}`);
    process.exit(1);
  }
  console.log(`File server listening on port ${PORT}`);
  console.log(`Storage root: ${STORAGE_ROOT}`);
});
