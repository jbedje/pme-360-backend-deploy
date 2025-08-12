import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Extension du PrismaClient avec logging
const prisma = new PrismaClient({
  log: [
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
  errorFormat: 'colorless',
});

// Event listeners pour les logs
prisma.$on('info', (e) => {
  logger.info(`Prisma Info: ${e.message}`);
});

prisma.$on('warn', (e) => {
  logger.warn(`Prisma Warning: ${e.message}`);
});

prisma.$on('error', (e) => {
  logger.error(`Prisma Error: ${e.message}`);
});

// Fonction pour connecter à la base de données
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
    
    // Test de la connexion
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connection test passed');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// Fonction pour déconnecter de la base de données
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected successfully');
  } catch (error) {
    logger.error('❌ Database disconnection failed:', error);
  }
};

// Fonction pour nettoyer les connexions (utile pour les tests)
export const cleanupDatabase = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    // Nettoyer les données de test
    await prisma.userActivity.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.eventRegistration.deleteMany();
    await prisma.event.deleteMany();
    await prisma.resource.deleteMany();
    await prisma.application.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversationParticipant.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.connection.deleteMany();
    await prisma.userExpertise.deleteMany();
    await prisma.user.deleteMany();
    
    logger.info('✅ Test database cleaned');
  }
};

export { prisma };
export default prisma;