require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL database.');

    // Query list of all user-defined schemas
    const schemas = await prisma.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema') 
      AND schema_name NOT LIKE 'pg_temp%' 
      AND schema_name NOT LIKE 'pg_toast%'
    `);
    console.log('Available schemas in database:', schemas.map(s => s.schema_name));

    for (const s of schemas) {
      const schemaName = s.schema_name;
      try {
        // Check if Event table exists in this schema
        const tables = await prisma.$queryRawUnsafe(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = 'Event'
        `, schemaName);

        if (tables.length > 0) {
          // Count rows in the Event table of this schema
          const countResult = await prisma.$queryRawUnsafe(`
            SELECT COUNT(*) as cnt FROM "${schemaName}"."Event"
          `);
          console.log(`Schema "${schemaName}": found Event table with ${countResult[0].cnt} records.`);
        } else {
          console.log(`Schema "${schemaName}": Event table does not exist.`);
        }
      } catch (err) {
        console.log(`Schema "${schemaName}": Error querying table information:`, err.message);
      }
    }

  } catch (error) {
    console.error('Error running test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
