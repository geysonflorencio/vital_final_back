// controllers/solicitacoesController.js
const { SupabaseService } = require('../services/supabaseService');
const { Logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { sanitizeString } = require('../middleware/validation');

class SolicitacoesController {
  // Criar nova solicitação
  static async criarSolicitacao(req, res, next) {
    try {
      const { 
        paciente, 
        leito, 
        observacao, 
        mews, 
        motivo, 
        motivo_especifico, 
        hospital_id,
        solicitado_por,
        enfermeira_nome 
      } = req.body;

      Logger.info('Criação de solicitação iniciada', { 
        paciente: sanitizeString(paciente),
        leito: sanitizeString(leito),
        hospital_id,
        mews,
        ip: req.ip 
      });

      const solicitacaoData = {
        paciente: sanitizeString(paciente),
        leito: sanitizeString(leito),
        observacao: sanitizeString(observacao || ''),
        mews: parseInt(mews),
        status: 'pendente',
        motivo: sanitizeString(motivo),
        motivo_especifico: motivo_especifico ? sanitizeString(motivo_especifico) : null,
        hospital_id,
        solicitado_por,
        enfermeira_nome: sanitizeString(enfermeira_nome),
        created_at: new Date().toISOString()
      };

      const novaSolicitacao = await SupabaseService.createSolicitacao(solicitacaoData);

      Logger.info('Solicitação criada com sucesso', {
        id: novaSolicitacao.id,
        paciente: novaSolicitacao.paciente,
        hospital_id,
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'Solicitação criada com sucesso',
        data: novaSolicitacao
      });

    } catch (error) {
      Logger.error('Erro ao criar solicitação', {
        error: error.message,
        paciente: req.body?.paciente,
        hospital_id: req.body?.hospital_id,
        ip: req.ip
      });
      next(error);
    }
  }

  // Listar solicitações por hospital
  static async listarSolicitacoes(req, res, next) {
    try {
      const { hospital_id, status } = req.query;

      if (!hospital_id) {
        throw new AppError('Hospital ID é obrigatório', 400, 'MISSING_HOSPITAL_ID');
      }

      Logger.info('Listagem de solicitações', { 
        hospital_id,
        status: status || 'all',
        ip: req.ip 
      });

      const solicitacoes = await SupabaseService.getSolicitacoesByHospital(hospital_id, status);

      res.json({
        success: true,
        data: solicitacoes,
        count: solicitacoes.length
      });

    } catch (error) {
      Logger.error('Erro ao listar solicitações', {
        error: error.message,
        hospital_id: req.query?.hospital_id,
        ip: req.ip
      });
      next(error);
    }
  }

  // Atualizar status da solicitação
  static async atualizarSolicitacao(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      Logger.info('Atualização de solicitação', { 
        id,
        updates: Object.keys(updateData),
        ip: req.ip 
      });

      // Sanitizar dados de entrada
      if (updateData.observacao) {
        updateData.observacao = sanitizeString(updateData.observacao);
      }
      if (updateData.motivo_cancelamento) {
        updateData.motivo_cancelamento = sanitizeString(updateData.motivo_cancelamento);
      }

      // Adicionar timestamp de atualização
      updateData.updated_at = new Date().toISOString();

      const solicitacaoAtualizada = await SupabaseService.updateSolicitacao(id, updateData);

      Logger.info('Solicitação atualizada com sucesso', {
        id,
        new_status: updateData.status,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Solicitação atualizada com sucesso',
        data: solicitacaoAtualizada
      });

    } catch (error) {
      Logger.error('Erro ao atualizar solicitação', {
        error: error.message,
        id: req.params?.id,
        ip: req.ip
      });
      next(error);
    }
  }

  // Buscar solicitação por ID
  static async buscarSolicitacao(req, res, next) {
    try {
      const { id } = req.params;

      Logger.info('Busca de solicitação por ID', { 
        id,
        ip: req.ip 
      });

      const solicitacao = await SupabaseService.safeQuery(
        supabase.from('solicitacoes').select('*').eq('id', id).single(),
        'solicitacoes',
        { id }
      );

      if (!solicitacao) {
        throw new AppError('Solicitação não encontrada', 404, 'SOLICITACAO_NOT_FOUND');
      }

      res.json({
        success: true,
        data: solicitacao
      });

    } catch (error) {
      Logger.error('Erro ao buscar solicitação', {
        error: error.message,
        id: req.params?.id,
        ip: req.ip
      });
      next(error);
    }
  }
}

module.exports = { SolicitacoesController };
