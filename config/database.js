// config/database.js
// Configuração SIMPLES e FUNCIONAL do Supabase

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

let supabase;
try {
  const { createClient } = require('@supabase/supabase-js');
  
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('✅ Supabase configurado com sucesso');
  console.log('🔧 URL:', supabaseUrl);
  
  // Teste básico
  if (typeof supabase.from !== 'function') {
    throw new Error('Cliente Supabase inválido - método from não disponível');
  }
  
  console.log('✅ Cliente Supabase validado');
  
} catch (error) {
  console.error('❌ Erro CRÍTICO ao configurar Supabase:', error.message);
  process.exit(1);
}

module.exports = {
  supabase,
  isSupabaseAvailable: true
};
