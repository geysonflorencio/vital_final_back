// middleware/errorHandler.js
const { Logger } = require('./logger');

// Classe customizada para erros da aplicação
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Middleware de tratamento de erros
const errorHandler = (err, req, res, next) => {
  console.log('🔍 [DEBUG] ErrorHandler called with:', {
    err: err ? 'exists' : 'null/undefined',
    errType: typeof err,
    errConstructor: err?.constructor?.name
  });
  
  // Garantir que err seja um objeto válido
  if (!err) {
    err = new Error('Erro desconhecido');
  }

  let { statusCode = 500, message = 'Erro interno do servidor', code = 'INTERNAL_ERROR' } = err;

  // Log do erro
  console.log('🔍 [DEBUG] About to log error. Logger exists:', !!Logger);
  console.log('🔍 [DEBUG] Error object:', {
    message: err.message,
    statusCode,
    code,
    stack: err.stack ? 'exists' : 'missing'
  });
  
  try {
    Logger.error('Erro capturado', {
      message: err.message || 'Erro sem mensagem',
      stack: err.stack || 'Stack não disponível',
      url: req.url,
      method: req.method,
      ip: req.ip,
      statusCode,
      code,
      details: err.details || null, // Incluir detalhes de validação
      originalError: err
    });
  } catch (logError) {
    console.error('🚨 [ERROR] Failed to log error:', logError.message);
    console.error('🚨 [ERROR] Original error was:', err.message);
  }

  // Erros específicos do Supabase
  if (err.message?.includes('duplicate key value violates unique constraint')) {
    statusCode = 409;
    message = 'Registro duplicado';
    code = 'DUPLICATE_ENTRY';
  } else if (err.message?.includes('violates foreign key constraint')) {
    statusCode = 400;
    message = 'Referência inválida';
    code = 'INVALID_REFERENCE';
  } else if (err.message?.includes('permission denied')) {
    statusCode = 403;
    message = 'Permissão negada';
    code = 'PERMISSION_DENIED';
  }

  // Resposta ao cliente
  const response = {
    success: false,
    error: {
      message,
      code,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  res.status(statusCode).json(response);
};

// Middleware para rotas não encontradas
const notFoundHandler = (req, res) => {
  Logger.warn('Rota não encontrada', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Rota não encontrada',
      code: 'ROUTE_NOT_FOUND'
    }
  });
};

module.exports = { 
  AppError, 
  errorHandler, 
  notFoundHandler 
};
