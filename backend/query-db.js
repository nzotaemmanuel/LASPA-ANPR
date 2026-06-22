require('dotenv').config();
process.env.DATABASE_URL = process.env.DIRECT_URL;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to database.');

    const totalCount = await prisma.event.count();
    console.log('Total events in DB:', totalCount);

    const cameras = await prisma.event.groupBy({
      by: ['cameraId'],
      _count: {
        _all: true
      }
    });
    console.log('Events by Camera ID:', cameras);

    const nonSimulator = await prisma.event.findMany({
      where: {
        NOT: {
          cameraId: 'SIMULATOR'
        }
      },
      take: 10,
      orderBy: { timestamp: 'desc' }
    });

    console.log('Recent Non-Simulator Events:', nonSimulator);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
