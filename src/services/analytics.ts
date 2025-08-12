import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface PlatformStats {
  users: {
    total: number;
    active: number;
    byProfileType: Record<string, number>;
    newThisMonth: number;
  };
  opportunities: {
    total: number;
    active: number;
    byType: Record<string, number>;
    applicationsCount: number;
  };
  events: {
    total: number;
    upcoming: number;
    byType: Record<string, number>;
    registrationsCount: number;
  };
  resources: {
    total: number;
    byType: Record<string, number>;
    totalViews: number;
  };
  messages: {
    total: number;
    thisMonth: number;
  };
  connections: {
    total: number;
    thisMonth: number;
  };
}

export interface UserActivityMetrics {
  userId: string;
  period: 'week' | 'month' | 'year';
  stats: {
    opportunitiesCreated: number;
    opportunitiesApplied: number;
    eventsCreated: number;
    eventsAttended: number;
    resourcesCreated: number;
    resourcesViewed: number;
    messagesSent: number;
    messagesReceived: number;
    connectionsEstablished: number;
    profileViews: number;
  };
}

export class AnalyticsService {

  // ==================== STATISTIQUES GLOBALES ====================
  
  static async getPlatformStats(): Promise<PlatformStats> {
    try {
      logger.info('📊 Generating platform statistics...');

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      // Statistiques utilisateurs
      const [
        totalUsers,
        activeUsers,
        newUsersThisMonth,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            lastLogin: { gte: thirtyDaysAgo },
          },
        }),
        prisma.user.count({
          where: {
            createdAt: { gte: thisMonth },
          },
        }),
      ]);

      // Distribution des types d'utilisateurs
      const usersByType = await prisma.user.groupBy({
        by: ['profileType'],
        _count: { _all: true },
      });

      // Statistiques opportunités
      const [
        totalOpportunities,
        activeOpportunities,
        totalApplications,
      ] = await Promise.all([
        prisma.opportunity.count(),
        prisma.opportunity.count({
          where: { status: 'ACTIVE' },
        }),
        prisma.application.count(),
      ]);

      // Distribution des types d'opportunités
      const opportunitiesByType = await prisma.opportunity.groupBy({
        by: ['type'],
        _count: { _all: true },
      });

      // Statistiques événements
      const [
        totalEvents,
        upcomingEvents,
        totalRegistrations,
      ] = await Promise.all([
        prisma.event.count(),
        prisma.event.count({
          where: {
            status: 'UPCOMING',
            startDate: { gte: now },
          },
        }),
        prisma.eventRegistration.count(),
      ]);

      // Distribution des types d'événements
      const eventsByType = await prisma.event.groupBy({
        by: ['type'],
        _count: { _all: true },
      });

      // Statistiques ressources
      const [
        totalResources,
        totalViews,
      ] = await Promise.all([
        prisma.resource.count(),
        prisma.resource.aggregate({
          _sum: { viewCount: true },
        }),
      ]);

      // Distribution des types de ressources
      const resourcesByType = await prisma.resource.groupBy({
        by: ['type'],
        _count: { _all: true },
      });

      // Statistiques messages et connexions
      const [
        totalMessages,
        messagesThisMonth,
        totalConnections,
        connectionsThisMonth,
      ] = await Promise.all([
        prisma.message.count(),
        prisma.message.count({
          where: {
            createdAt: { gte: thisMonth },
          },
        }),
        prisma.connection.count(),
        prisma.connection.count({
          where: {
            createdAt: { gte: thisMonth },
          },
        }),
      ]);

      // Formatter les résultats
      const stats: PlatformStats = {
        users: {
          total: totalUsers,
          active: activeUsers,
          byProfileType: usersByType.reduce((acc, item) => {
            acc[item.profileType] = item._count._all;
            return acc;
          }, {} as Record<string, number>),
          newThisMonth: newUsersThisMonth,
        },
        opportunities: {
          total: totalOpportunities,
          active: activeOpportunities,
          byType: opportunitiesByType.reduce((acc, item) => {
            acc[item.type] = item._count._all;
            return acc;
          }, {} as Record<string, number>),
          applicationsCount: totalApplications,
        },
        events: {
          total: totalEvents,
          upcoming: upcomingEvents,
          byType: eventsByType.reduce((acc, item) => {
            acc[item.type] = item._count._all;
            return acc;
          }, {} as Record<string, number>),
          registrationsCount: totalRegistrations,
        },
        resources: {
          total: totalResources,
          byType: resourcesByType.reduce((acc, item) => {
            acc[item.type] = item._count._all;
            return acc;
          }, {} as Record<string, number>),
          totalViews: totalViews._sum.viewCount || 0,
        },
        messages: {
          total: totalMessages,
          thisMonth: messagesThisMonth,
        },
        connections: {
          total: totalConnections,
          thisMonth: connectionsThisMonth,
        },
      };

      logger.info('✅ Platform statistics generated successfully');
      return stats;

    } catch (error) {
      logger.error('❌ Platform statistics generation failed:', error);
      throw error;
    }
  }

  // ==================== MÉTRIQUES UTILISATEUR ====================
  
  static async getUserActivityMetrics(
    userId: string, 
    period: 'week' | 'month' | 'year' = 'month'
  ): Promise<UserActivityMetrics> {
    try {
      logger.info(`📊 Generating activity metrics for user ${userId} (${period})`);

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
      }

      // Vérifier que l'utilisateur existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      const [
        opportunitiesCreated,
        opportunitiesApplied,
        eventsCreated,
        eventsAttended,
        resourcesCreated,
        messagesSent,
        messagesReceived,
        connectionsEstablished,
      ] = await Promise.all([
        // Opportunités créées
        prisma.opportunity.count({
          where: {
            authorId: userId,
            createdAt: { gte: startDate },
          },
        }),

        // Candidatures soumises
        prisma.application.count({
          where: {
            applicantId: userId,
            createdAt: { gte: startDate },
          },
        }),

        // Événements créés (approximation basée sur le nom de l'organisateur)
        prisma.event.count({
          where: {
            organizer: user.name,
            createdAt: { gte: startDate },
          },
        }),

        // Événements auxquels l'utilisateur s'est inscrit
        prisma.eventRegistration.count({
          where: {
            userId,
            createdAt: { gte: startDate },
          },
        }),

        // Ressources créées (approximation basée sur le nom de l'auteur)
        prisma.resource.count({
          where: {
            author: user.name,
            createdAt: { gte: startDate },
          },
        }),

        // Messages envoyés
        prisma.message.count({
          where: {
            senderId: userId,
            createdAt: { gte: startDate },
          },
        }),

        // Messages reçus
        prisma.message.count({
          where: {
            recipientId: userId,
            createdAt: { gte: startDate },
          },
        }),

        // Connexions établies (requester ou target)
        prisma.connection.count({
          where: {
            OR: [
              { requesterId: userId },
              { targetId: userId },
            ],
            status: 'ACCEPTED',
            createdAt: { gte: startDate },
          },
        }),
      ]);

      const stats: UserActivityMetrics = {
        userId,
        period,
        stats: {
          opportunitiesCreated,
          opportunitiesApplied,
          eventsCreated,
          eventsAttended,
          resourcesCreated,
          resourcesViewed: 0, // TODO: Implémenter le tracking des vues
          messagesSent,
          messagesReceived,
          connectionsEstablished,
          profileViews: 0, // TODO: Implémenter le tracking des vues de profil
        },
      };

      logger.info(`✅ User activity metrics generated for ${userId}`);
      return stats;

    } catch (error) {
      logger.error(`❌ User activity metrics generation failed for ${userId}:`, error);
      throw error;
    }
  }

  // ==================== STATISTIQUES AVANCÉES ====================
  
  static async getEngagementMetrics() {
    try {
      logger.info('📊 Generating engagement metrics...');

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      // Taux d'engagement des utilisateurs
      const totalUsers = await prisma.user.count();
      const activeUsers = await prisma.user.count({
        where: {
          lastLogin: { gte: thirtyDaysAgo },
        },
      });

      // Taux de conversion des opportunités
      const totalOpportunities = await prisma.opportunity.count({
        where: { status: 'ACTIVE' },
      });
      const totalApplications = await prisma.application.count();

      // Taux de participation aux événements
      const totalEvents = await prisma.event.count({
        where: { status: 'UPCOMING' },
      });
      const totalEventRegistrations = await prisma.eventRegistration.count();

      // Popularité des ressources
      const popularResources = await prisma.resource.findMany({
        orderBy: { viewCount: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          type: true,
          viewCount: true,
          author: true,
        },
      });

      // Statistiques de messagerie
      const messagesLastMonth = await prisma.message.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      const readMessages = await prisma.message.count({
        where: {
          readAt: { not: null },
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      const engagementRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
      const applicationRate = totalOpportunities > 0 ? (totalApplications / totalOpportunities) : 0;
      const eventParticipationRate = totalEvents > 0 ? (totalEventRegistrations / totalEvents) : 0;
      const messageReadRate = messagesLastMonth > 0 ? (readMessages / messagesLastMonth) * 100 : 0;

      return {
        userEngagement: {
          totalUsers,
          activeUsers,
          engagementRate: Math.round(engagementRate * 100) / 100,
        },
        opportunityConversion: {
          totalOpportunities,
          totalApplications,
          applicationRate: Math.round(applicationRate * 100) / 100,
        },
        eventParticipation: {
          totalEvents,
          totalEventRegistrations,
          participationRate: Math.round(eventParticipationRate * 100) / 100,
        },
        resourcePopularity: {
          popularResources,
        },
        messagingActivity: {
          messagesLastMonth,
          readMessages,
          readRate: Math.round(messageReadRate * 100) / 100,
        },
      };

    } catch (error) {
      logger.error('❌ Engagement metrics generation failed:', error);
      throw error;
    }
  }

  // ==================== TENDANCES TEMPORELLES ====================
  
  static async getTimeTrends(days: number = 30) {
    try {
      logger.info(`📊 Generating time trends for ${days} days...`);

      const now = new Date();
      const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

      // Générer les données jour par jour
      const trends = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
        const nextDate = new Date(date.getTime() + (24 * 60 * 60 * 1000));

        const [
          newUsers,
          newOpportunities,
          newEvents,
          newMessages,
          newConnections,
        ] = await Promise.all([
          prisma.user.count({
            where: {
              createdAt: {
                gte: date,
                lt: nextDate,
              },
            },
          }),
          prisma.opportunity.count({
            where: {
              createdAt: {
                gte: date,
                lt: nextDate,
              },
            },
          }),
          prisma.event.count({
            where: {
              createdAt: {
                gte: date,
                lt: nextDate,
              },
            },
          }),
          prisma.message.count({
            where: {
              createdAt: {
                gte: date,
                lt: nextDate,
              },
            },
          }),
          prisma.connection.count({
            where: {
              createdAt: {
                gte: date,
                lt: nextDate,
              },
            },
          }),
        ]);

        trends.push({
          date: date.toISOString().split('T')[0],
          newUsers,
          newOpportunities,
          newEvents,
          newMessages,
          newConnections,
        });
      }

      logger.info(`✅ Time trends generated for ${days} days`);
      return { trends, period: `${days} days` };

    } catch (error) {
      logger.error('❌ Time trends generation failed:', error);
      throw error;
    }
  }

  // ==================== STATISTIQUES D'UTILISATION ====================
  
  static async getUsageStatistics() {
    try {
      logger.info('📊 Generating usage statistics...');

      // Utilisateurs les plus actifs
      const mostActiveUsers = await prisma.user.findMany({
        orderBy: { lastLogin: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          profileType: true,
          lastLogin: true,
          completionScore: true,
        },
      });

      // Opportunités avec le plus de candidatures
      const allOpportunities = await prisma.opportunity.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
        },
      });

      const opportunitiesWithCounts = await Promise.all(
        allOpportunities.map(async (opportunity) => {
          const applicationCount = await prisma.application.count({
            where: { opportunityId: opportunity.id },
          });
          return {
            ...opportunity,
            applicationCount,
          };
        })
      );

      const popularOpportunities = opportunitiesWithCounts
        .sort((a, b) => b.applicationCount - a.applicationCount)
        .slice(0, 10);

      // Événements avec le plus d'inscriptions
      const allEvents = await prisma.event.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          startDate: true,
          maxAttendees: true,
        },
      });

      const eventsWithCounts = await Promise.all(
        allEvents.map(async (event) => {
          const registrationCount = await prisma.eventRegistration.count({
            where: { eventId: event.id },
          });
          return {
            ...event,
            registrationCount,
          };
        })
      );

      const popularEvents = eventsWithCounts
        .sort((a, b) => b.registrationCount - a.registrationCount)
        .slice(0, 10);

      // Distribution géographique
      const allUsers = await prisma.user.findMany({
        where: {
          location: { not: null },
        },
        select: { location: true },
      });

      const locationDistribution = allUsers.reduce((acc, user) => {
        if (user.location) {
          acc[user.location] = (acc[user.location] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const topLocations = Object.entries(locationDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([location, userCount]) => ({ location, userCount }));

      return {
        mostActiveUsers,
        popularOpportunities,
        popularEvents,
        locationDistribution: topLocations,
      };

    } catch (error) {
      logger.error('❌ Usage statistics generation failed:', error);
      throw error;
    }
  }
}