// routes/solicitacoes.js
const express = require('express');
const { SolicitacoesController } = require('../controllers/solicitacoesController');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Criar solicitação (com validação)
router.post('/',
  validateRequest('criarSolicitacao'),
  SolicitacoesController.criarSolicitacao
);

// Listar solicitações por hospital
router.get('/',
  SolicitacoesController.listarSolicitacoes
);

// Buscar solicitação específica
router.get('/:id',
  validateRequest('uuidParam', 'params'),
  SolicitacoesController.buscarSolicitacao
);

// Atualizar solicitação
router.patch('/:id',
  validateRequest('uuidParam', 'params'),
  SolicitacoesController.atualizarSolicitacao
);

module.exports = router;
