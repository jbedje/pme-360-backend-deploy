import { PrismaClient, MessageType } from '@prisma/client';
import { NotificationsService } from './notifications';

const prisma = new PrismaClient();

export interface SendMessageData {
  recipientId: string;
  content: string;
  type?: MessageType;
}

export interface MessageFilters {
  type?: string;
  search?: string;
  conversationId?: string;
}

export interface MessagePagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class SimpleMessagingService {
  
  static async sendMessage(senderId: string, messageData: SendMessageData) {
    try {
      console.log(`📤 Sending message from ${senderId} to ${messageData.recipientId}`);

      // Vérifier que le destinataire existe
      const recipient = await prisma.user.findUnique({
        where: { id: messageData.recipientId },
      });

      if (!recipient) {
        throw new Error('Destinataire introuvable');
      }

      // Trouver ou créer une conversation entre les deux utilisateurs
      let conversation = await prisma.conversation.findFirst({
        where: {
          AND: [
            {
              participants: {
                some: { userId: senderId },
              },
            },
            {
              participants: {
                some: { userId: messageData.recipientId },
              },
            },
            { isGroup: false },
          ],
        },
      });

      // Si pas de conversation, en créer une
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            isGroup: false,
            participants: {
              create: [
                { userId: senderId },
                { userId: messageData.recipientId },
              ],
            },
          },
        });
      }

      // Créer le message
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId,
          recipientId: messageData.recipientId,
          content: messageData.content,
          type: messageData.type || MessageType.TEXT,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          conversation: {
            select: {
              id: true,
              title: true,
            },
          },
          attachments: true,
        },
      });

      console.log(`✅ Message sent: ${message.id}`);
      
      // Créer une notification pour le destinataire
      try {
        const sender = await prisma.user.findUnique({
          where: { id: senderId },
          select: { name: true }
        });
        
        if (sender) {
          const messagePreview = messageData.content.length > 50 
            ? messageData.content.substring(0, 50) + '...' 
            : messageData.content;
            
          await NotificationsService.createMessageNotification(
            messageData.recipientId,
            sender.name,
            messagePreview
          );
        }
      } catch (notificationError) {
        console.error('❌ Failed to create message notification:', notificationError);
        // Ne pas faire échouer l'envoi du message si la notification échoue
      }
      
      return message;

    } catch (error) {
      console.error('❌ Send message error:', error);
      throw error;
    }
  }

  static async getMessages(
    userId: string, 
    filters: MessageFilters, 
    pagination: MessagePagination,
    type: 'received' | 'sent' = 'received'
  ) {
    try {
      console.log(`📥 Getting ${type} messages for user ${userId}`);

      const where: any = {
        [type === 'received' ? 'recipientId' : 'senderId']: userId,
      };

      // Filtres
      if (filters.type) {
        where.type = filters.type as MessageType;
      }

      if (filters.conversationId) {
        where.conversationId = filters.conversationId;
      }

      if (filters.search) {
        where.content = { contains: filters.search };
      }

      const total = await prisma.message.count({ where });

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          conversation: {
            select: {
              id: true,
              title: true,
            },
          },
          attachments: true,
        },
        orderBy: {
          [pagination.sortBy || 'createdAt']: pagination.sortOrder || 'desc',
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        messages,
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
      console.error('❌ Get messages error:', error);
      throw error;
    }
  }

  static async getMessageById(messageId: string, userId: string) {
    try {
      console.log(`📨 Getting message ${messageId} for user ${userId}`);

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
            },
          },
          conversation: {
            select: {
              id: true,
              title: true,
            },
          },
          attachments: true,
        },
      });

      if (!message) {
        throw new Error('Message non trouvé');
      }

      // Marquer comme lu si l'utilisateur est le destinataire
      if (message.recipientId === userId && !message.readAt) {
        await prisma.message.update({
          where: { id: messageId },
          data: { readAt: new Date() },
        });
        message.readAt = new Date();
      }

      return message;

    } catch (error) {
      console.error('❌ Get message by ID error:', error);
      throw error;
    }
  }

  static async markAsRead(messageId: string, userId: string) {
    try {
      console.log(`✅ Marking message ${messageId} as read for user ${userId}`);

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          recipientId: userId,
        },
      });

      if (!message) {
        throw new Error('Message non trouvé');
      }

      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });

      return updatedMessage;

    } catch (error) {
      console.error('❌ Mark message as read error:', error);
      throw error;
    }
  }

  static async deleteMessage(messageId: string, userId: string) {
    try {
      console.log(`🗑️ Deleting message ${messageId} for user ${userId}`);

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        },
      });

      if (!message) {
        throw new Error('Message non trouvé');
      }

      await prisma.message.delete({
        where: { id: messageId },
      });

      console.log(`✅ Message deleted: ${messageId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Delete message error:', error);
      throw error;
    }
  }

  static async getConversations(userId: string, pagination: MessagePagination) {
    try {
      console.log(`💬 Getting conversations for user ${userId}`);

      const conversations = await prisma.conversation.findMany({
        where: {
          participants: {
            some: { userId: userId },
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  profileType: true,
                  avatar: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: { name: true },
              },
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      // Pour chaque conversation, calculer les messages non lus
      const conversationDetails = await Promise.all(
        conversations.map(async (conv) => {
          const unreadCount = await prisma.message.count({
            where: {
              conversationId: conv.id,
              recipientId: userId,
              readAt: null,
            },
          });

          // Trouver l'autre participant (pour les conversations 1-1)
          const otherParticipant = conv.participants.find(p => p.userId !== userId);

          return {
            ...conv,
            otherUser: otherParticipant?.user || null,
            lastMessage: conv.messages[0] || null,
            unreadCount,
            totalMessages: conv._count.messages,
          };
        })
      );

      return {
        conversations: conversationDetails,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          hasNext: conversations.length === pagination.limit,
          hasPrev: pagination.page > 1,
        },
      };

    } catch (error) {
      console.error('❌ Get conversations error:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId: string) {
    try {
      const count = await prisma.message.count({
        where: {
          recipientId: userId,
          readAt: null,
        },
      });

      return { unreadCount: count };

    } catch (error) {
      console.error('❌ Get unread count error:', error);
      throw error;
    }
  }
}