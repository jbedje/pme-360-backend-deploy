import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { SimpleJWTService } from '../utils/simple-jwt';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  email?: string;
}

export class WebSocketNotificationService {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();

  constructor(server: any) {
    console.log('🔌 Initializing WebSocket server for notifications...');
    
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/notifications',
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    console.log('✅ WebSocket server initialized on /ws/notifications');
  }

  private handleConnection(ws: AuthenticatedWebSocket, request: IncomingMessage) {
    console.log('👋 New WebSocket connection attempt');

    // Authentifier le client via token dans l'URL ou les headers
    const url = new URL(request.url || '', 'http://localhost');
    const token = url.searchParams.get('token') || request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      console.log('❌ WebSocket connection rejected: No token provided');
      ws.close(4001, 'Authentication required');
      return;
    }

    const payload = SimpleJWTService.verifyAccessToken(token);
    if (!payload) {
      console.log('❌ WebSocket connection rejected: Invalid token');
      ws.close(4001, 'Invalid token');
      return;
    }

    // Authentification réussie
    ws.userId = payload.userId;
    ws.email = payload.email;
    this.clients.set(payload.userId, ws);
    
    console.log(`✅ WebSocket authenticated for user: ${payload.email} (${payload.userId})`);
    console.log(`👥 Connected clients: ${this.clients.size}`);

    // Envoyer un message de bienvenue
    this.sendToClient(payload.userId, {
      type: 'connected',
      message: 'Connecté aux notifications temps réel',
      timestamp: new Date().toISOString(),
    });

    // Gérer les messages du client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        console.error('❌ Invalid WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Message invalide',
        }));
      }
    });

    // Gérer la déconnexion
    ws.on('close', () => {
      if (ws.userId) {
        this.clients.delete(ws.userId);
        console.log(`👋 WebSocket disconnected: ${ws.email} (${ws.userId})`);
        console.log(`👥 Connected clients: ${this.clients.size}`);
      }
    });

    // Gérer les erreurs
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      if (ws.userId) {
        this.clients.delete(ws.userId);
      }
    });
  }

  private handleClientMessage(ws: AuthenticatedWebSocket, message: any) {
    console.log(`📨 WebSocket message from ${ws.userId}:`, message);

    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString(),
        }));
        break;

      case 'subscribe':
        // Le client peut s'abonner à des types spécifiques de notifications
        console.log(`📡 User ${ws.userId} subscribed to: ${message.topics?.join(', ') || 'all'}`);
        ws.send(JSON.stringify({
          type: 'subscribed',
          topics: message.topics || ['all'],
        }));
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Type de message non reconnu',
        }));
    }
  }

  // Envoyer une notification à un utilisateur spécifique
  public sendNotificationToUser(userId: string, notification: any) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      const message = {
        type: 'notification',
        data: notification,
        timestamp: new Date().toISOString(),
      };

      client.send(JSON.stringify(message));
      console.log(`🔔 Notification sent to user ${userId}: ${notification.title}`);
      return true;
    }
    
    console.log(`📭 User ${userId} not connected to WebSocket`);
    return false;
  }

  // Envoyer un message à un client spécifique
  public sendToClient(userId: string, message: any) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // Diffuser un message à tous les clients connectés
  public broadcast(message: any) {
    let sentCount = 0;
    
    this.clients.forEach((client, userId) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
        sentCount++;
      } else {
        // Nettoyer les connexions fermées
        this.clients.delete(userId);
      }
    });

    console.log(`📢 Broadcast message sent to ${sentCount} clients`);
    return sentCount;
  }

  // Obtenir les statistiques des connexions
  public getStats() {
    return {
      connectedClients: this.clients.size,
      clientIds: Array.from(this.clients.keys()),
    };
  }

  // Fermer le serveur WebSocket
  public close() {
    console.log('🔌 Closing WebSocket server...');
    this.wss.close(() => {
      console.log('✅ WebSocket server closed');
    });
  }
}