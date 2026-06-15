const fs = require('fs');
const path = require('path');
const prisma = require('../db');

/**
 * Purges old events and their associated images from disk.
 * Default retention is 30 days unless RETENTION_DAYS is specified in .env.
 */
async function purgeOldData() {
  const retentionDays = parseInt(process.env.RETENTION_DAYS) || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  console.log(`[PURGE SERVICE] Starting purge check. Deleting data older than ${retentionDays} days (before ${cutoffDate.toISOString()})...`);

  try {
    // 1. Find all events that are older than cutoff date
    const oldEvents = await prisma.event.findMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      },
      select: {
        id: true,
        imageUrl: true
      }
    });

    if (oldEvents.length === 0) {
      console.log('[PURGE SERVICE] No records found for purge.');
      return 0;
    }

    console.log(`[PURGE SERVICE] Found ${oldEvents.length} records to purge.`);

    // 2. Delete corresponding images on disk
    let deletedFilesCount = 0;
    for (const event of oldEvents) {
      if (event.imageUrl && event.imageUrl.startsWith('/uploads/') && !event.imageUrl.includes('mock_plate')) {
        const relativePath = event.imageUrl.replace('/uploads/', '');
        const absolutePath = path.join(__dirname, '../../uploads', relativePath);
        
        try {
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            deletedFilesCount++;
          }
        } catch (err) {
          console.error(`[PURGE SERVICE] Failed to delete image file: ${absolutePath}`, err);
        }
      }
    }

    // 3. Delete database records
    const deleteResult = await prisma.event.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    });

    console.log(`[PURGE SERVICE] Purged ${deleteResult.count} database records and ${deletedFilesCount} image files.`);
    return deleteResult.count;
  } catch (error) {
    console.error('[PURGE SERVICE] Error running purge schedule:', error);
    throw error;
  }
}

// Start daily cron-like interval timer
function startPurgeScheduler() {
  // Run every 24 hours
  const INTERVAL = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      await purgeOldData();
    } catch (e) {
      console.error('[PURGE SERVICE] Scheduled purge execution failed:', e);
    }
  }, INTERVAL);
  
  console.log(`[PURGE SERVICE] Scheduler initialized to run every 24 hours. Retention set to ${process.env.RETENTION_DAYS || 30} days.`);
}

module.exports = {
  purgeOldData,
  startPurgeScheduler
};
