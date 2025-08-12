import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any; // Will be stringified to JSON
  actionUrl?: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  read?: boolean;
  search?: string;
}

export interface NotificationPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class NotificationsService {
  
  static async createNotification(notificationData: CreateNotificationData) {
    try {
      console.log(`🔔 Creating notification for user ${notificationData.userId}: ${notificationData.title}`);

      const notification = await prisma.notification.create({
        data: {
          userId: notificationData.userId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data ? JSON.stringify(notificationData.data) : null,
          actionUrl: notificationData.actionUrl,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      console.log(`✅ Notification created: ${notification.id}`);
      
      // Envoyer la notification en temps réel via WebSocket
      this.emitRealTimeNotification(notification);
      
      return notification;

    } catch (error) {
      console.error('❌ Create notification error:', error);
      throw error;
    }
  }

  static async getUserNotifications(
    userId: string, 
    filters: NotificationFilters = {}, 
    pagination: NotificationPagination
  ) {
    try {
      console.log(`📋 Getting notifications for user ${userId}`);

      const where: any = {
        userId,
      };

      // Filtres
      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.read !== undefined) {
        where.read = filters.read;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search } },
          { message: { contains: filters.search } },
        ];
      }

      const total = await prisma.notification.count({ where });

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: {
          [pagination.sortBy || 'createdAt']: pagination.sortOrder || 'desc',
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      // Parse JSON data back to objects
      const parsedNotifications = notifications.map(notification => ({
        ...notification,
        data: notification.data ? JSON.parse(notification.data) : null,
      }));

      return {
        notifications: parsedNotifications,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasNext: pagination.page * pagination.limit < total,
          hasPrev: pagination.page > 1,
        },
      };

    } catch (error) {
      console.error('❌ Get user notifications error:', error);
      throw error;
    }
  }

  static async markAsRead(notificationId: string, userId: string) {
    try {
      console.log(`✅ Marking notification ${notificationId} as read`);

      // Vérifier que la notification appartient à l'utilisateur
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      const updatedNotification = await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      return {
        ...updatedNotification,
        data: updatedNotification.data ? JSON.parse(updatedNotification.data) : null,
      };

    } catch (error) {
      console.error('❌ Mark notification as read error:', error);
      throw error;
    }
  }

  static async markAllAsRead(userId: string) {
    try {
      console.log(`✅ Marking all notifications as read for user ${userId}`);

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          read: false,
        },
        data: {
          read: true,
        },
      });

      console.log(`✅ Marked ${result.count} notifications as read`);
      return { count: result.count };

    } catch (error) {
      console.error('❌ Mark all notifications as read error:', error);
      throw error;
    }
  }

  static async deleteNotification(notificationId: string, userId: string) {
    try {
      console.log(`🗑️ Deleting notification ${notificationId}`);

      // Vérifier que la notification appartient à l'utilisateur
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      console.log(`✅ Notification deleted: ${notificationId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Delete notification error:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId: string) {
    try {
      const count = await prisma.notification.count({
        where: {
          userId,
          read: false,
        },
      });

      return { unreadCount: count };

    } catch (error) {
      console.error('❌ Get unread count error:', error);
      throw error;
    }
  }

  static async deleteOldNotifications(olderThanDays: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          read: true, // Only delete read notifications
        },
      });

      console.log(`✅ Deleted ${result.count} old notifications`);
      return { deletedCount: result.count };

    } catch (error) {
      console.error('❌ Delete old notifications error:', error);
      throw error;
    }
  }

  // Helper methods pour créer des notifications spécifiques
  static async createMessageNotification(recipientId: string, senderName: string, messagePreview: string) {
    return this.createNotification({
      userId: recipientId,
      type: NotificationType.MESSAGE,
      title: `Nouveau message de ${senderName}`,
      message: messagePreview,
      actionUrl: '/messages',
    });
  }

  static async createConnectionRequestNotification(targetId: string, requesterName: string) {
    return this.createNotification({
      userId: targetId,
      type: NotificationType.CONNECTION_REQUEST,
      title: 'Nouvelle demande de connexion',
      message: `${requesterName} souhaite se connecter avec vous`,
      actionUrl: '/connections/requests',
    });
  }

  static async createOpportunityMatchNotification(userId: string, opportunityTitle: string, opportunityId: string) {
    return this.createNotification({
      userId,
      type: NotificationType.OPPORTUNITY_MATCH,
      title: 'Nouvelle opportunité correspondante',
      message: `L'opportunité "${opportunityTitle}" correspond à votre profil`,
      actionUrl: `/opportunities/${opportunityId}`,
      data: { opportunityId },
    });
  }

  static async createApplicationUpdateNotification(
    applicantId: string, 
    opportunityTitle: string, 
    status: string,
    opportunityId: string
  ) {
    const statusMessage = {
      ACCEPTED: 'acceptée',
      REJECTED: 'refusée',
      PENDING: 'en cours d\'examen',
    }[status] || 'mise à jour';

    return this.createNotification({
      userId: applicantId,
      type: NotificationType.APPLICATION_UPDATE,
      title: 'Mise à jour de candidature',
      message: `Votre candidature pour "${opportunityTitle}" a été ${statusMessage}`,
      actionUrl: `/opportunities/${opportunityId}`,
      data: { opportunityId, status },
    });
  }

  static async createEventReminderNotification(userId: string, eventTitle: string, eventDate: Date, eventId: string) {
    return this.createNotification({
      userId,
      type: NotificationType.EVENT_REMINDER,
      title: 'Rappel d\'événement',
      message: `L'événement "${eventTitle}" commence bientôt le ${eventDate.toLocaleDateString('fr-FR')}`,
      actionUrl: `/events/${eventId}`,
      data: { eventId, eventDate: eventDate.toISOString() },
    });
  }

  static async createSystemNotification(userId: string, title: string, message: string, actionUrl?: string) {
    return this.createNotification({
      userId,
      type: NotificationType.SYSTEM,
      title,
      message,
      actionUrl,
    });
  }

  // Méthode pour émettre les notifications en temps réel
  private static emitRealTimeNotification(notification: any) {
    try {
      const wsService = (global as any).wsService;
      if (wsService) {
        const notificationData = {
          ...notification,
          data: notification.data ? JSON.parse(notification.data) : null,
        };
        
        const sent = wsService.sendNotificationToUser(notification.userId, notificationData);
        if (sent) {
          console.log(`🔔 Real-time notification sent to user ${notification.userId}`);
        } else {
          console.log(`📭 User ${notification.userId} not connected for real-time notification`);
        }
      } else {
        console.log('⚠️ WebSocket service not available for real-time notifications');
      }
    } catch (error) {
      console.error('❌ Failed to emit real-time notification:', error);
    }
  }
}