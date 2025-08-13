// routes/auth.js
const express = require('express');
const { AuthController } = require('../controllers/authController');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Health check
router.get('/health', AuthController.healthCheck);

// Cadastrar usuário (com validação)
router.post('/cadastrar-usuario', 
  validateRequest('cadastrarUsuario'),
  AuthController.cadastrarUsuario
);

// Rota GET para redirecionamento de definir senha (quando acessada pelo navegador)
router.get('/definir-senha-inicial', (req, res) => {
  // Capturar todos os parâmetros da URL
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  
  // URL do frontend (nova página simplificada)
  const frontendUrl = process.env.FRONTEND_URL || 'https://vital-deploy.vercel.app';
  
  // Tentar extrair email dos parâmetros para adicionar explicitamente
  let emailParam = '';
  try {
    const urlParams = new URLSearchParams(queryString.replace('?', ''));
    const email = urlParams.get('email') || urlParams.get('user_email');
    if (email) {
      emailParam = queryString.includes('email=') ? '' : `${queryString ? '&' : '?'}email=${encodeURIComponent(email)}`;
    }
  } catch (error) {
    console.log('⚠️ Erro ao extrair email dos parâmetros:', error.message);
  }
  
  const redirectUrl = `${frontendUrl}/cadastro-senha.html${queryString}${emailParam}`;
  
  console.log('🔄 Redirecionamento GET /definir-senha-inicial para:', redirectUrl);
  res.redirect(302, redirectUrl);
});

// Definir senha inicial (com validação)
router.post('/definir-senha-inicial',
  validateRequest('definirSenha'),
  AuthController.definirSenhaInicial
);

// Listar usuários por hospital
router.get('/usuarios',
  AuthController.listarUsuarios
);

// Excluir usuário
router.delete('/excluir-usuario',
  validateRequest('excluirUsuario'),
  AuthController.excluirUsuario
);

// Verificar se usuário existe na autenticação
router.get('/verificar-usuario-auth/:userId',
  AuthController.verificarUsuarioAuth
);

// Verificar se usuário existe no banco de dados
router.get('/verificar-usuario-db/:userId',
  AuthController.verificarUsuarioDatabase
);

module.exports = router;
