// controllers/authController.js
const { SupabaseService } = require('../services/supabaseService');
const { UserCreationService } = require('../services/userCreationService');
const { Logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { validateEmail, sanitizeString } = require('../middleware/validation');

class AuthController {
  // Cadastrar novo usuário
  static async cadastrarUsuario(req, res, next) {
    try {
      const { nome, email, role, hospital_id } = req.body;

      Logger.info('Tentativa de cadastro de usuário - método melhorado', { 
        email, 
        role, 
        hospital_id,
        admin_ip: req.ip 
      });

      // Usar o novo serviço seguro de criação
      const resultado = await UserCreationService.criarUsuarioSeguro(
        email,
        nome,
        role,
        hospital_id
      );

      Logger.security('Usuário criado com sucesso via serviço seguro', {
        user_id: resultado.user.id,
        email,
        role,
        hospital_id,
        duration: resultado.duration,
        created_by_ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'Usuário cadastrado com sucesso! Um convite foi enviado por email.',
        data: {
          id: resultado.user.id,
          email,
          nome_completo: nome,
          role,
          hospital_id,
          convite_enviado: true,
          metadados_verificados: true,
          profile_criado: true,
          vinculo_hospital_criado: true
        }
      });

    } catch (error) {
      Logger.error('Erro no cadastro de usuário - método melhorado', {
        error: error.message,
        code: error.code,
        email: req.body?.email,
        ip: req.ip
      });
      next(error);
    }
  }

  // Definir senha inicial
  static async definirSenhaInicial(req, res, next) {
    try {
      const { email, password } = req.body;

      Logger.info('Tentativa de definir senha inicial', { 
        email,
        ip: req.ip 
      });

      // Validações
      if (!validateEmail(email)) {
        throw new AppError('Email inválido', 400, 'INVALID_EMAIL');
      }

      if (password.length < 6) {
        throw new AppError('Senha deve ter pelo menos 6 caracteres', 400, 'WEAK_PASSWORD');
      }

      // Usar método otimizado para definir senha inicial
      const result = await SupabaseService.definirSenhaInicial(email, password);

      Logger.security('Senha inicial definida com sucesso', {
        user_id: result.user.id,
        email,
        is_first_setup: result.isFirstTimeSetup,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Senha definida com sucesso!',
        data: {
          user_id: result.user.id,
          email: result.user.email,
          first_time_setup: result.isFirstTimeSetup
        }
      });

    } catch (error) {
      Logger.error('Erro ao definir senha inicial', {
        error: error.message,
        email: req.body?.email,
        ip: req.ip
      });
      next(error);
    }
  }

  // Listar usuários por hospital
  static async listarUsuarios(req, res, next) {
    try {
      const { hospital_id } = req.query;

      if (!hospital_id) {
        throw new AppError('Hospital ID é obrigatório', 400, 'MISSING_HOSPITAL_ID');
      }

      Logger.info('Listagem de usuários solicitada', { 
        hospital_id,
        ip: req.ip 
      });

      const usuarios = await SupabaseService.getUsersByHospital(hospital_id);

      res.json({
        success: true,
        data: usuarios
      });

    } catch (error) {
      Logger.error('Erro ao listar usuários', {
        error: error.message,
        hospital_id: req.query?.hospital_id,
        ip: req.ip
      });
      next(error);
    }
  }

  // Excluir usuário
  static async excluirUsuario(req, res, next) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        throw new AppError('ID do usuário é obrigatório', 400, 'MISSING_USER_ID');
      }

      Logger.info('Tentativa de exclusão de usuário', { 
        user_id,
        admin_ip: req.ip 
      });

      // Usar o método de exclusão otimizado que já busca o perfil
      const result = await SupabaseService.deleteUser(user_id);

      Logger.security('Usuário excluído com sucesso', {
        deleted_user_id: user_id,
        admin_ip: req.ip,
        result: result
      });

      res.json({
        success: true,
        message: 'Usuário excluído com sucesso',
        data: {
          deleted_user_id: user_id
        }
      });

    } catch (error) {
      console.log('❌ [DEBUG] Erro na exclusão de usuário:', error);
      console.log('❌ [DEBUG] Stack trace:', error.stack);
      
      Logger.error('Erro na exclusão de usuário', {
        error: error.message,
        user_id: req.body?.user_id,
        ip: req.ip
      });
      next(error);
    }
  }

  // Health check
  static async healthCheck(req, res) {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  }

  // Verificar se usuário ainda existe na autenticação
  static async verificarUsuarioAuth(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new AppError('ID do usuário é obrigatório', 400, 'MISSING_USER_ID');
      }

      const result = await SupabaseService.checkUserExistsInAuth(userId);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      Logger.error('Erro na verificação de usuário na auth', {
        error: error.message,
        userId: req.params?.userId,
        ip: req.ip
      });
      next(error);
    }
  }

  // Verificar se usuário ainda existe no banco de dados
  static async verificarUsuarioDatabase(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new AppError('ID do usuário é obrigatório', 400, 'MISSING_USER_ID');
      }

      const result = await SupabaseService.checkUserExistsInDatabase(userId);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      Logger.error('Erro na verificação de usuário no banco', {
        error: error.message,
        userId: req.params?.userId,
        ip: req.ip
      });
      next(error);
    }
  }
}

module.exports = { AuthController };
