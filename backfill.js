#!/usr/bin/env node
import { initializeDatabase, getMeetingsByState, MeetingStates } from './db/init.js';
import { createQueue } from './queue/config.js';
import { QUEUE_NAMES } from './workflow/config.js';
import { runDiscovery } from './discover.js';
import 'dotenv/config';

async function getQueueStats(queue) {
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount()
  ]);
  
  return { waiting, active, completed, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find(arg => arg.startsWith('--from='));
  const toArg = args.find(arg => arg.startsWith('--to='));
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const maxQueueArg = args.find(arg => arg.startsWith('--max-queue='));
  const dryRun = args.includes('--dry-run');
  
  if (!fromArg) {
    console.error('Usage: node backfill.js --from=YYYY-MM-DD [--to=YYYY-MM-DD] [--batch-size=N] [--max-queue=N] [--dry-run]');
    console.error('Example: node backfill.js --from=2019-01-01 --batch-size=10 --max-queue=50');
    process.exit(1);
  }
  
  const fromDate = fromArg.replace('--from=', '');
  const toDate = toArg ? toArg.replace('--to=', '') : new Date().toISOString().split('T')[0];
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.replace('--batch-size=', '')) : 10;
  const maxQueueDepth = maxQueueArg ? parseInt(maxQueueArg.replace('--max-queue=', '')) : 100;
  
  console.log(JSON.stringify({
    message: 'Starting backfill',
    from: fromDate,
    to: toDate,
    batch_size: batchSize,
    max_queue_depth: maxQueueDepth,
    dry_run: dryRun,
    step: 'backfill_start'
  }));
  
  const db = await initializeDatabase();
  const queue = createQueue(QUEUE_NAMES.DOWNLOAD);
  
  try {
    // First, run discovery for the date range
    console.log(JSON.stringify({
      message: 'Running discovery',
      step: 'backfill_discovery'
    }));
    
    if (!dryRun) {
      await runDiscovery({ 
        startDate: fromDate, 
        endDate: toDate, 
        enqueueOnly: false 
      });
    }
    
    // Get all DISCOVERED meetings
    const discoveredMeetings = await getMeetingsByState(db, MeetingStates.DISCOVERED);
    console.log(JSON.stringify({
      message: 'Found meetings to process',
      count: discoveredMeetings.length,
      step: 'backfill_queue'
    }));
    
    if (dryRun) {
      console.log(JSON.stringify({
        message: 'Dry run - would enqueue meetings',
        meeting_ids: discoveredMeetings.map(m => m.id),
        step: 'backfill_dry_run'
      }));
      return;
    }
    
    // Process in batches
    let enqueuedCount = 0;
    for (let i = 0; i < discoveredMeetings.length; i += batchSize) {
      // Check queue depth
      const stats = await getQueueStats(queue);
      const currentDepth = stats.waiting + stats.active;
      
      if (currentDepth >= maxQueueDepth) {
        console.log(JSON.stringify({
          message: 'Queue depth limit reached, waiting',
          current_depth: currentDepth,
          max_depth: maxQueueDepth,
          step: 'backfill_throttle'
        }));
        
        // Wait for queue to drain
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const newStats = await getQueueStats(queue);
          const newDepth = newStats.waiting + newStats.active;
          
          if (newDepth < maxQueueDepth * 0.8) {
            console.log(JSON.stringify({
              message: 'Queue drained, resuming',
              current_depth: newDepth,
              step: 'backfill_resume'
            }));
            break;
          }
        }
      }
      
      // Enqueue batch
      const batch = discoveredMeetings.slice(i, i + batchSize);
      
      for (const meeting of batch) {
        await queue.add('process', { meetingId: meeting.id }, {
          jobId: `download-${meeting.id}`,
        });
        enqueuedCount++;
      }
      
      console.log(JSON.stringify({
        message: 'Enqueued batch',
        batch_start: i,
        batch_size: batch.length,
        total_enqueued: enqueuedCount,
        step: 'backfill_batch'
      }));
    }
    
    const finalStats = await getQueueStats(queue);
    console.log(JSON.stringify({
      message: 'Backfill complete',
      total_enqueued: enqueuedCount,
      queue_stats: finalStats,
      step: 'backfill_complete'
    }));
    
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Backfill error',
      error: error.message,
      stack: error.stack,
      step: 'backfill_error'
    }));
    process.exit(1);
  } finally {
    await db.close();
    await queue.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}