import fs from 'fs/promises';
import path from 'path';
import { createJob, getNextJob, updateJobStatus } from '../lib/database.js';

const JOBS_DIR = path.join(process.cwd(), 'data', 'jobs');

/**
 * Initialize job queue directories
 */
export async function initJobQueue() {
  await fs.mkdir(path.join(JOBS_DIR, 'pending'), { recursive: true });
  await fs.mkdir(path.join(JOBS_DIR, 'processing'), { recursive: true });
  await fs.mkdir(path.join(JOBS_DIR, 'completed'), { recursive: true });
  await fs.mkdir(path.join(JOBS_DIR, 'failed'), { recursive: true });
}

/**
 * Create a new job and add it to the queue
 */
export async function createJobWithQueue(meetingId, type, payload = {}) {
  // Create job in database
  const jobId = await createJob(meetingId, type, payload);
  
  // Create job file in pending directory
  const jobFile = {
    id: jobId,
    meetingId,
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  
  const filename = `${type}-${meetingId}-${jobId}.json`;
  const filepath = path.join(JOBS_DIR, 'pending', filename);
  
  await fs.writeFile(filepath, JSON.stringify(jobFile, null, 2));
  
  return jobId;
}

/**
 * Get next available job from queue
 */
export async function getNextJobFromQueue(type) {
  await initJobQueue();
  
  const pendingDir = path.join(JOBS_DIR, 'pending');
  
  try {
    const files = await fs.readdir(pendingDir);
    const jobFiles = files.filter(f => f.startsWith(`${type}-`) && f.endsWith('.json'));
    
    if (jobFiles.length === 0) {
      return null;
    }
    
    // Get oldest job file
    const jobFile = jobFiles.sort()[0];
    const jobPath = path.join(pendingDir, jobFile);
    
    // Read job data
    const jobData = await fs.readFile(jobPath, 'utf8');
    const job = JSON.parse(jobData);
    
    // Move to processing directory
    const processingPath = path.join(JOBS_DIR, 'processing', jobFile);
    await fs.rename(jobPath, processingPath);
    
    // Update job status in database
    await updateJobStatus(job.id, 'processing');
    
    return {
      ...job,
      filePath: processingPath
    };
  } catch (error) {
    console.error('Error getting next job:', error);
    return null;
  }
}

/**
 * Mark job as completed
 */
export async function completeJob(job, result = {}) {
  try {
    // Update database
    await updateJobStatus(job.id, 'completed');
    
    // Move job file to completed directory
    const completedPath = job.filePath.replace('/processing/', '/completed/');
    await fs.rename(job.filePath, completedPath);
    
    // Optionally save result
    if (Object.keys(result).length > 0) {
      const resultFile = completedPath.replace('.json', '-result.json');
      await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
    }
    
    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`Error completing job ${job.id}:`, error);
    await failJob(job, error.message);
  }
}

/**
 * Mark job as failed
 */
export async function failJob(job, errorMessage) {
  try {
    // Update database
    await updateJobStatus(job.id, 'failed', errorMessage);
    
    // Move job file to failed directory
    const failedPath = job.filePath.replace('/processing/', '/failed/');
    await fs.rename(job.filePath, failedPath);
    
    // Save error info
    const errorFile = failedPath.replace('.json', '-error.json');
    await fs.writeFile(errorFile, JSON.stringify({
      jobId: job.id,
      error: errorMessage,
      failedAt: new Date().toISOString()
    }, null, 2));
    
    console.error(`Job ${job.id} failed: ${errorMessage}`);
  } catch (error) {
    console.error(`Error failing job ${job.id}:`, error);
  }
}

/**
 * Create download jobs for meetings
 */
export async function createDownloadJobs(meetings) {
  const jobs = [];
  
  for (const meeting of meetings) {
    const jobId = await createJobWithQueue(meeting.id, 'download', {
      meetingId: meeting.id,
      title: meeting.title,
      meetingUrl: meeting.meetingUrl || meeting.meeting_url,
      startDate: meeting.startDate || meeting.date
    });
    
    jobs.push(jobId);
  }
  
  console.log(`Created ${jobs.length} download jobs`);
  return jobs;
}

/**
 * Create upload jobs for meetings  
 */
export async function createUploadJobs(meetings) {
  const jobs = [];
  
  for (const meeting of meetings) {
    const jobId = await createJobWithQueue(meeting.id, 'upload', {
      meetingId: meeting.id,
      title: meeting.title,
      downloadPath: meeting.download_path,
      metadataPath: meeting.metadata_path
    });
    
    jobs.push(jobId);
  }
  
  console.log(`Created ${jobs.length} upload jobs`);
  return jobs;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  await initJobQueue();
  
  const stats = {};
  const dirs = ['pending', 'processing', 'completed', 'failed'];
  
  for (const dir of dirs) {
    try {
      const files = await fs.readdir(path.join(JOBS_DIR, dir));
      stats[dir] = files.filter(f => f.endsWith('.json') && !f.includes('-result') && !f.includes('-error')).length;
    } catch (error) {
      stats[dir] = 0;
    }
  }
  
  return stats;
}

/**
 * Clean up old completed and failed jobs
 */
export async function cleanupOldJobs(daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const dirs = ['completed', 'failed'];
  let cleaned = 0;
  
  for (const dir of dirs) {
    try {
      const dirPath = path.join(JOBS_DIR, dir);
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      console.error(`Error cleaning up ${dir} jobs:`, error);
    }
  }
  
  console.log(`Cleaned up ${cleaned} old job files`);
  return cleaned;
}