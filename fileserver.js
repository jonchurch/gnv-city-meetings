import express from 'express';
import multer from 'multer';

import { pathFor } from './storage/paths.js'

const PORT = process.env.FILE_SERVER_PORT || 3000

const app = express();

app.use('/files', express.static(process.env.STORAGE_ROOT || './downloads'));

const upload = multer({ dest: '/tmp/uploads/' });
app.post('/upload/:type/:meetingId', upload.single('file'), async (req, res) => {
  const { type, meetingId } = req.params;
  const destPath = pathFor(type, meetingId);
  
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.rename(req.file.path, destPath);
  
  res.json({ success: true, path: destPath });
});

app.listen(PORT, '0.0.0.0', (err) => {

  if (err) {
    console.log(err)
    console.error(`Couldn't start fileserver: ${err.message}`)
    process.exit(1)
  }
  console.log(`Server listening on port ${PORT}`)
});
