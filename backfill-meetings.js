#!/usr/bin/env node

/**
 * Backfill script to process meetings from 2020 to April 2025
 * Processes one month at a time to avoid overwhelming the system
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import 'dotenv/config';

const execAsync = promisify(exec);

// Format date to ISO string with timezone offset
function toISOStringWithOffset(date) {
  const pad = num => String(num).padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  
  return `${year}-${month}-${day}T00:00:00-04:00`;
}

// Process a specific month
async function processMonth(year, month) {
  try {
    console.log(`\n=== Processing meetings for ${year}-${month.toString().padStart(2, '0')} ===`);
    
    // Create start and end dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    
    const startDateString = toISOStringWithOffset(startDate);
    const endDateString = toISOStringWithOffset(endDate);
    
    console.log(`Date range: ${startDateString} to ${endDateString}`);
    
    // Build the command
    const command = `node unified-processor.js --start=${startDateString} --end=${endDateString}`;
    console.log(`Executing: ${command}`);
    
    // Execute the command
    const { stdout, stderr } = await execAsync(command);
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    return true;
  } catch (error) {
    console.error(`Error processing ${year}-${month}:`, error);
    return false;
  }
}

// Main function to backfill meetings
async function backfillMeetings() {
  // Define the date range (January 2020 to April 2025)
  const startYear = 2020;
  const startMonth = 1;
  const endYear = 2025;
  const endMonth = 4;
  
  // Process each month
  let successCount = 0;
  let failCount = 0;
  let currentYear = startYear;
  let currentMonth = startMonth;
  
  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    console.log(`\nProcessing year ${currentYear}, month ${currentMonth}`);
    
    // Add a delay between months to avoid rate limiting
    if (currentYear !== startYear || currentMonth !== startMonth) {
      console.log('Pausing for 5 seconds before processing next month...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    const success = await processMonth(currentYear, currentMonth);
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Move to the next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }
  
  // Log summary
  console.log('\n=== Backfill Complete ===');
  console.log(`Total months processed: ${successCount + failCount}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

// Run the backfill
backfillMeetings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});