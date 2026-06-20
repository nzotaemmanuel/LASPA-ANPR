const express = require('express');
const router = express.Router();
const prisma = require('../db');

// GET dashboard aggregates and chart data
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Fetch LASPA KPI metrics
    const [
      totalScanned,
      totalFined,
      totalDisputed,
      totalClamped,
      totalTowed,
      totalImpounded,
      totalBookings,
      bookingHoursSum,
      revenueSum,
      uniqueCameras
    ] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { isFined: true } }),
      prisma.event.count({ where: { isDisputed: true } }),
      prisma.event.count({ where: { isClamped: true } }),
      prisma.event.count({ where: { isTowed: true } }),
      prisma.event.count({ where: { isImpounded: true } }),
      prisma.event.count({ where: { isBooked: true } }),
      prisma.event.aggregate({
        _sum: {
          bookingHours: true
        }
      }),
      prisma.event.aggregate({
        _sum: {
          revenue: true
        }
      }),
      prisma.event.groupBy({
        by: ['cameraId'],
        where: {
          timestamp: {
            gte: past24Hours
          }
        }
      })
    ]);

    const totalBookingHours = bookingHoursSum._sum.bookingHours 
      ? parseFloat(bookingHoursSum._sum.bookingHours.toFixed(1)) 
      : 0;

    const totalRevenue = revenueSum._sum.revenue 
      ? parseFloat(revenueSum._sum.revenue.toFixed(2)) 
      : 0;

    // 2. Camera activity breakdown (all-time counts)
    const cameraCounts = await prisma.event.groupBy({
      by: ['cameraId'],
      _count: {
        id: true
      }
    });

    // 3. Flags breakdown
    const flagCounts = await prisma.event.groupBy({
      by: ['flagReason'],
      where: {
        isFlagged: true
      },
      _count: {
        id: true
      }
    });

    // 4. Hourly traffic pattern (past 24 hours)
    // Fetch last 24 hours events to group them in JS (more DB portable than raw SQL group-by-date)
    const eventsLast24h = await prisma.event.findMany({
      where: {
        timestamp: {
          gte: past24Hours
        }
      },
      select: {
        timestamp: true
      }
    });

    // Initialize 24 hourly bins
    const hourlyBins = {};
    for (let i = 23; i >= 0; i--) {
      const targetTime = new Date(now.getTime() - i * 60 * 60 * 1000);
      const label = targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      hourlyBins[label] = 0;
    }

    eventsLast24h.forEach(event => {
      // Find the closest hourly label
      const eventTime = new Date(event.timestamp);
      // Format to find matching bin
      const label = eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Let's group by hour of the day (0-23)
      const hour = eventTime.getHours();
      // Format as "HH:00"
      const key = `${hour.toString().padStart(2, '0')}:00`;
      
      // Actually, let's build the hourly bins using Hour of Day for simplicity and alignment
    });

    // Better: let's populate 24 slots representing the last 24 hours
    const hourlyData = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = hourDate.getHours();
      const label = `${hourStr.toString().padStart(2, '0')}:00`;
      
      // Filter events in this hour
      const count = eventsLast24h.filter(event => {
        const d = new Date(event.timestamp);
        return d.getDate() === hourDate.getDate() && d.getHours() === hourStr;
      }).length;

      hourlyData.push({ label, count });
    }

    res.json({
      summary: {
        totalScanned,
        totalFined,
        totalDisputed,
        totalClamped,
        totalTowed,
        totalImpounded,
        totalBookings,
        totalBookingHours,
        totalRevenue,
      },
      charts: {
        hourlyTraffic: hourlyData,
        cameraActivity: cameraCounts.map(item => ({
          cameraId: item.cameraId,
          count: item._count.id
        })),
        flagBreakdown: flagCounts
          .filter(item => item.flagReason !== null)
          .map(item => ({
            reason: item.flagReason,
            count: item._count.id
          }))
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

module.exports = router;
