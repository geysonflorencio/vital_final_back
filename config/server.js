// config/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Importa√ß√£o segura do express-rate-limit
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (error) {
  console.warn('‚ö Ô express-rate-limit n√£o dispon√vel, usando fallback');
  rateLimit = () => (req, res, next) => next(); // fallback middleware
}

// Middlewares customizados
const { requestLogger } = require('../middleware/logger');
const { errorHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');

function createServer() {
  const app = express();

  // Seguran√ßa b√sica
  app.use(helmet({
    contentSecurityPolicy: false, // Desabilitar para desenvolvimento
    crossOriginEmbedderPolicy: false
  }));

  // CORS configurado para produ√ß√£o
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://vital-deploy.vercel.app',
    'https://vital-deploy-backend.vercel.app',
    'https://www.appvital.com.br',
    'https://appvital.com.br'
  ];

  app.use(cors({
    origin: function (origin, callback) {
      // Permitir requisi√ß√µes sem origin (ex: mobile apps, Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log(' Origin n„o permitida:', origin);
        // callback(new Error('Not allowed by CORS'));
        callback(null, true); // Permitir todas temporariamente para debug
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200 // Para suporte a browsers legados
  }));

  // Debug CORS tempor√rio
  app.use((req, res, next) => {
    console.log(' [CORS DEBUG] Origin:', req.headers.origin);
    console.log(' [CORS DEBUG] Method:', req.method);
    console.log(' [CORS DEBUG] Headers:', req.headers);
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // m√ximo 100 requests por IP
    message: {
      error: 'Muitas tentativas, tente novamente em 15 minutos',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Rate limiting mais restritivo para rotas sens√veis
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // m√ximo 5 tentativas por IP
    message: {
      error: 'Muitas tentativas de autentica√ß√£o, tente novamente em 15 minutos',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    }
  });

  // Middlewares globais
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Rate limiting
  app.use('/api/', limiter);
  app.use('/api/cadastrar-usuario', authLimiter);
  app.use('/api/definir-senha-inicial', authLimiter);

  return { app, authLimiter };
}

module.exports = { createServer };
