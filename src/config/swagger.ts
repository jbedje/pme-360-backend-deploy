import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PME 360 API',
      version: '1.0.0',
      description: 'API complète pour la plateforme PME 360 - Écosystème d\'entraide pour PME',
      contact: {
        name: 'Équipe PME 360',
        email: 'api@pme360.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Serveur de développement'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token d\'authentification JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Message d\'erreur'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Opération réussie'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'uuid-user-id'
            },
            name: {
              type: 'string',
              example: 'Jean Dupont'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'jean.dupont@example.com'
            },
            profileType: {
              type: 'string',
              enum: ['STARTUP', 'EXPERT', 'MENTOR', 'INCUBATOR', 'INVESTOR', 'FINANCIAL_INSTITUTION', 'PUBLIC_ORGANIZATION', 'TECH_PARTNER', 'PME', 'CONSULTANT', 'ADMIN'],
              example: 'STARTUP'
            },
            company: {
              type: 'string',
              example: 'Ma Startup'
            },
            location: {
              type: 'string',
              example: 'Paris, France'
            },
            phone: {
              type: 'string',
              example: '+33123456789'
            },
            verified: {
              type: 'boolean',
              example: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password', 'profileType'],
          properties: {
            name: {
              type: 'string',
              example: 'Jean Dupont',
              minLength: 2,
              maxLength: 100
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'jean.dupont@example.com'
            },
            password: {
              type: 'string',
              example: 'MotDePasse123!',
              minLength: 8,
              description: 'Doit contenir au moins une majuscule, une minuscule et un chiffre'
            },
            profileType: {
              type: 'string',
              enum: ['STARTUP', 'EXPERT', 'MENTOR', 'INCUBATOR', 'INVESTOR', 'FINANCIAL_INSTITUTION', 'PUBLIC_ORGANIZATION', 'TECH_PARTNER', 'PME', 'CONSULTANT'],
              example: 'STARTUP'
            },
            company: {
              type: 'string',
              example: 'Ma Startup'
            },
            location: {
              type: 'string',
              example: 'Paris, France'
            },
            phone: {
              type: 'string',
              example: '+33123456789'
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'jean.dupont@example.com'
            },
            password: {
              type: 'string',
              example: 'MotDePasse123!'
            }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Connexion réussie'
            },
            data: {
              type: 'object',
              properties: {
                user: {
                  $ref: '#/components/schemas/User'
                },
                accessToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                },
                refreshToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                }
              }
            }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              example: 1
            },
            limit: {
              type: 'integer',
              example: 10
            },
            total: {
              type: 'integer',
              example: 100
            },
            totalPages: {
              type: 'integer',
              example: 10
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentification',
        description: 'Endpoints d\'authentification et gestion des tokens'
      },
      {
        name: 'Utilisateurs',
        description: 'Gestion des profils utilisateurs'
      },
      {
        name: 'Messages',
        description: 'Système de messagerie interne'
      },
      {
        name: 'Opportunités',
        description: 'Marketplace des opportunités business'
      },
      {
        name: 'Événements',
        description: 'Gestion des événements et webinaires'
      },
      {
        name: 'Ressources',
        description: 'Bibliothèque de ressources et outils'
      },
      {
        name: 'Notifications',
        description: 'Système de notifications temps réel'
      },
      {
        name: 'Fichiers',
        description: 'Upload et gestion des fichiers'
      },
      {
        name: 'Analytics',
        description: 'Métriques et analytiques de la plateforme'
      },
      {
        name: 'Monitoring',
        description: 'Santé et monitoring du système'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/**/*.ts'
  ]
};

// Generate Swagger specification
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Configure Swagger UI options
const swaggerUiOptions = {
  customCss: `
    .topbar-wrapper .download-url-wrapper { display: none }
    .swagger-ui .topbar { background-color: #1f2937; }
    .swagger-ui .topbar .topbar-wrapper .link { color: #fff; }
  `,
  customSiteTitle: 'PME 360 API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true
  }
};

// Setup Swagger middleware
export const setupSwagger = (app: Express): void => {
  // Serve swagger docs on /docs
  app.use('/docs', swaggerUi.serve);
  app.get('/docs', swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  
  // Serve swagger.json
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  
  console.log('📖 Swagger Documentation available at: http://localhost:3000/docs');
};

export { swaggerSpec };