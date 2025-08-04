#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { 
  initializeDatabase, 
  getMeeting, 
  getMeetingsByState,
  getMeetingsToProcess,
  insertMeeting,
  updateMeetingState 
} from '../db/init.js';
import 'dotenv/config';

const PORT = process.env.MEETINGS_API_PORT || 3001;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database once
let db;

async function setupDatabase() {
  db = await initializeDatabase();
  console.log('Database initialized');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'meetings-api' });
});

// Get a single meeting
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const meeting = await getMeeting(db, req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(meeting);
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get meetings by state
app.get('/api/meetings', async (req, res) => {
  try {
    const { state } = req.query;
    
    if (state) {
      const meetings = await getMeetingsByState(db, state);
      return res.json(meetings);
    }
    
    // Get all meetings to process if no state specified
    const meetings = await getMeetingsToProcess(db);
    res.json(meetings);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new meeting
app.post('/api/meetings', async (req, res) => {
  try {
    const result = await insertMeeting(db, req.body);
    res.status(201).json({ 
      success: true, 
      id: req.body.id,
      changes: result.changes 
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update meeting state
app.patch('/api/meetings/:id/state', async (req, res) => {
  try {
    const { state, data } = req.body;
    
    if (!state) {
      return res.status(400).json({ error: 'State is required' });
    }
    
    const result = await updateMeetingState(db, req.params.id, state, data || {});
    res.json({ 
      success: true,
      changes: result.changes 
    });
  } catch (error) {
    console.error('Error updating meeting state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update meeting (general update)
app.patch('/api/meetings/:id', async (req, res) => {
  try {
    const updates = [];
    const values = [];
    
    // Build dynamic update query
    Object.entries(req.body).forEach(([key, value]) => {
      if (key !== 'id') {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);
    
    const sql = `UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`;
    const result = await db.run(sql, ...values);
    
    res.json({ 
      success: true,
      changes: result.changes 
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function start() {
  try {
    await setupDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Meetings API listening on http://0.0.0.0:${PORT}`);
      console.log(JSON.stringify({
        message: 'Meetings API started',
        port: PORT,
        step: 'api_start'
      }));
    });
  } catch (error) {
    console.error('Failed to start API:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database...');
  if (db) await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database...');
  if (db) await db.close();
  process.exit(0);
});

start();