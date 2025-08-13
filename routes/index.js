// routes/index.js
const express = require('express');
const authRoutes = require('./auth');
const solicitacoesRoutes = require('./solicitacoes');

const router = express.Router();

// Rota raiz da API
router.get('/', (req, res) => {
  res.json({
    message: 'API VITAL - Sistema de Triagem Hospitalar',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth/*',
      solicitacoes: '/api/solicitacoes/*'
    },
    documentation: '/api/docs'
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VITAL API',
    version: '2.0.0'
  });
});

// Rotas de autenticação e usuários
router.use('/auth', authRoutes);

// Rotas de solicitações  
router.use('/solicitacoes', solicitacoesRoutes);

// Rota de documentação (placeholder)
router.get('/docs', (req, res) => {
  res.json({
    message: 'Documentação da API',
    available_endpoints: [
      'GET /api/health',
      'POST /api/auth/cadastrar-usuario',
      'POST /api/auth/definir-senha-inicial', 
      'GET /api/auth/usuarios',
      'POST /api/solicitacoes',
      'GET /api/solicitacoes',
      'GET /api/solicitacoes/:id',
      'PATCH /api/solicitacoes/:id'
    ]
  });
});

module.exports = router;
