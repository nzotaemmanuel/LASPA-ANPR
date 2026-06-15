const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Clean up existing tables
  await prisma.event.deleteMany({});
  await prisma.flagList.deleteMany({});

  // 2. Create Flag List
  const flags = [
    { platePattern: 'STOLEN-%', label: 'Stolen Vehicle' },
    { platePattern: 'SUSPECT-%', label: 'Suspicious Vehicle' },
    { platePattern: 'VIP-%', label: 'VIP Clear List' },
    { platePattern: 'STAFF-%', label: 'Staff Vehicle' },
    { platePattern: 'LA-888-%', label: 'Stolen Vehicle' },
    { platePattern: 'EK-777-%', label: 'Alert List' }
  ];

  for (const flag of flags) {
    await prisma.flagList.create({ data: flag });
  }
  console.log('Created flag lists.');

  // 3. Create historical events
  const cameraIds = ['CAM-01-NORTH', 'CAM-02-SOUTH', 'CAM-03-GATE', 'CAM-04-EXIT'];
  const mockPlates = [
    { plate: 'LA-123-AB', flag: false },
    { plate: 'STOLEN-99', flag: true, reason: 'Stolen Vehicle' },
    { plate: 'EK-432-XYZ', flag: false },
    { plate: 'STAFF-01', flag: true, reason: 'Staff Vehicle' },
    { plate: 'VIP-777', flag: true, reason: 'VIP Clear List' },
    { plate: 'AB-876-CD', flag: false },
    { plate: 'SUSPECT-05', flag: true, reason: 'Suspicious Vehicle' },
    { plate: 'LA-888-ZZ', flag: true, reason: 'Stolen Vehicle' }
  ];

  const now = new Date();
  for (let i = 0; i < 20; i++) {
    const randomItem = mockPlates[Math.floor(Math.random() * mockPlates.length)];
    const timeOffset = i * 2 * 60 * 60 * 1000; // Offset in hours
    const timestamp = new Date(now.getTime() - timeOffset);
    const confidence = parseFloat((80 + Math.random() * 20).toFixed(1));

    await prisma.event.create({
      data: {
        timestamp,
        cameraId: cameraIds[Math.floor(Math.random() * cameraIds.length)],
        plateNumber: randomItem.plate,
        confidence,
        imageUrl: `/uploads/mock_plate_${1 + (i % 5)}.jpg`,
        isFlagged: randomItem.flag,
        flagReason: randomItem.flag ? randomItem.reason : null
      }
    });
  }

  console.log('Seeded database with mock events.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
