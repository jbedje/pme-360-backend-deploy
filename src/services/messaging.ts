import { PrismaClient, MessageStatus, MessageType } from '@prisma/client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface SendMessageData {
  recipientId: string;
  subject: string;
  content: string;
  type?: MessageType;
  parentId?: string; // For replies
  attachmentFiles?: Express.Multer.File[];
}

export interface MessageFilters {
  type?: string;
  status?: string;
  search?: string;
  conversationId?: string;
}

export interface MessagePagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class MessagingService {
  
  static async sendMessage(senderId: string, messageData: SendMessageData) {
    try {
      logger.debug(`📤 Sending message from ${senderId} to ${messageData.recipientId}`);

      // Vérifier que le destinataire existe
      const recipient = await prisma.user.findUnique({
        where: { id: messageData.recipientId },
      });

      if (!recipient) {
        throw new Error('Destinataire introuvable');
      }

      // Si c'est une réponse, vérifier que le message parent existe
      if (messageData.parentId) {
        const parentMessage = await prisma.message.findUnique({
          where: { id: messageData.parentId },
        });

        if (!parentMessage) {
          throw new Error('Message parent introuvable');
        }
      }

      // Upload attachments if provided
      let attachmentUrls: string[] = [];
      if (messageData.attachmentFiles && messageData.attachmentFiles.length > 0) {
        const { FileUploadService, FileType } = await import('./file-upload');
        
        const uploadPromises = messageData.attachmentFiles.map(file => 
          FileUploadService.uploadFile(file, FileType.MESSAGE_ATTACHMENT, senderId)
        );
        
        const uploadResults = await Promise.all(uploadPromises);
        attachmentUrls = uploadResults.map(result => result.url);
      }

      // Créer le message
      const message = await prisma.message.create({
        data: {
          senderId,
          recipientId: messageData.recipientId,
          subject: messageData.subject,
          content: messageData.content,
          type: messageData.type || MessageType.MESSAGE,
          parentId: messageData.parentId,
          status: MessageStatus.SENT,
          attachments: attachmentUrls.length > 0 ? {
            create: attachmentUrls.map(url => ({
              url,
              filename: 'attachment',
              fileType: 'unknown',
              fileSize: 0,
            }))
          } : undefined,
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
          parent: {
            select: {
              id: true,
              subject: true,
              sender: {
                select: {
                  name: true,
                },
              },
            },
          },
          attachments: true,
        },
      });

      logger.info(`✅ Message sent: ${message.id}`);
      return message;

    } catch (error) {
      logger.error('❌ Send message error:', error);
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
      logger.debug(`📥 Getting ${type} messages for user ${userId}`);

      const where: any = {
        [type === 'received' ? 'recipientId' : 'senderId']: userId,
      };

      // Filtres
      if (filters.type) {
        where.type = filters.type as MessageType;
      }

      if (filters.status) {
        where.status = filters.status as MessageStatus;
      }

      if (filters.search) {
        where.OR = [
          { subject: { contains: filters.search } },
          { content: { contains: filters.content } },
          {
            [type === 'received' ? 'sender' : 'recipient']: {
              name: { contains: filters.search },
            },
          },
        ];
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
          parent: {
            select: {
              id: true,
              subject: true,
              sender: {
                select: {
                  name: true,
                },
              },
            },
          },
          attachments: true,
          _count: {
            select: {
              replies: true,
            },
          },
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
      logger.error('❌ Get messages error:', error);
      throw error;
    }
  }

  static async getMessageById(messageId: string, userId: string) {
    try {
      logger.debug(`📨 Getting message ${messageId} for user ${userId}`);

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
          parent: {
            select: {
              id: true,
              subject: true,
              content: true,
              sender: {
                select: {
                  name: true,
                  avatar: true,
                },
              },
              createdAt: true,
            },
          },
          replies: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          attachments: true,
        },
      });

      if (!message) {
        throw new Error('Message non trouvé');
      }

      // Marquer comme lu si l'utilisateur est le destinataire
      if (message.recipientId === userId && message.status === MessageStatus.SENT) {
        await prisma.message.update({
          where: { id: messageId },
          data: { 
            status: MessageStatus.READ,
            readAt: new Date(),
          },
        });
        message.status = MessageStatus.READ;
        message.readAt = new Date();
      }

      return message;

    } catch (error) {
      logger.error('❌ Get message by ID error:', error);
      throw error;
    }
  }

  static async markAsRead(messageId: string, userId: string) {
    try {
      logger.debug(`✅ Marking message ${messageId} as read for user ${userId}`);

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
        data: { 
          status: MessageStatus.READ,
          readAt: new Date(),
        },
      });

      return updatedMessage;

    } catch (error) {
      logger.error('❌ Mark message as read error:', error);
      throw error;
    }
  }

  static async deleteMessage(messageId: string, userId: string) {
    try {
      logger.debug(`🗑️ Deleting message ${messageId} for user ${userId}`);

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

      logger.info(`✅ Message deleted: ${messageId}`);
      return { success: true };

    } catch (error) {
      logger.error('❌ Delete message error:', error);
      throw error;
    }
  }

  static async getConversations(userId: string, pagination: MessagePagination) {
    try {
      logger.debug(`💬 Getting conversations for user ${userId}`);

      // Requête pour obtenir les conversations (dernier message de chaque conversation)
      const conversations = await prisma.$queryRaw`
        SELECT DISTINCT
          CASE 
            WHEN senderId = ${userId} THEN recipientId 
            ELSE senderId 
          END as otherUserId,
          MAX(createdAt) as lastMessageDate,
          COUNT(*) as messageCount
        FROM Message 
        WHERE senderId = ${userId} OR recipientId = ${userId}
        GROUP BY otherUserId
        ORDER BY lastMessageDate DESC
        LIMIT ${pagination.limit}
        OFFSET ${(pagination.page - 1) * pagination.limit}
      ` as Array<{ otherUserId: string; lastMessageDate: Date; messageCount: number }>;

      // Obtenir les détails des utilisateurs et derniers messages
      const conversationDetails = await Promise.all(
        conversations.map(async (conv) => {
          const otherUser = await prisma.user.findUnique({
            where: { id: conv.otherUserId },
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
              status: true,
            },
          });

          const lastMessage = await prisma.message.findFirst({
            where: {
              OR: [
                { senderId: userId, recipientId: conv.otherUserId },
                { senderId: conv.otherUserId, recipientId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            include: {
              sender: {
                select: { name: true },
              },
            },
          });

          const unreadCount = await prisma.message.count({
            where: {
              senderId: conv.otherUserId,
              recipientId: userId,
              status: MessageStatus.SENT,
            },
          });

          return {
            otherUser,
            lastMessage,
            unreadCount,
            totalMessages: conv.messageCount,
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
      logger.error('❌ Get conversations error:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId: string) {
    try {
      const count = await prisma.message.count({
        where: {
          recipientId: userId,
          status: MessageStatus.SENT,
        },
      });

      return { unreadCount: count };

    } catch (error) {
      logger.error('❌ Get unread count error:', error);
      throw error;
    }
  }
}