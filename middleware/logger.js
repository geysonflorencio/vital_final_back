// middleware/logger.js

/**
 * Middleware de logging para requisições HTTP
 */
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // Log da requisição
  console.log(`[${timestamp}] ${method} ${url} - ${userAgent}`);
  
  // Capturar o tempo de resposta
  const startTime = Date.now();
  
  // Override da função end para capturar quando a resposta é enviada
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log da resposta
    console.log(`[${timestamp}] ${method} ${url} - ${statusCode} - ${duration}ms`);
    
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Logger para erros críticos
 */
const errorLogger = (error, req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  
  console.error(`[${timestamp}] ERROR ${method} ${url}:`, {
    message: error.message,
    stack: error.stack,
    body: req.body,
    params: req.params,
    query: req.query
  });
  
  next(error);
};

/**
 * Logger genérico para debug
 */
const debugLogger = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] DEBUG: ${message}`, data);
  } else {
    console.log(`[${timestamp}] DEBUG: ${message}`);
  }
};

/**
 * Classe Logger compatível com as chamadas existentes
 */
const Logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] INFO: ${message}`, data || '');
  },
  
  error: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR: ${message}`, data || '');
  },
  
  security: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] SECURITY: ${message}`, data || '');
  },
  
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] WARN: ${message}`, data || '');
  }
};

module.exports = {
  requestLogger,
  errorLogger,
  debugLogger,
  Logger
};
