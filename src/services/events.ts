import { PrismaClient, EventType, EventStatus } from '@prisma/client';
import { NotificationsService } from './notifications';

const prisma = new PrismaClient();

export interface CreateEventData {
  title: string;
  description: string;
  type: EventType;
  startDate: Date;
  endDate?: Date;
  location?: string;
  isOnline?: boolean;
  meetingUrl?: string;
  maxAttendees?: number;
  price?: string;
  organizer: string;
  organizerContact?: string;
  imageFile?: Express.Multer.File;
  creatorId?: string;
}

export interface EventFilters {
  type?: string;
  status?: string;
  isOnline?: boolean;
  location?: string;
  upcoming?: boolean;
  search?: string;
  organizer?: string;
}

export interface EventPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class EventsService {
  
  static async createEvent(eventData: CreateEventData) {
    try {
      console.log(`📅 Creating event: ${eventData.title}`);

      // Upload event image if provided as file
      let imageUrl: string | undefined;
      if (eventData.imageFile && eventData.creatorId) {
        const { FileUploadService, FileType } = await import('./file-upload');
        const uploadResult = await FileUploadService.uploadFile(
          eventData.imageFile,
          FileType.EVENT_IMAGE,
          eventData.creatorId
        );
        imageUrl = uploadResult.url;
      }

      const event = await prisma.event.create({
        data: {
          title: eventData.title,
          description: eventData.description,
          type: eventData.type,
          startDate: eventData.startDate,
          endDate: eventData.endDate,
          location: eventData.location,
          isOnline: eventData.isOnline || false,
          meetingUrl: eventData.meetingUrl,
          maxAttendees: eventData.maxAttendees,
          price: eventData.price,
          organizer: eventData.organizer,
          organizerContact: eventData.organizerContact,
          imageUrl,
        },
        include: {
          registrations: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
          },
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });

      console.log(`✅ Event created: ${event.id}`);
      return event;

    } catch (error) {
      console.error('❌ Create event error:', error);
      throw error;
    }
  }

  static async getEvents(filters: EventFilters, pagination: EventPagination) {
    try {
      console.log('📋 Getting events with filters:', filters);

      const where: any = {
        status: EventStatus.UPCOMING, // Par défaut, ne montrer que les événements à venir
      };

      // Filtres
      if (filters.type) {
        where.type = filters.type as EventType;
      }

      if (filters.status) {
        where.status = filters.status as EventStatus;
      }

      if (filters.isOnline !== undefined) {
        where.isOnline = filters.isOnline;
      }

      if (filters.location) {
        where.location = { contains: filters.location };
      }

      if (filters.organizer) {
        where.organizer = { contains: filters.organizer };
      }

      if (filters.upcoming) {
        where.startDate = { gte: new Date() };
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search } },
          { description: { contains: filters.search } },
          { location: { contains: filters.search } },
          { organizer: { contains: filters.search } },
        ];
      }

      const total = await prisma.event.count({ where });

      const events = await prisma.event.findMany({
        where,
        include: {
          _count: {
            select: {
              registrations: true,
            },
          },
        },
        orderBy: {
          [pagination.sortBy || 'startDate']: pagination.sortOrder || 'asc',
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        events,
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
      console.error('❌ Get events error:', error);
      throw error;
    }
  }

  static async getEventById(eventId: string, userId?: string) {
    try {
      console.log(`📄 Getting event ${eventId}`);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          registrations: userId ? {
            where: { userId },
          } : {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  profileType: true,
                },
              },
            },
          },
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });

      if (!event) {
        throw new Error('Événement non trouvé');
      }

      return event;

    } catch (error) {
      console.error('❌ Get event by ID error:', error);
      throw error;
    }
  }

  static async updateEvent(eventId: string, organizerName: string, updateData: Partial<CreateEventData>) {
    try {
      console.log(`📅 Updating event ${eventId}`);

      // Vérifier que l'utilisateur est l'organisateur
      const existingEvent = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!existingEvent) {
        throw new Error('Événement non trouvé');
      }

      if (existingEvent.organizer !== organizerName) {
        throw new Error('Non autorisé à modifier cet événement');
      }

      // Upload new event image if provided as file
      let imageUrl = existingEvent.imageUrl;
      if (updateData.imageFile && updateData.creatorId) {
        const { FileUploadService, FileType } = await import('./file-upload');
        const uploadResult = await FileUploadService.uploadFile(
          updateData.imageFile,
          FileType.EVENT_IMAGE,
          updateData.creatorId
        );
        imageUrl = uploadResult.url;

        // Delete old image if exists
        if (existingEvent.imageUrl) {
          const publicId = existingEvent.imageUrl.split('/').pop()?.split('.')[0];
          if (publicId) {
            await FileUploadService.deleteFile(publicId);
          }
        }
      }

      // Mettre à jour l'événement
      const event = await prisma.event.update({
        where: { id: eventId },
        data: {
          title: updateData.title,
          description: updateData.description,
          type: updateData.type,
          startDate: updateData.startDate,
          endDate: updateData.endDate,
          location: updateData.location,
          isOnline: updateData.isOnline,
          meetingUrl: updateData.meetingUrl,
          maxAttendees: updateData.maxAttendees,
          price: updateData.price,
          organizer: updateData.organizer,
          organizerContact: updateData.organizerContact,
          imageUrl,
        },
        include: {
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });

      console.log(`✅ Event updated: ${event.id}`);
      return event;

    } catch (error) {
      console.error('❌ Update event error:', error);
      throw error;
    }
  }

  static async deleteEvent(eventId: string, organizerName: string) {
    try {
      console.log(`🗑️ Deleting event ${eventId}`);

      const existingEvent = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!existingEvent) {
        throw new Error('Événement non trouvé');
      }

      if (existingEvent.organizer !== organizerName) {
        throw new Error('Non autorisé à supprimer cet événement');
      }

      await prisma.event.delete({
        where: { id: eventId },
      });

      console.log(`✅ Event deleted: ${eventId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Delete event error:', error);
      throw error;
    }
  }

  static async registerForEvent(eventId: string, userId: string) {
    try {
      console.log(`📝 Registering user ${userId} for event ${eventId}`);

      // Vérifier que l'événement existe et est ouvert aux inscriptions
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          _count: {
            select: {
              registrations: true,
            },
          },
        },
      });

      if (!event) {
        throw new Error('Événement non trouvé');
      }

      if (event.status !== EventStatus.UPCOMING) {
        throw new Error('Les inscriptions pour cet événement ne sont pas ouvertes');
      }

      if (event.startDate < new Date()) {
        throw new Error('Impossible de s\'inscrire à un événement passé');
      }

      if (event.maxAttendees && event._count.registrations >= event.maxAttendees) {
        throw new Error('L\'événement est complet');
      }

      // Vérifier qu'il n'y a pas déjà une inscription
      const existingRegistration = await prisma.eventRegistration.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (existingRegistration) {
        throw new Error('Vous êtes déjà inscrit à cet événement');
      }

      // Créer l'inscription
      const registration = await prisma.eventRegistration.create({
        data: {
          eventId,
          userId,
        },
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
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
              organizer: true,
            },
          },
        },
      });

      console.log(`✅ Registration created: ${registration.id}`);
      
      // Créer une notification pour l'organisateur
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true }
        });
        
        if (user) {
          // TODO: Le schéma Event utilise organizer:String au lieu d'organizerId:String
          // Pour les notifications, il faudrait idéalement avoir l'ID de l'organisateur
          // Pour l'instant, on skip cette notification
          console.log(`📝 TODO: Créer notification pour organisateur "${event.organizer}" - besoin de l'ID utilisateur`);
        }
      } catch (notificationError) {
        console.error('❌ Failed to create event registration notification:', notificationError);
      }
      
      return registration;

    } catch (error) {
      console.error('❌ Register for event error:', error);
      throw error;
    }
  }

  static async unregisterFromEvent(eventId: string, userId: string) {
    try {
      console.log(`❌ Unregistering user ${userId} from event ${eventId}`);

      const registration = await prisma.eventRegistration.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (!registration) {
        throw new Error('Inscription non trouvée');
      }

      await prisma.eventRegistration.delete({
        where: { id: registration.id },
      });

      console.log(`✅ Registration deleted: ${registration.id}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Unregister from event error:', error);
      throw error;
    }
  }

  static async getEventRegistrations(eventId: string, organizerName: string, pagination: EventPagination) {
    try {
      console.log(`📋 Getting registrations for event ${eventId}`);

      // Vérifier que l'utilisateur est l'organisateur de l'événement
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Événement non trouvé');
      }

      if (event.organizer !== organizerName) {
        throw new Error('Non autorisé à voir les inscriptions');
      }

      const total = await prisma.eventRegistration.count({
        where: { eventId },
      });

      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              profileType: true,
              avatar: true,
              company: true,
              location: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        registrations,
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
      console.error('❌ Get event registrations error:', error);
      throw error;
    }
  }

  static async getUserRegistrations(userId: string, pagination: EventPagination) {
    try {
      console.log(`📋 Getting registrations for user ${userId}`);

      const total = await prisma.eventRegistration.count({
        where: { userId },
      });

      const registrations = await prisma.eventRegistration.findMany({
        where: { userId },
        include: {
          event: true,
        },
        orderBy: { event: { startDate: 'asc' } },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        registrations: registrations.map(r => r.event),
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
      console.error('❌ Get user registrations error:', error);
      throw error;
    }
  }

  static async getEventsByOrganizer(organizerName: string, pagination: EventPagination) {
    try {
      console.log(`📅 Getting events by organizer: ${organizerName}`);

      const total = await prisma.event.count({
        where: { organizer: { contains: organizerName } },
      });

      const events = await prisma.event.findMany({
        where: { organizer: { contains: organizerName } },
        include: {
          _count: {
            select: {
              registrations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        events,
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
      console.error('❌ Get events by organizer error:', error);
      throw error;
    }
  }
}