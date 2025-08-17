const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create initial users
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const testPassword = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@pme360.com' },
    update: {},
    create: {
      email: 'admin@pme360.com',
      name: 'Admin PME360',
      password: hashedPassword,
      profileType: 'ADMIN',
      status: 'ACTIVE',
      company: 'PME 360',
      verified: true,
      completionScore: 100,
    },
  });

  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      password: testPassword,
      profileType: 'STARTUP',
      status: 'ACTIVE',
      company: 'Test Company',
      verified: true,
      completionScore: 75,
    },
  });

  // Create some sample opportunities
  const opportunity1 = await prisma.opportunity.create({
    data: {
      title: 'Développeur Full-Stack React/Node.js',
      description: 'Recherche développeur expérimenté pour projet fintech innovant.',
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
          { skill: 'TypeScript' },
          { skill: 'PostgreSQL' }
        ]
      }
    },
  });

  const opportunity2 = await prisma.opportunity.create({
    data: {
      title: 'Financement Série A - HealthTech',
      description: 'Startup HealthTech recherche investisseurs pour levée de fonds Série A.',
      type: 'FUNDING',
      status: 'ACTIVE',
      amount: '2M€',
      location: 'Lyon',
      remote: false,
      authorId: testUser.id,
      skills: {
        create: [
          { skill: 'Santé' },
          { skill: 'IA' },
          { skill: 'Investissement' }
        ]
      }
    },
  });

  // Create some sample events
  const event1 = await prisma.event.create({
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
      organizerContact: 'contact@fintecheurope.com',
    },
  });

  const event2 = await prisma.event.create({
    data: {
      title: 'Webinaire Marketing Digital',
      description: 'Formation intensive sur les dernières stratégies de marketing digital.',
      type: 'WEBINAR',
      status: 'UPCOMING',
      startDate: new Date('2024-09-20T14:00:00Z'),
      endDate: new Date('2024-09-20T16:00:00Z'),
      location: 'En ligne',
      isOnline: true,
      maxAttendees: 100,
      price: 'Gratuit',
      organizer: 'GrowthLab',
      organizerContact: 'contact@growthlab.com',
      meetingUrl: 'https://zoom.us/j/123456789',
    },
  });

  // Create some sample resources
  const resource1 = await prisma.resource.create({
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

  const resource2 = await prisma.resource.create({
    data: {
      title: 'Modèle de Business Plan',
      description: 'Template complet de business plan avec exemples.',
      type: 'TEMPLATE',
      author: 'Pierre Martin',
      viewCount: 892,
      url: 'https://example.com/business-plan-template.docx',
      tags: {
        create: [
          { tag: 'Business Plan' },
          { tag: 'Template' },
          { tag: 'Investissement' }
        ]
      }
    },
  });

  // Register admin to events
  await prisma.eventRegistration.create({
    data: {
      eventId: event1.id,
      userId: adminUser.id,
    },
  });

  await prisma.eventRegistration.create({
    data: {
      eventId: event2.id,
      userId: testUser.id,
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log(`📧 Admin user: admin@pme360.com (password: admin123)`);
  console.log(`📧 Test user: test@example.com (password: password123)`);
  console.log(`🎯 Created ${2} opportunities`);
  console.log(`📅 Created ${2} events`);
  console.log(`📚 Created ${2} resources`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });