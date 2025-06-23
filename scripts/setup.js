#!/usr/bin/env node

import { initDatabase } from '../src/lib/database.js';
import { initJobQueue } from '../src/queue/job-manager.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Initialize a new deployment environment
 */
async function setup() {
  try {
    console.log('🚀 Setting up Gainesville City Meetings Pipeline...\n');
    
    // Create required directories
    console.log('📁 Creating directory structure...');
    const directories = [
      'data',
      'data/jobs',
      'downloads',
      'downloads/metadata', 
      'downloads/youtube-chapters',
      'logs'
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
      console.log(`  ✓ ${dir}/`);
    }
    
    // Initialize database
    console.log('\n💾 Initializing database...');
    await initDatabase();
    console.log('  ✓ Database schema created');
    
    // Initialize job queue
    console.log('\n📋 Setting up job queue...');
    await initJobQueue();
    console.log('  ✓ Job queue directories ready');
    
    // Check for .env file
    console.log('\n⚙️  Configuration check...');
    try {
      await fs.access('.env');
      console.log('  ✓ .env file found');
    } catch (error) {
      console.log('  ⚠️  .env file not found');
      console.log('     Copy .env.example to .env and configure your settings');
    }
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Configure .env with your API credentials');
    console.log('  2. Run: npm run status');
    console.log('  3. Run: npm run migrate (if you have existing data)');
    console.log('  4. Run: npm run process');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  setup().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { setup };