// middleware/validation.js
const Joi = require('joi');
const { AppError } = require('./errorHandler');

// Schemas de validação
const schemas = {
  // Validação para cadastro de usuário
  cadastrarUsuario: Joi.object({
    nome: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    role: Joi.string().valid('admin', 'medico', 'enfermeira', 'master').required(),
    hospital_id: Joi.string().uuid().required()
  }),

  // Validação para definir senha
  definirSenha: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required()
  }),

  // Validação para excluir usuário
  excluirUsuario: Joi.object({
    user_id: Joi.string().uuid().required()
  }),

  // Validação para solicitação
  criarSolicitacao: Joi.object({
    paciente: Joi.string().min(2).max(100).required(),
    leito: Joi.string().pattern(/^[A-Za-z0-9\-_]+$/).max(20).required(),
    observacao: Joi.string().max(500).allow('').optional(),
    mews: Joi.number().integer().min(0).max(6).required(),
    motivo: Joi.string().max(100).required(),
    motivo_especifico: Joi.string().max(100).allow(null).optional(),
    hospital_id: Joi.string().uuid().required()
  }),

  // Validação para UUID params
  uuidParam: Joi.object({
    id: Joi.string().uuid().required()
  })
};

// Middleware de validação genérico
const validateRequest = (schemaName, target = 'body') => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return next(new AppError('Schema de validação não encontrado', 500, 'INVALID_SCHEMA'));
    }

    const data = target === 'params' ? req.params : 
                  target === 'query' ? req.query : req.body;

    // Suporte a aliases para exclusão de usuário (compatibilidade legado)
    if (schemaName === 'excluirUsuario' && data && typeof data === 'object') {
      if (!data.user_id) {
        if (data.id) data.user_id = data.id;
        else if (data.userId) data.user_id = data.userId;
        else if (data.user_id === undefined && data.userID) data.user_id = data.userID;
      }
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return next(new AppError('Dados inválidos', 400, 'VALIDATION_ERROR', details));
    }

    // Substituir dados validados
    if (target === 'params') req.params = value;
    else if (target === 'query') req.query = value;
    else req.body = value;

    next();
  };
};

// Validações específicas reutilizáveis
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  schemas,
  validateRequest,
  validateEmail,
  validateUUID,
  sanitizeString
};
