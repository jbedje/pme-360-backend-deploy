import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

export enum AuditActions {
  // Authentification
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  
  // Utilisateurs
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  PROFILE_VIEW = 'PROFILE_VIEW',
  
  // Opportunités
  OPPORTUNITY_CREATE = 'OPPORTUNITY_CREATE',
  OPPORTUNITY_UPDATE = 'OPPORTUNITY_UPDATE',
  OPPORTUNITY_DELETE = 'OPPORTUNITY_DELETE',
  OPPORTUNITY_APPLY = 'OPPORTUNITY_APPLY',
  APPLICATION_UPDATE = 'APPLICATION_UPDATE',
  
  // Événements
  EVENT_CREATE = 'EVENT_CREATE',
  EVENT_UPDATE = 'EVENT_UPDATE',
  EVENT_DELETE = 'EVENT_DELETE',
  EVENT_REGISTER = 'EVENT_REGISTER',
  EVENT_UNREGISTER = 'EVENT_UNREGISTER',
  
  // Ressources
  RESOURCE_CREATE = 'RESOURCE_CREATE',
  RESOURCE_UPDATE = 'RESOURCE_UPDATE',
  RESOURCE_DELETE = 'RESOURCE_DELETE',
  RESOURCE_VIEW = 'RESOURCE_VIEW',
  RESOURCE_DOWNLOAD = 'RESOURCE_DOWNLOAD',
  
  // Messages
  MESSAGE_SEND = 'MESSAGE_SEND',
  MESSAGE_READ = 'MESSAGE_READ',
  MESSAGE_DELETE = 'MESSAGE_DELETE',
  
  // Connexions
  CONNECTION_REQUEST = 'CONNECTION_REQUEST',
  CONNECTION_ACCEPT = 'CONNECTION_ACCEPT',
  CONNECTION_REJECT = 'CONNECTION_REJECT',
  
  // Uploads
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DELETE = 'FILE_DELETE',
  
  // Administration
  ADMIN_ACTION = 'ADMIN_ACTION',
  USER_BAN = 'USER_BAN',
  USER_UNBAN = 'USER_UNBAN',
  
  // Sécurité
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export class AuditService {
  
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Log dans Winston pour les logs applicatifs
      logger.info('Audit log entry:', {
        ...entry,
        timestamp: new Date().toISOString(),
      });

      // Sauvegarder en base de données pour l'audit persistant
      // Note: Il faudrait créer un modèle AuditLog dans Prisma pour cela
      // Pour l'instant, on utilise seulement les logs Winston
      
      // En production, on pourrait aussi envoyer vers un service externe
      // comme Elasticsearch, Splunk, ou un SIEM

    } catch (error) {
      // Ne pas faire échouer la requête principale à cause des logs
      logger.error('Failed to write audit log:', error);
    }
  }

  // Méthodes de convenance pour les actions courantes
  
  static async logAuthentication(
    action: AuditActions.LOGIN | AuditActions.LOGOUT | AuditActions.REGISTER,
    userId: string,
    success: boolean,
    ip?: string,
    userAgent?: string,
    error?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'AUTH',
      success,
      ip,
      userAgent,
      error,
    });
  }

  static async logUserAction(
    action: AuditActions,
    userId: string,
    targetUserId?: string,
    details?: any,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'USER',
      resourceId: targetUserId,
      details,
      success: true,
      ip,
      userAgent,
    });
  }

  static async logResourceAction(
    action: AuditActions,
    userId: string,
    resource: string,
    resourceId: string,
    details?: any,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: resource.toUpperCase(),
      resourceId,
      details,
      success: true,
      ip,
      userAgent,
    });
  }

  static async logSecurityEvent(
    action: AuditActions,
    description: string,
    ip?: string,
    userAgent?: string,
    userId?: string,
    details?: any
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'SECURITY',
      details: { description, ...details },
      success: false, // Les événements de sécurité sont généralement des échecs
      ip,
      userAgent,
    });
  }

  static async logAdminAction(
    action: AuditActions,
    adminId: string,
    targetResource: string,
    targetId: string,
    details?: any,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId: adminId,
      action,
      resource: targetResource.toUpperCase(),
      resourceId: targetId,
      details: { adminAction: true, ...details },
      success: true,
      ip,
      userAgent,
    });
  }

  // Recherche dans les logs d'audit (pour l'administration)
  static async searchAuditLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    ip?: string;
    success?: boolean;
    limit?: number;
    offset?: number;
  }) {
    try {
      // Cette fonction nécessiterait un modèle AuditLog en base
      // Pour l'instant, retourner un placeholder
      
      logger.info('Audit log search requested:', filters);
      
      return {
        logs: [],
        total: 0,
        message: 'Audit log search not yet implemented - using Winston logs',
      };

    } catch (error) {
      logger.error('Failed to search audit logs:', error);
      throw error;
    }
  }

  // Statistiques d'audit pour le tableau de bord admin
  static async getAuditStats(period: 'day' | 'week' | 'month' = 'day') {
    try {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Cette fonction nécessiterait un modèle AuditLog en base
      // Pour l'instant, retourner des statistiques simulées
      
      return {
        totalEvents: 0,
        loginAttempts: 0,
        failedLogins: 0,
        securityEvents: 0,
        adminActions: 0,
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        message: 'Audit stats not yet implemented - using Winston logs',
      };

    } catch (error) {
      logger.error('Failed to get audit stats:', error);
      throw error;
    }
  }

  // Détecter les activités suspectes
  static async detectSuspiciousActivity(userId: string, ip?: string) {
    try {
      // Cette fonction analyserait les patterns suspects
      // comme plusieurs tentatives de connexion, accès depuis des IPs différentes, etc.
      
      const suspiciousPatterns = [];

      // Exemple de détection : trop de tentatives de connexion
      // En production, on analyserait les vrais logs

      logger.info('Suspicious activity check requested:', { userId, ip });

      return {
        suspicious: false,
        patterns: suspiciousPatterns,
        riskScore: 0,
        recommendations: [],
      };

    } catch (error) {
      logger.error('Failed to detect suspicious activity:', error);
      throw error;
    }
  }
}

// Middleware pour l'audit automatique
export const auditMiddleware = (action: AuditActions, resource: string) => {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const user = req.user;
    const ip = req.ip;
    const userAgent = req.get('User-Agent');

    // Capturer la réponse
    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;

      // Logger l'action
      AuditService.log({
        userId: user?.id,
        action,
        resource,
        resourceId: req.params.id || req.params.userId || req.params.opportunityId,
        details: {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          duration,
          body: req.method !== 'GET' ? req.body : undefined,
        },
        success,
        ip,
        userAgent,
        error: success ? undefined : 'Request failed',
      });

      return originalSend.call(this, data);
    };

    next();
  };
};