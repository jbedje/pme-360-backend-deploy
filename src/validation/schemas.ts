import { z } from 'zod';

// ==================== SCHEMAS DE BASE ====================

export const emailSchema = z.string().email('Email invalide').max(255);
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre');

export const nameSchema = z
  .string()
  .min(2, 'Le nom doit contenir au moins 2 caractères')
  .max(100, 'Le nom ne peut pas dépasser 100 caractères')
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Le nom contient des caractères invalides');

export const phoneSchema = z
  .string()
  .regex(/^[\+]?[0-9\s\-\(\)\.]{8,20}$/, 'Numéro de téléphone invalide')
  .optional();

export const urlSchema = z
  .string()
  .url('URL invalide')
  .optional()
  .or(z.literal(''));

export const uuidSchema = z.string().uuid('ID invalide');

// ==================== VALIDATION UTILISATEUR ====================

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  profileType: z.enum(['STARTUP', 'EXPERT', 'MENTOR', 'INCUBATOR', 'INVESTOR', 'FINANCIAL_INSTITUTION', 'PUBLIC_ORGANIZATION', 'TECH_PARTNER', 'PME', 'CONSULTANT', 'ADMIN']),
  company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  phone: phoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  website: urlSchema,
  linkedin: urlSchema,
  phone: phoneSchema,
});

// ==================== VALIDATION MESSAGES ====================

export const sendMessageSchema = z.object({
  recipientId: uuidSchema,
  subject: z.string().min(1, 'Sujet requis').max(200, 'Sujet trop long'),
  content: z.string().min(1, 'Contenu requis').max(5000, 'Message trop long'),
  type: z.enum(['MESSAGE', 'INVITATION', 'SYSTEM']).optional(),
  parentId: uuidSchema.optional(),
});

// ==================== VALIDATION OPPORTUNITÉS ====================

export const createOpportunitySchema = z.object({
  title: z.string().min(5, 'Titre trop court').max(200, 'Titre trop long'),
  description: z.string().min(20, 'Description trop courte').max(2000, 'Description trop longue'),
  type: z.enum(['FUNDING', 'TALENT', 'SERVICE', 'PARTNERSHIP']),
  budget: z.string().max(100).optional(),
  amount: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  remote: z.boolean().default(false),
  deadline: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  experience: z.string().max(500).optional(),
  requirements: z.array(z.string().max(100)).max(20).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const applyToOpportunitySchema = z.object({
  coverLetter: z.string().min(50, 'Lettre de motivation trop courte').max(2000, 'Lettre de motivation trop longue'),
  portfolio: urlSchema,
  expectedBudget: z.string().max(100).optional(),
});

// ==================== VALIDATION RESSOURCES ====================

export const createResourceSchema = z.object({
  title: z.string().min(5, 'Titre trop court').max(200, 'Titre trop long'),
  description: z.string().min(20, 'Description trop courte').max(1000, 'Description trop longue'),
  content: z.string().max(10000).optional(),
  url: urlSchema,
  type: z.enum(['GUIDE', 'TEMPLATE', 'TOOL', 'ARTICLE', 'VIDEO', 'WEBINAR']),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isPremium: z.boolean().default(false),
});

// ==================== VALIDATION ÉVÉNEMENTS ====================

export const createEventSchema = z.object({
  title: z.string().min(5, 'Titre trop court').max(200, 'Titre trop long'),
  description: z.string().min(20, 'Description trop courte').max(2000, 'Description trop longue'),
  type: z.enum(['CONFERENCE', 'WORKSHOP', 'NETWORKING', 'WEBINAR', 'MEETUP']),
  startDate: z.coerce.date().refine(date => date > new Date(), 'La date de début doit être dans le futur'),
  endDate: z.coerce.date().optional(),
  location: z.string().max(200).optional(),
  isOnline: z.boolean().default(false),
  meetingUrl: urlSchema,
  maxAttendees: z.number().min(1).max(10000).optional(),
  price: z.string().max(50).optional(),
  organizerContact: z.string().max(200).optional(),
}).refine(data => {
  if (data.endDate && data.endDate <= data.startDate) {
    return false;
  }
  return true;
}, {
  message: 'La date de fin doit être après la date de début',
  path: ['endDate']
}).refine(data => {
  if (data.isOnline && !data.meetingUrl) {
    return false;
  }
  return true;
}, {
  message: 'URL de réunion requise pour les événements en ligne',
  path: ['meetingUrl']
});

// ==================== VALIDATION NOTIFICATIONS ====================

export const createNotificationSchema = z.object({
  userId: uuidSchema,
  type: z.enum(['MESSAGE', 'CONNECTION_REQUEST', 'OPPORTUNITY_MATCH', 'APPLICATION_UPDATE', 'EVENT_REMINDER', 'SYSTEM']),
  title: z.string().min(1, 'Titre requis').max(200, 'Titre trop long'),
  message: z.string().min(1, 'Message requis').max(500, 'Message trop long'),
  actionUrl: z.string().max(500).optional(),
  data: z.record(z.any()).optional(),
});

// ==================== VALIDATION PAGINATION ====================

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ==================== VALIDATION FILTRES ====================

export const userFiltersSchema = z.object({
  profileType: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  verified: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
});

export const opportunityFiltersSchema = z.object({
  type: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  remote: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  tags: z.string().max(200).optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
});

export const eventFiltersSchema = z.object({
  type: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  isOnline: z.coerce.boolean().optional(),
  location: z.string().max(200).optional(),
  upcoming: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
});

export const resourceFiltersSchema = z.object({
  type: z.string().max(50).optional(),
  author: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  tags: z.string().max(200).optional(),
  isPremium: z.coerce.boolean().optional(),
});

export const messageFiltersSchema = z.object({
  type: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  conversationId: uuidSchema.optional(),
});

export const notificationFiltersSchema = z.object({
  type: z.string().max(50).optional(),
  read: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
});

// ==================== VALIDATION ANALYTICS ====================

export const analyticsUserMetricsSchema = z.object({
  period: z.enum(['week', 'month', 'year']).default('month'),
});

export const analyticsTrendsSchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
});

// ==================== VALIDATION UPLOAD ====================

export const fileUploadSchema = z.object({
  fileType: z.enum(['avatar', 'resource_thumbnail', 'message_attachment', 'event_image', 'application_document', 'company_logo']),
});

// ==================== VALIDATION ID PARAMS ====================

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const userIdParamSchema = z.object({
  userId: uuidSchema,
});

export const opportunityIdParamSchema = z.object({
  opportunityId: uuidSchema,
});

export const eventIdParamSchema = z.object({
  eventId: uuidSchema,
});

export const resourceIdParamSchema = z.object({
  resourceId: uuidSchema,
});

export const messageIdParamSchema = z.object({
  messageId: uuidSchema,
});

export const notificationIdParamSchema = z.object({
  notificationId: uuidSchema,
});

// ==================== TYPES EXPORTÉS ====================

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type UpdateUserData = z.infer<typeof updateUserSchema>;
export type SendMessageData = z.infer<typeof sendMessageSchema>;
export type CreateOpportunityData = z.infer<typeof createOpportunitySchema>;
export type ApplyToOpportunityData = z.infer<typeof applyToOpportunitySchema>;
export type CreateResourceData = z.infer<typeof createResourceSchema>;
export type CreateEventData = z.infer<typeof createEventSchema>;
export type CreateNotificationData = z.infer<typeof createNotificationSchema>;
export type PaginationData = z.infer<typeof paginationSchema>;
export type UserFiltersData = z.infer<typeof userFiltersSchema>;
export type OpportunityFiltersData = z.infer<typeof opportunityFiltersSchema>;
export type EventFiltersData = z.infer<typeof eventFiltersSchema>;
export type ResourceFiltersData = z.infer<typeof resourceFiltersSchema>;
export type MessageFiltersData = z.infer<typeof messageFiltersSchema>;
export type NotificationFiltersData = z.infer<typeof notificationFiltersSchema>;