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

  console.log('Seeded database (watchlists only).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
