# 🚂 Railway Setup Guide

## 1. Create PostgreSQL Database

```bash
1. In Railway project dashboard
2. Click "New Service"
3. Select "Database" → "PostgreSQL"
4. Wait for deployment (2-3 minutes)
```

## 2. Connect Database to Web Service

```bash
1. Go to your web service
2. Click "Variables" tab
3. Check if DATABASE_URL exists
4. If not, click "New Variable"
5. Add: DATABASE_URL = ${{Postgres.DATABASE_URL}}
```

## 3. Add Required Environment Variables

```env
NODE_ENV=production
JWT_SECRET=your_super_secure_jwt_secret_32_characters_minimum
JWT_REFRESH_SECRET=your_different_refresh_secret_also_secure
```

## 4. Expected Railway Structure

```
Project: pme-360
├── Web Service (from GitHub)
└── PostgreSQL Database
```

## 5. Test Deployment

```bash
1. Check logs show: "🚀 PME 360 API Server running"
2. Test URL: https://your-project.up.railway.app/health
3. Should return: {"status": "OK", ...}
```

## 🚨 Troubleshooting

- **P1001 Database error**: Database not connected to web service
- **Healthcheck failure**: Server not starting on port correctly
- **Build failure**: Check logs for missing dependencies