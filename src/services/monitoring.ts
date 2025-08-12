import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import os from 'os';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
    external: HealthCheck;
  };
  metrics: SystemMetrics;
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  responseTime?: number;
  message?: string;
  details?: any;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    free: number;
    total: number;
    usagePercent: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
  requests: {
    total: number;
    errors: number;
    averageResponseTime: number;
  };
}

// Métriques en mémoire (en production, utiliser Redis)
let requestMetrics = {
  total: 0,
  errors: 0,
  totalResponseTime: 0,
  averageResponseTime: 0,
};

export class MonitoringService {

  static async getHealthStatus(): Promise<HealthStatus> {
    const startTime = performance.now();

    try {
      // Vérifications parallèles
      const [databaseCheck, memoryCheck, diskCheck, externalCheck] = await Promise.all([
        this.checkDatabase(),
        this.checkMemory(),
        this.checkDisk(),
        this.checkExternalServices(),
      ]);

      const metrics = this.getSystemMetrics();

      // Déterminer le statut global
      const checks = { database: databaseCheck, memory: memoryCheck, disk: diskCheck, external: externalCheck };
      const overallStatus = this.determineOverallStatus(checks);

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        checks,
        metrics,
      };

      const responseTime = performance.now() - startTime;
      logger.info('Health check completed', { 
        status: overallStatus, 
        responseTime: Math.round(responseTime),
        timestamp: healthStatus.timestamp 
      });

      return healthStatus;

    } catch (error) {
      logger.error('Health check failed:', error);
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        checks: {
          database: { status: 'fail', message: 'Health check system failure' },
          memory: { status: 'fail', message: 'Health check system failure' },
          disk: { status: 'fail', message: 'Health check system failure' },
          external: { status: 'fail', message: 'Health check system failure' },
        },
        metrics: this.getSystemMetrics(),
      };
    }
  }

  private static async checkDatabase(): Promise<HealthCheck> {
    const startTime = performance.now();

    try {
      // Test de connexion simple
      await prisma.$queryRaw`SELECT 1`;
      
      // Test de performance
      const responseTime = performance.now() - startTime;
      
      if (responseTime > 1000) {
        return {
          status: 'warn',
          responseTime: Math.round(responseTime),
          message: 'Database response time is slow',
        };
      }

      return {
        status: 'pass',
        responseTime: Math.round(responseTime),
        message: 'Database connection healthy',
      };

    } catch (error) {
      logger.error('Database health check failed:', error);
      
      return {
        status: 'fail',
        responseTime: performance.now() - startTime,
        message: 'Database connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static async checkMemory(): Promise<HealthCheck> {
    try {
      const memInfo = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usagePercent = (usedMem / totalMem) * 100;

      // Seuils d'alerte
      if (usagePercent > 90) {
        return {
          status: 'fail',
          message: 'Memory usage critical',
          details: {
            usagePercent: Math.round(usagePercent),
            processHeapUsed: Math.round(memInfo.heapUsed / 1024 / 1024), // MB
          },
        };
      }

      if (usagePercent > 80) {
        return {
          status: 'warn',
          message: 'Memory usage high',
          details: {
            usagePercent: Math.round(usagePercent),
            processHeapUsed: Math.round(memInfo.heapUsed / 1024 / 1024),
          },
        };
      }

      return {
        status: 'pass',
        message: 'Memory usage normal',
        details: {
          usagePercent: Math.round(usagePercent),
          processHeapUsed: Math.round(memInfo.heapUsed / 1024 / 1024),
        },
      };

    } catch (error) {
      return {
        status: 'fail',
        message: 'Memory check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static async checkDisk(): Promise<HealthCheck> {
    try {
      // Sur les systèmes Unix, on pourrait utiliser statvfs
      // Pour Windows et compatibilité générale, on fait une vérification simple
      
      const tmpDir = os.tmpdir();
      
      // Test d'écriture simple
      const fs = await import('fs/promises');
      const testFile = `${tmpDir}/health-check-${Date.now()}.tmp`;
      
      const startTime = performance.now();
      await fs.writeFile(testFile, 'health check test');
      await fs.readFile(testFile);
      await fs.unlink(testFile);
      const responseTime = performance.now() - startTime;

      if (responseTime > 500) {
        return {
          status: 'warn',
          responseTime: Math.round(responseTime),
          message: 'Disk I/O performance degraded',
        };
      }

      return {
        status: 'pass',
        responseTime: Math.round(responseTime),
        message: 'Disk I/O healthy',
      };

    } catch (error) {
      return {
        status: 'fail',
        message: 'Disk check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static async checkExternalServices(): Promise<HealthCheck> {
    try {
      // Vérifier les services externes (Cloudinary, email, etc.)
      const checks = [];

      // Test DNS (exemple)
      try {
        const dns = await import('dns/promises');
        await dns.resolve('google.com');
        checks.push({ service: 'dns', status: 'pass' });
      } catch (error) {
        checks.push({ service: 'dns', status: 'fail', error: error instanceof Error ? error.message : 'Unknown' });
      }

      const failedServices = checks.filter(c => c.status === 'fail');

      if (failedServices.length > 0) {
        return {
          status: 'warn',
          message: 'Some external services unavailable',
          details: { checks, failedCount: failedServices.length },
        };
      }

      return {
        status: 'pass',
        message: 'External services healthy',
        details: { checks },
      };

    } catch (error) {
      return {
        status: 'fail',
        message: 'External services check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private static getSystemMetrics(): SystemMetrics {
    const memInfo = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu: {
        usage: 0, // Nécessiterait un calcul plus complexe
        loadAverage: os.loadavg(),
      },
      memory: {
        used: usedMem,
        free: freeMem,
        total: totalMem,
        usagePercent: (usedMem / totalMem) * 100,
      },
      process: {
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        memoryUsage: memInfo,
      },
      requests: {
        total: requestMetrics.total,
        errors: requestMetrics.errors,
        averageResponseTime: requestMetrics.averageResponseTime,
      },
    };
  }

  private static determineOverallStatus(checks: Record<string, HealthCheck>): 'healthy' | 'degraded' | 'unhealthy' {
    const checkValues = Object.values(checks);
    const failedCount = checkValues.filter(c => c.status === 'fail').length;
    const warnCount = checkValues.filter(c => c.status === 'warn').length;

    if (failedCount > 0) {
      return 'unhealthy';
    }
    
    if (warnCount > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  // Middleware pour traquer les métriques des requêtes
  static requestMetricsMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = performance.now();
      
      requestMetrics.total++;

      // Intercepter la fin de la réponse
      const originalEnd = res.end;
      res.end = function(...args: any[]) {
        const responseTime = performance.now() - startTime;
        
        // Mettre à jour les métriques
        requestMetrics.totalResponseTime += responseTime;
        requestMetrics.averageResponseTime = requestMetrics.totalResponseTime / requestMetrics.total;

        if (res.statusCode >= 400) {
          requestMetrics.errors++;
        }

        return originalEnd.apply(this, args);
      };

      next();
    };
  }

  // Obtenir des métriques spécifiques
  static async getDatabaseMetrics() {
    try {
      // Statistiques de la base de données
      const [userCount, opportunityCount, eventCount, messageCount] = await Promise.all([
        prisma.user.count(),
        prisma.opportunity.count(),
        prisma.event.count(),
        prisma.message.count(),
      ]);

      return {
        tables: {
          users: userCount,
          opportunities: opportunityCount,
          events: eventCount,
          messages: messageCount,
        },
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to get database metrics:', error);
      throw error;
    }
  }

  // Reset des métriques (pour les tests ou la maintenance)
  static resetMetrics() {
    requestMetrics = {
      total: 0,
      errors: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
    };
    
    logger.info('Request metrics reset');
  }

  // Alertes basées sur les seuils
  static async checkAlerts(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const health = await this.getHealthStatus();

    // Vérifier les seuils critiques
    if (health.status === 'unhealthy') {
      alerts.push({
        type: 'critical',
        message: 'System is unhealthy',
        details: health.checks,
        timestamp: new Date().toISOString(),
      });
    }

    if (health.metrics.memory.usagePercent > 85) {
      alerts.push({
        type: 'warning',
        message: 'High memory usage detected',
        details: { usagePercent: health.metrics.memory.usagePercent },
        timestamp: new Date().toISOString(),
      });
    }

    if (health.metrics.requests.errors / health.metrics.requests.total > 0.1) {
      alerts.push({
        type: 'warning',
        message: 'High error rate detected',
        details: { 
          errorRate: (health.metrics.requests.errors / health.metrics.requests.total) * 100,
          totalRequests: health.metrics.requests.total,
          errors: health.metrics.requests.errors,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return alerts;
  }
}

interface Alert {
  type: 'info' | 'warning' | 'critical';
  message: string;
  details: any;
  timestamp: string;
}