const express = require('express');
const router = express.Router();
const prisma = require('../db');

// Helper to convert wildcard search patterns (e.g., LA-*, %123) to Prisma filters
function buildPlateFilter(query) {
  if (!query) return undefined;
  const sanitized = query.trim().toUpperCase().replace(/\*/g, '%');
  
  if (!sanitized.includes('%')) {
    return { contains: sanitized, mode: 'insensitive' };
  }
  
  // Starts and ends with % -> contains
  if (sanitized.startsWith('%') && sanitized.endsWith('%')) {
    const inner = sanitized.slice(1, -1);
    if (!inner) return undefined;
    return { contains: inner, mode: 'insensitive' };
  }
  
  // Starts with % -> endsWith
  if (sanitized.startsWith('%')) {
    const inner = sanitized.slice(1);
    return { endsWith: inner, mode: 'insensitive' };
  }
  
  // Ends with % -> startsWith
  if (sanitized.endsWith('%')) {
    const inner = sanitized.slice(0, -1);
    return { startsWith: inner, mode: 'insensitive' };
  }
  
  // Multi-wildcard or mid-wildcard fallback: remove wildcards and perform case-insensitive contains
  const clean = sanitized.replace(/%/g, '');
  return { contains: clean, mode: 'insensitive' };
}

// GET history events with query filters and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      plateQuery, 
      cameraId, 
      startDate, 
      endDate, 
      isFlagged 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build Prisma query filters
    const where = {};

    // Filter by Plate Number
    if (plateQuery) {
      const filter = buildPlateFilter(plateQuery);
      if (filter) {
        where.plateNumber = filter;
      }
    }

    // Filter by Camera ID
    if (cameraId) {
      where.cameraId = cameraId.trim();
    }

    // Filter by Date Range
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    // Filter by Flagged status
    if (isFlagged !== undefined) {
      where.isFlagged = isFlagged === 'true';
    }

    // Execute query
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.event.count({ where })
    ]);

    res.json({
      events,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching event logs:', error);
    res.status(500).json({ error: 'Failed to fetch event logs' });
  }
});

// GET specific capture event by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const event = await prisma.event.findUnique({
      where: { id }
    });
    if (!event) {
      return res.status(404).json({ error: 'Capture log not found' });
    }
    res.json(event);
  } catch (error) {
    console.error('Error fetching event detail:', error);
    res.status(500).json({ error: 'Failed to fetch event detail' });
  }
});

module.exports = router;
