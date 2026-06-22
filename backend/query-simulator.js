require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to database.');

    const recentSimulator = await prisma.event.findMany({
      where: {
        cameraId: 'SIMULATOR'
      },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log('Recent Simulator Events in DB:');
    recentSimulator.forEach((e, i) => {
      console.log(`\n--- Simulator Event #${i+1} ---`);
      console.log(`ID: ${e.id}`);
      console.log(`Created At: ${e.createdAt.toISOString()}`);
      console.log(`Timestamp: ${e.timestamp.toISOString()}`);
      console.log(`Plate Number: ${e.plateNumber}`);
      console.log(`Image URL: ${e.imageUrl}`);
      console.log(`Raw Payload (first 200 chars): ${e.rawPayload ? e.rawPayload.substring(0, 200) : 'null'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
