
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file:./dev.db'
        }
      }
    });
    async function run() {
      try {
        const count = await prisma.event.count();
        console.log('SQLITE_COUNT:' + count);
        const events = await prisma.event.findMany({ take: 5 });
        console.log('SQLITE_EVENTS:' + JSON.stringify(events));
      } catch (err) {
        console.error('SQLITE_ERROR:' + err.message);
      } finally {
        await prisma.$disconnect();
      }
    }
    run();
  