const express = require('express');
const router = express.Router();
const prisma = require('../db');

// GET all flagged plates
router.get('/', async (req, res) => {
  try {
    const flags = await prisma.flagList.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(flags);
  } catch (error) {
    console.error('Error fetching flag list:', error);
    res.status(500).json({ error: 'Failed to fetch flag list' });
  }
});

// POST add a flagged plate pattern
router.post('/', async (req, res) => {
  const { platePattern, label } = req.body;

  if (!platePattern || !label) {
    return res.status(400).json({ error: 'platePattern and label are required' });
  }

  const sanitizedPattern = platePattern.trim().toUpperCase();

  try {
    // Check if pattern already exists
    const existing = await prisma.flagList.findUnique({
      where: { platePattern: sanitizedPattern }
    });

    if (existing) {
      return res.status(400).json({ error: 'This license plate pattern is already flagged' });
    }

    const flag = await prisma.flagList.create({
      data: {
        platePattern: sanitizedPattern,
        label: label.trim()
      }
    });

    res.status(201).json(flag);
  } catch (error) {
    console.error('Error adding flag:', error);
    res.status(500).json({ error: 'Failed to add flag' });
  }
});

// DELETE a flagged plate pattern
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.flagList.delete({
      where: { id }
    });
    res.json({ message: 'Flag pattern deleted successfully' });
  } catch (error) {
    console.error('Error deleting flag:', error);
    res.status(500).json({ error: 'Failed to delete flag pattern' });
  }
});

module.exports = router;
