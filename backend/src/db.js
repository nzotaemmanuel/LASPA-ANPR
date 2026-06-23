const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Auto-reconnect on idle connection reset (Supabase drops idle connections after ~5 min)
// Prisma will automatically reconnect on the next query — this just suppresses the
// unhandled error that would otherwise crash the process.
prisma.$on('error', (e) => {
  console.warn('[DATABASE] Connection error detected (will auto-reconnect):', e.message);
});

module.exports = prisma;
