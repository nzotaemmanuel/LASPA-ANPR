const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, 'prisma/schema.prisma');
const envPath = path.join(__dirname, '.env');

const mode = process.argv[2]; // 'sqlite' or 'postgres'

if (!mode || (mode !== 'sqlite' && mode !== 'postgres')) {
  console.error('Usage: node switch-db.js [sqlite|postgres]');
  process.exit(1);
}

try {
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');
  let envContent = fs.readFileSync(envPath, 'utf8');

  if (mode === 'sqlite') {
    console.log('Switching database to SQLite...');

    // Replace provider to sqlite
    schemaContent = schemaContent.replace(/provider = "postgresql"/, 'provider = "sqlite"');
    
    // Replace DATABASE_URL in .env
    const sqliteUrl = 'DATABASE_URL="file:./dev.db"';
    if (envContent.includes('DATABASE_URL=')) {
      envContent = envContent.replace(/DATABASE_URL=.*/, sqliteUrl);
    } else {
      envContent += `\n${sqliteUrl}`;
    }

    fs.writeFileSync(schemaPath, schemaContent);
    fs.writeFileSync(envPath, envContent);

    console.log('Updated schema.prisma and .env for SQLite.');
    console.log('Running database setup (prisma db push)...');
    execSync('npx prisma db push', { stdio: 'inherit', cwd: __dirname });
    console.log('Prisma client generated and DB push complete.');
    console.log('Running database seed...');
    execSync('node prisma/seed.js', { stdio: 'inherit', cwd: __dirname });
    console.log('SQLite setup completed successfully!');
  } else {
    console.log('Switching database to PostgreSQL...');

    // Replace provider to postgresql
    schemaContent = schemaContent.replace(/provider = "sqlite"/, 'provider = "postgresql"');
    
    // Replace DATABASE_URL in .env with postgres url
    const postgresUrl = 'DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/laspa_anpr?schema=public"';
    if (envContent.includes('DATABASE_URL=')) {
      envContent = envContent.replace(/DATABASE_URL=.*/, postgresUrl);
    } else {
      envContent += `\n${postgresUrl}`;
    }

    fs.writeFileSync(schemaPath, schemaContent);
    fs.writeFileSync(envPath, envContent);

    console.log('Updated schema.prisma and .env for PostgreSQL.');
    console.log('Database switcher configuration complete. Note: Please ensure PostgreSQL is running before executing migrations.');
  }
} catch (error) {
  console.error('Failed to switch database provider:', error.message);
  process.exit(1);
}
