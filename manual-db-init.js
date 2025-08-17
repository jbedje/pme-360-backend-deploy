/**
 * Manual Database Initialization Script
 * Run this script locally to initialize the Railway database
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Use the Railway database URL directly
const DATABASE_URL = 'YOUR_RAILWAY_DATABASE_URL_HERE'; // Replace with actual URL from Railway

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

async function initializeDatabase() {
  console.log('🚀 Starting manual database initialization...');

  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Check if already initialized
    try {
      const userCount = await prisma.user.count();
      if (userCount > 0) {
        console.log(`ℹ️ Database already has ${userCount} users`);
        return;
      }
    } catch (error) {
      console.log('⚠️ Tables may not exist yet, proceeding...');
    }

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@pme360.com' },
      update: {},
      create: {
        email: 'admin@pme360.com',
        name: 'Admin PME360',
        password: hashedAdminPassword,
        profileType: 'ADMIN',
        status: 'ACTIVE',
        company: 'PME 360',
        verified: true,
        completionScore: 100,
      },
    });

    // Create test user
    const hashedTestPassword = await bcrypt.hash('password123', 10);
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        password: hashedTestPassword,
        profileType: 'STARTUP',
        status: 'ACTIVE',
        company: 'Test Company',
        verified: true,
        completionScore: 75,
      },
    });

    // Create sample opportunity
    const opportunity = await prisma.opportunity.create({
      data: {
        title: 'Développeur Full-Stack React/Node.js',
        description: 'Recherche développeur expérimenté pour projet fintech.',
        type: 'TALENT',
        status: 'ACTIVE',
        budget: '50k-70k€',
        location: 'Paris',
        remote: true,
        authorId: adminUser.id,
        skills: {
          create: [
            { skill: 'React' },
            { skill: 'Node.js' },
            { skill: 'TypeScript' }
          ]
        }
      },
    });

    // Create sample event
    const event = await prisma.event.create({
      data: {
        title: 'Conférence FinTech Paris 2024',
        description: 'La plus grande conférence européenne dédiée aux innovations financières.',
        type: 'CONFERENCE',
        status: 'UPCOMING',
        startDate: new Date('2024-09-25T09:00:00Z'),
        endDate: new Date('2024-09-25T18:00:00Z'),
        location: 'Palais des Congrès, Paris',
        isOnline: false,
        maxAttendees: 500,
        price: '150€',
        organizer: 'FinTech Europe',
      },
    });

    // Create sample resource
    const resource = await prisma.resource.create({
      data: {
        title: 'Guide complet de création d\'entreprise',
        description: 'Guide détaillé pour créer son entreprise en France.',
        type: 'GUIDE',
        author: 'Marie Dubois',
        viewCount: 1247,
        url: 'https://example.com/guide-creation-entreprise.pdf',
        tags: {
          create: [
            { tag: 'Création' },
            { tag: 'Administratif' },
            { tag: 'Business Plan' }
          ]
        }
      },
    });

    console.log('✅ Database initialized successfully!');
    console.log('📊 Created:');
    console.log('  - 2 users (admin@pme360.com, test@example.com)');
    console.log('  - 1 opportunity');
    console.log('  - 1 event');
    console.log('  - 1 resource');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { initializeDatabase };