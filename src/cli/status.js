#!/usr/bin/env node

import { getPipelineStats } from '../lib/database.js';
import { getQueueStats } from '../queue/job-manager.js';

/**
 * Display pipeline status and statistics
 */
async function showStatus() {
  try {
    console.log('🔍 Pipeline Status\n');
    
    // Get database stats
    const dbStats = await getPipelineStats();
    
    console.log('📊 Meeting Status:');
    for (const [status, count] of Object.entries(dbStats.meetings || {})) {
      const icon = getStatusIcon(status);
      console.log(`  ${icon} ${status}: ${count}`);
    }
    
    console.log('\n🗂️  Job Queue:');
    const queueStats = await getQueueStats();
    for (const [status, count] of Object.entries(queueStats)) {
      const icon = getQueueIcon(status);
      console.log(`  ${icon} ${status}: ${count}`);
    }
    
    console.log(`\n📈 Total: ${Object.values(dbStats.meetings || {}).reduce((a, b) => a + b, 0)} meetings`);
    
  } catch (error) {
    console.error('Error getting status:', error);
    process.exit(1);
  }
}

function getStatusIcon(status) {
  const icons = {
    'discovered': '🔍',
    'downloading': '⬇️',
    'downloaded': '💾',
    'uploading': '⬆️',
    'uploaded': '✅',
    'failed': '❌'
  };
  return icons[status] || '❓';
}

function getQueueIcon(status) {
  const icons = {
    'pending': '⏳',
    'processing': '⚙️',
    'completed': '✅',
    'failed': '❌'
  };
  return icons[status] || '❓';
}

// Run if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  showStatus().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { showStatus };