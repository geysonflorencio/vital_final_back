// index.js - VITAL Backend (VERSÃƒÆ’O CORRIGIDA)
// Carregar .env apenas em desenvolvimento, sem sobrescrever variÃƒÂ¡veis do sistema
require('dotenv').config({ override: false });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { getPasswordRedirectURL, logURLConfiguration } = require('./utils/urlUtils');
const scheduledNotifications = require('./routes/scheduled-notifications');

// Importar web-push de forma segura
let webpush = null;
try {
  webpush = require('web-push');
  console.log('Ã¢Å“â€¦ web-push carregado com sucesso');
} catch (e) {
  console.warn('Ã¢Å¡Â Ã¯Â¸Â web-push nÃƒÂ£o instalado - Web Push desabilitado');
}

const app = express();

// CORS - ConfiguraÃƒÂ§ÃƒÂ£o simplificada e funcional
app.use(cors({
  origin: [
    'https://appvital.com.br',
    'https://www.appvital.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://vital-deploy.vercel.app',
    'https://vital-final.vercel.app',
    'https://vitalv2.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// ConfiguraÃƒÂ§ÃƒÂ£o do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://aeysoqtbencykavivgoe.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleXNvcXRiZW5jeWthdml2Z29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTE4MTY1OSwiZXhwIjoyMDY0NzU3NjU5fQ.g64X3iebdB_TY_FWd6AI8mlej4uKMrKiFLG11z6hZlQ';

console.log('Ã°Å¸â€Â§ Inicializando Supabase...', { url: supabaseUrl });
const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.set('supabase', supabase);

// Log da configuraÃƒÂ§ÃƒÂ£o de URLs
logURLConfiguration();

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'VITAL API - Backend Funcional',
    status: 'online',
    version: '3.1.0-notifications',
    timestamp: new Date().toISOString()
  });
});

// ROTA DELETE EXCLUIR USUÃƒÂRIO - IMPLEMENTAÃƒâ€¡ÃƒÆ’O DIRETA
app.delete('/api/excluir-usuario', async (req, res) => {
  try {
    console.log('Ã°Å¸â€”â€˜Ã¯Â¸Â DELETE /api/excluir-usuario chamado');
    console.log('Body recebido:', req.body);

    const { user_id, id, userId, hospital_id, admin_id } = req.body;
    const userIdToDelete = user_id || id || userId;

    if (!userIdToDelete) {
      return res.status(400).json({
        error: 'ID do usuÃƒÂ¡rio ÃƒÂ© obrigatÃƒÂ³rio',
        expected: 'user_id, id ou userId no body da requisiÃƒÂ§ÃƒÂ£o'
      });
    }

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL - Verificar se admin tem permissÃƒÂ£o
    if (hospital_id) {
      // Verificar se o usuÃƒÂ¡rio a ser excluÃƒÂ­do pertence ao hospital
      const { data: userProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('hospital_id')
        .eq('id', userIdToDelete)
        .single();

      if (!profileCheckError && userProfile && userProfile.hospital_id !== hospital_id) {
        console.warn(`Ã¢Å¡Â Ã¯Â¸Â Tentativa de excluir usuÃƒÂ¡rio de outro hospital: ${userProfile.hospital_id} vs ${hospital_id}`);
        return res.status(403).json({
          error: 'VocÃƒÂª nÃƒÂ£o tem permissÃƒÂ£o para excluir usuÃƒÂ¡rios de outro hospital',
          message: 'Isolamento multi-tenant ativo'
        });
      }
    }

    console.log(`Ã°Å¸Å½Â¯ Excluindo usuÃƒÂ¡rio: ${userIdToDelete}`);

    // 1. Deletar referÃƒÂªncias na tabela user_hospitals
    const { error: userHospitalError } = await supabase
      .from('user_hospitals')
      .delete()
      .eq('user_id', userIdToDelete);

    if (userHospitalError) {
      console.warn('Ã¢Å¡Â Ã¯Â¸Â Erro ao deletar user_hospitals:', userHospitalError);
    }

    // 2. Deletar solicitaÃƒÂ§ÃƒÂµes relacionadas
    const { error: solicitacoesError } = await supabase
      .from('solicitacoes')
      .delete()
      .eq('user_id', userIdToDelete);

    if (solicitacoesError) {
      console.warn('Ã¢Å¡Â Ã¯Â¸Â Erro ao deletar solicitaÃƒÂ§ÃƒÂµes:', solicitacoesError);
    }

    // 3. Deletar perfil do usuÃƒÂ¡rio
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userIdToDelete);

    if (profileError) {
      console.error('Ã¢ÂÅ’ Erro ao deletar perfil:', profileError);
      return res.status(500).json({
        error: 'Erro ao deletar perfil do usuÃƒÂ¡rio',
        details: profileError.message
      });
    }

    // 4. Deletar da autenticaÃƒÂ§ÃƒÂ£o do Supabase
    const { error: authError } = await supabase.auth.admin.deleteUser(userIdToDelete);
    
    if (authError) {
      console.warn('Ã¢Å¡Â Ã¯Â¸Â Erro ao deletar da auth (perfil jÃƒÂ¡ foi removido):', authError.message);
    }

    console.log('Ã¢Å“â€¦ UsuÃƒÂ¡rio excluÃƒÂ­do com sucesso:', userIdToDelete);

    res.json({
      success: true,
      message: 'UsuÃƒÂ¡rio excluÃƒÂ­do com sucesso',
      user_id: userIdToDelete,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro ao excluir usuÃƒÂ¡rio:', error);
    res.status(500).json({
      error: 'Erro interno ao excluir usuÃƒÂ¡rio',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST CADASTRAR USUÃƒÂRIO - IMPLEMENTAÃƒâ€¡ÃƒÆ’O DIRETA
app.post('/api/cadastrar-usuario', async (req, res) => {
  try {
    console.log('Ã°Å¸â€˜Â¤ POST /api/cadastrar-usuario chamado');
    console.log('Body recebido:', req.body);

    const { nome, email, role, hospital_id, admin_hospital_id } = req.body;

    // ValidaÃƒÂ§ÃƒÂ£o bÃƒÂ¡sica
    if (!nome || !email || !role) {
      return res.status(400).json({
        error: 'Nome, email e role sÃƒÂ£o obrigatÃƒÂ³rios',
        required: ['nome', 'email', 'role'],
        optional: ['hospital_id']
      });
    }

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL - Verificar se admin estÃƒÂ¡ criando usuÃƒÂ¡rio no prÃƒÂ³prio hospital
    if (admin_hospital_id && hospital_id && admin_hospital_id !== hospital_id) {
      console.warn(`Ã¢Å¡Â Ã¯Â¸Â Admin tentando criar usuÃƒÂ¡rio em outro hospital: ${admin_hospital_id} vs ${hospital_id}`);
      return res.status(403).json({
        error: 'VocÃƒÂª nÃƒÂ£o pode criar usuÃƒÂ¡rios para outro hospital',
        message: 'Isolamento multi-tenant ativo'
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Email invÃƒÂ¡lido',
        email: email
      });
    }

    console.log(`Ã°Å¸â€˜Â¥ Criando usuÃƒÂ¡rio: ${nome} (${email}) - Role: ${role}`);

    // 1. Criar usuÃƒÂ¡rio na autenticaÃƒÂ§ÃƒÂ£o do Supabase com email de convite
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: false, // NÃƒÂ£o confirmar automaticamente para forÃƒÂ§ar definiÃƒÂ§ÃƒÂ£o de senha
      user_metadata: {
        nome_completo: nome,
        role: role
      }
    });

    if (authError) {
      console.error('Ã¢ÂÅ’ Erro ao criar usuÃƒÂ¡rio na auth:', authError);
      return res.status(400).json({
        error: 'Erro ao criar usuÃƒÂ¡rio: ' + authError.message
      });
    }

    console.log('Ã¢Å“â€¦ UsuÃƒÂ¡rio criado na auth:', authUser.user.id);

    // 2. Enviar email de convite para definir senha
    console.log('Ã°Å¸â€œÂ§ Tentando enviar email de convite...');
    const redirectURL = getPasswordRedirectURL();
    console.log('Ã°Å¸â€â€” URL de redirecionamento:', redirectURL);
    
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectURL,
      data: {
        nome_completo: nome,
        role: role,
        user_id: authUser.user.id
      }
    });

    if (inviteError) {
      console.error('Ã¢ÂÅ’ ERRO ao enviar email de convite:', inviteError);
      console.error('Ã°Å¸â€œÂ§ Detalhes do erro:', {
        code: inviteError.code,
        message: inviteError.message,
        details: inviteError.details || 'Sem detalhes adicionais'
      });
      // NÃƒÂ£o falhar a criaÃƒÂ§ÃƒÂ£o por causa do email, apenas avisar
    } else {
      console.log('Ã¢Å“â€¦ Email de convite enviado com sucesso para:', email);
      console.log('Ã°Å¸â€œÂ¬ Dados do envio:', inviteData);
    }

    // 2. Criar perfil do usuÃƒÂ¡rio na tabela profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        nome_completo: nome,
        email: email,
        role: role,
        hospital_id: hospital_id || null,
        ativo: true
      })
      .select()
      .single();

    if (profileError) {
      console.error('Ã¢ÂÅ’ Erro ao criar perfil:', profileError);
      // Tentar remover o usuÃƒÂ¡rio da auth se o perfil falhar
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({
        error: 'Erro ao criar perfil do usuÃƒÂ¡rio',
        details: profileError.message
      });
    }

    console.log('Ã¢Å“â€¦ Perfil criado:', profile.id);

    // 3. Criar vÃƒÂ­nculo com hospital se fornecido
    if (hospital_id) {
      const { error: hospitalError } = await supabase
        .from('user_hospitals')
        .insert({
          user_id: authUser.user.id,
          hospital_id: hospital_id,
          role: role, // Incluindo o role que ÃƒÂ© obrigatÃƒÂ³rio na tabela
          ativo: true
        });

      if (hospitalError) {
        console.warn('Ã¢Å¡Â Ã¯Â¸Â Erro ao vincular hospital:', hospitalError);
      } else {
        console.log('Ã¢Å“â€¦ UsuÃƒÂ¡rio vinculado ao hospital:', hospital_id);
      }
    }

    res.status(201).json({
      success: true,
      message: 'UsuÃƒÂ¡rio cadastrado com sucesso! Email de convite enviado.',
      data: {
        id: authUser.user.id,
        email: email,
        nome_completo: nome,
        role: role,
        hospital_id: hospital_id,
        ativo: true,
        email_enviado: !inviteError
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro ao cadastrar usuÃƒÂ¡rio:', error);
    res.status(500).json({
      error: 'Erro interno ao cadastrar usuÃƒÂ¡rio',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST DEFINIR SENHA MANUAL - SOLUÃƒâ€¡ÃƒÆ’O PARA PROBLEMAS DE EMAIL
app.post('/api/definir-senha-manual', async (req, res) => {
  try {
    console.log('Ã°Å¸â€Â POST /api/definir-senha-manual chamado');
    console.log('Body recebido:', req.body);

    const { user_id, email, senha } = req.body;

    // ValidaÃƒÂ§ÃƒÂ£o bÃƒÂ¡sica
    if (!user_id || !senha) {
      return res.status(400).json({
        error: 'user_id e senha sÃƒÂ£o obrigatÃƒÂ³rios',
        required: ['user_id', 'senha']
      });
    }

    // Validar senha (mÃƒÂ­nimo 6 caracteres)
    if (senha.length < 6) {
      return res.status(400).json({
        error: 'Senha deve ter pelo menos 6 caracteres'
      });
    }

    console.log(`Ã°Å¸â€Â Definindo senha manual para usuÃƒÂ¡rio: ${user_id}`);

    // 1. Atualizar senha no Supabase Auth
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(user_id, {
      password: senha,
      email_confirm: true // Confirmar email automaticamente
    });

    if (updateError) {
      console.error('Ã¢ÂÅ’ Erro ao atualizar senha:', updateError);
      return res.status(400).json({
        error: 'Erro ao definir senha: ' + updateError.message
      });
    }

    console.log('Ã¢Å“â€¦ Senha definida com sucesso:', user_id);

    res.json({
      success: true,
      message: 'Senha definida com sucesso! UsuÃƒÂ¡rio pode fazer login.',
      user_id: user_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro ao definir senha manual:', error);
    res.status(500).json({
      error: 'Erro interno ao definir senha',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST DEFINIR SENHA INICIAL - IMPLEMENTAÃƒâ€¡ÃƒÆ’O DIRETA
app.post('/api/definir-senha-inicial', async (req, res) => {
  try {
    console.log('Ã°Å¸â€â€˜ POST /api/definir-senha-inicial chamado');
    console.log('Body recebido:', req.body);

    const { email, password } = req.body;

    // ValidaÃƒÂ§ÃƒÂ£o bÃƒÂ¡sica
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email e senha sÃƒÂ£o obrigatÃƒÂ³rios',
        required: ['email', 'password']
      });
    }

    // Validar senha mÃƒÂ­nima
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Senha deve ter pelo menos 6 caracteres',
        received_length: password.length
      });
    }

    console.log(`Ã°Å¸â€â€˜ Definindo senha para: ${email}`);

    // 1. Buscar usuÃƒÂ¡rio no Supabase Auth por email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Ã¢ÂÅ’ Erro ao listar usuÃƒÂ¡rios:', listError);
      return res.status(500).json({
        error: 'Erro ao buscar usuÃƒÂ¡rio',
        details: listError.message
      });
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error('Ã¢ÂÅ’ UsuÃƒÂ¡rio nÃƒÂ£o encontrado:', email);
      return res.status(404).json({
        error: 'UsuÃƒÂ¡rio nÃƒÂ£o encontrado',
        email: email
      });
    }

    console.log('Ã°Å¸â€˜Â¤ UsuÃƒÂ¡rio encontrado:', user.id);

    // 2. Atualizar senha do usuÃƒÂ¡rio
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { 
        password: password,
        email_confirm: true  // Confirmar email automaticamente
      }
    );

    if (updateError) {
      console.error('Ã¢ÂÅ’ Erro ao atualizar senha:', updateError);
      return res.status(500).json({
        error: 'Erro ao definir senha',
        details: updateError.message
      });
    }

    console.log('Ã¢Å“â€¦ Senha definida com sucesso para:', email);

    res.json({
      success: true,
      message: 'Senha definida com sucesso',
      user_id: user.id,
      email: email,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro ao definir senha inicial:', error);
    res.status(500).json({
      error: 'Erro interno ao definir senha',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VITAL API'
  });
});

// Database status check
app.get('/api/db-status', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Tenta fazer uma query simples para verificar conexÃƒÂ£o
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    
    if (error) {
      return res.status(200).json({
        status: 'warning',
        database: 'connection_issue',
        message: error.message,
        responseTime,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      status: 'ok',
      database: 'connected',
      responseTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      status: 'error',
      database: 'disconnected',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Auth service status check
app.get('/api/auth/status', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Verifica se o serviÃƒÂ§o de auth estÃƒÂ¡ funcionando
    const { data, error } = await supabase.auth.getSession();
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'ok',
      auth: 'available',
      responseTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// WEB PUSH NOTIFICATIONS - ROTAS
// ============================================

// Configurar VAPID
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:suporte@appvital.com.br';

let vapidConfigured = false;
if (webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    // Limpar chaves - remover espaÃƒÂ§os, quebras de linha e "="
    const cleanPublicKey = VAPID_PUBLIC_KEY.replace(/[\s\r\n=]+/g, '').trim();
    const cleanPrivateKey = VAPID_PRIVATE_KEY.replace(/[\s\r\n=]+/g, '').trim();
    
    webpush.setVapidDetails(VAPID_SUBJECT, cleanPublicKey, cleanPrivateKey);
    vapidConfigured = true;
    console.log('Ã¢Å“â€¦ Web Push VAPID configurado com sucesso');
  } catch (vapidError) {
    console.error('Ã¢ÂÅ’ Erro ao configurar VAPID:', vapidError.message);
  }
} else {
  console.warn('Ã¢Å¡Â Ã¯Â¸Â VAPID keys nÃƒÂ£o configuradas ou web-push nÃƒÂ£o instalado');
}

// POST /api/push/subscription - Registrar subscription
app.post('/api/push/subscription', async (req, res) => {
  try {
    console.log('Ã°Å¸â€œÂ± POST /api/push/subscription');
    const { subscription, user_id, hospital_id, device_info } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription invÃƒÂ¡lida' });
    }

    // Primeiro, deletar qualquer subscription existente com o mesmo endpoint
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint);

    // Depois, inserir a nova subscription
    const { data, error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: user_id || null,
        hospital_id: hospital_id || null,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || null,
        auth: subscription.keys?.auth || null,
        device_info: device_info || null,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Ã¢ÂÅ’ Erro ao salvar subscription:', error);
      return res.status(500).json({ error: 'Erro ao salvar subscription', details: error.message });
    }

    console.log('Ã¢Å“â€¦ Subscription salva:', data?.[0]?.id);
    res.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/push/cleanup - Limpar subscriptions duplicadas
app.delete('/api/push/cleanup', async (req, res) => {
  try {
    const { hospital_id } = req.body;

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL
    let query = supabase
      .from('push_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    // Se hospital_id fornecido, filtrar apenas subscriptions desse hospital
    if (hospital_id) {
      query = query.eq('hospital_id', hospital_id);
      console.log(`Ã°Å¸ÂÂ¥ Cleanup filtrado para hospital: ${hospital_id}`);
    } else {
      console.log('Ã¢Å¡Â Ã¯Â¸Â Cleanup sem filtro de hospital - limpando duplicatas globais');
    }

    // Buscar subscriptions (filtradas ou todas)
    const { data: all, error: fetchError } = await query;

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    // Identificar duplicatas (manter apenas a mais recente de cada endpoint)
    const seen = new Set();
    const toDelete = [];

    for (const sub of all || []) {
      if (seen.has(sub.endpoint)) {
        toDelete.push(sub.id);
      } else {
        seen.add(sub.endpoint);
      }
    }

    // Deletar duplicatas
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', toDelete);

      if (deleteError) {
        return res.status(500).json({ error: deleteError.message });
      }
    }

    res.json({ 
      success: true, 
      removed: toDelete.length,
      remaining: seen.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/push/subscription/:id - Deletar subscription por ID
app.delete('/api/push/subscription/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hospital_id } = req.body;

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL
    let query = supabase
      .from('push_subscriptions')
      .delete()
      .eq('id', id);

    // Se hospital_id fornecido, adicionar como filtro de seguranÃƒÂ§a
    if (hospital_id) {
      query = query.eq('hospital_id', hospital_id);
      console.log(`Ã°Å¸ÂÂ¥ Delete subscription filtrado para hospital: ${hospital_id}`);
    }

    const { error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/push/subscription - Remover subscription
app.delete('/api/push/subscription', async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint ÃƒÂ© obrigatÃƒÂ³rio' });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.error('Ã¢ÂÅ’ Erro ao remover subscription:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/push/send - Enviar notificaÃƒÂ§ÃƒÂ£o push
// Aceita tanto formato manual quanto formato do Supabase Database Webhook
app.post('/api/push/send', async (req, res) => {
  try {
    console.log('Ã°Å¸â€â€ POST /api/push/send');
    console.log('Ã°Å¸â€œÂ¦ Body recebido:', JSON.stringify(req.body, null, 2));
    
    let hospital_id, title, body, data, urgency;
    
    // Verificar se é formato do Supabase Webhook (tem "type" e "record")
    if (req.body.type && req.body.record) {
      // Formato Supabase Database Webhook
      const record = req.body.record;
      hospital_id = record.hospital_id;
      
      // ⭐ MAPA DE MOTIVOS ESPECÍFICOS COM COR OBRIGATÓRIA (igual ao frontend)
      const motivosEspecificos = {
        'ajuste de prescrição': 'branco',
        'liberar sne': 'verde',
        'acesso venoso': 'verde',
        'dor refratária': 'amarelo',
        'retenção urinária (bexigoma)': 'amarelo',
        'agitação psicomotora': 'amarelo',
        'dor aguda': 'laranja',
        'valor ou imagem de pânico': 'laranja',
        'hiper ou hipoglicemia': 'laranja',
        'anúrico nas últimas 6 horas': 'laranja',
        'óbito paliativo': 'laranja',
        'pcr': 'vermelho',
        'insuficiencia respiratória aguda': 'vermelho',
        'arritimia cardiáca': 'vermelho',
        'glasgow <= 10': 'vermelho',
        'convulsão': 'vermelho',
        'admissão': 'branco',
        'protocolo avc': 'vermelho',
        'protocolo dor torácica': 'vermelho',
        'protocolo sepse': 'vermelho',
      };
      
      const mews = parseInt(record.mews) || 0;
      const motivoEspecifico = (record.motivo_especifico || '').toLowerCase().trim();
      const motivo = record.motivo || '';
      
      // ⭐ LÓGICA CORRIGIDA: Mesma ordem de prioridade do frontend
      let cor = 'branco'; // default
      
      // 1. Primeiro: verificar motivo_especifico (tem prioridade máxima)
      if (motivoEspecifico && motivosEspecificos[motivoEspecifico]) {
        cor = motivosEspecificos[motivoEspecifico];
        console.log(`📋 Cor determinada por motivo_especifico: "${motivoEspecifico}" => ${cor.toUpperCase()}`);
      }
      // 2. Segundo: verificar tipo de motivo (Transporte Protocolo é vermelho)
      else if (motivo === 'Transporte Protocolo') {
        cor = 'vermelho';
        console.log('🚑 Cor determinada por Transporte Protocolo => VERMELHO');
      }
      else if (motivo === 'Transporte') {
        cor = 'verde';
        console.log('🚑 Cor determinada por Transporte => VERDE');
      }
      // 3. Terceiro: usar MEWS
      else {
        if (mews >= 6) cor = 'vermelho';
        else if (mews >= 4) cor = 'laranja';
        else if (mews === 3) cor = 'amarelo';
        else if (mews >= 1) cor = 'verde';
        else cor = 'branco';
        console.log(`📊 Cor determinada por MEWS ${mews} => ${cor.toUpperCase()}`);
      }
      
      const codigoCores = {
        'vermelho': 'CODIGO VERMELHO',
        'laranja': 'CODIGO LARANJA',
        'amarelo': 'CODIGO AMARELO',
        'verde': 'CODIGO VERDE',
        'branco': 'CODIGO BRANCO'
      };
      const codigo = codigoCores[cor] || 'SEM CODIGO';
      const isVermelho = cor === 'vermelho';
      const isLaranja = cor === 'laranja';
      
      title = (isVermelho || isLaranja) ? 'EMERGENCIA TRR' : 'Nova Solicitacao TRR';
      body = `${codigo} - ${record.paciente || 'N/A'} - Leito ${record.leito || 'N/A'} - MEWS: ${mews}${motivoEspecifico ? ' - ' + record.motivo_especifico : ''} | ${motivo || 'Nova solicitacao'}`;
      urgency = isVermelho ? 'high' : 'normal';
      data = {
        solicitacao_id: record.id,
        tipo: 'nova_solicitacao',
        table: req.body.table,
        classificacao: cor
      };
      console.log('✅ Formato Supabase Webhook detectado - ' + codigo);
    } else {
      // Formato manual
      hospital_id = req.body.hospital_id;
      title = req.body.title;
      body = req.body.body;
      urgency = req.body.urgency;
      data = req.body.data;
      console.log('Ã°Å¸â€œâ€¹ Formato manual detectado');
    }

    if (!webpush) {
      return res.status(503).json({ error: 'Web Push nÃƒÂ£o disponÃƒÂ­vel' });
    }

    if (!vapidConfigured) {
      return res.status(503).json({ error: 'VAPID nÃƒÂ£o configurado corretamente' });
    }

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL - OBRIGATÃƒâ€œRIO
    if (!hospital_id) {
      console.warn('Ã¢Å¡Â Ã¯Â¸Â hospital_id nÃƒÂ£o fornecido - notificaÃƒÂ§ÃƒÂ£o nÃƒÂ£o enviada por seguranÃƒÂ§a');
      return res.status(400).json({ 
        error: 'hospital_id ÃƒÂ© obrigatÃƒÂ³rio para enviar notificaÃƒÂ§ÃƒÂµes',
        message: 'Isolamento multi-tenant ativo'
      });
    }

    console.log(`Ã°Å¸ÂÂ¥ Filtrando notificaÃƒÂ§ÃƒÂµes para hospital: ${hospital_id}`);

    // Buscar subscriptions ativas do hospital (updated_at nos últimos 30 dias — exclui dispositivos deslogados)
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('hospital_id', hospital_id)
      .gte('updated_at', cutoff30d);

    if (error) {
      console.error('Ã¢ÂÅ’ Erro ao buscar subscriptions:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`Ã°Å¸â€œÂ¤ Hospital ${hospital_id}: Enviando para ${subscriptions?.length || 0} dispositivos`);

    // Se nÃƒÂ£o houver subscriptions para este hospital, retornar sucesso (nÃƒÂ£o ÃƒÂ© erro)
    if (!subscriptions || subscriptions.length === 0) {
      console.log(`Ã¢â€žÂ¹Ã¯Â¸Â Nenhum dispositivo registrado para o hospital ${hospital_id}`);
      return res.json({ sent: 0, failed: 0, errors: [], message: 'Nenhum dispositivo registrado para este hospital' });
    }

    const payload = JSON.stringify({
      title: title || 'VITAL - Nova Notificacao',
      body: body || 'Voce tem uma nova atualizacao',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: data || {},
      tag: urgency === 'high' ? 'urgent' : 'normal',
      requireInteraction: urgency === 'high'
    });

    const results = { sent: 0, failed: 0, errors: [] };

    for (const sub of subscriptions || []) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        await webpush.sendNotification(pushSubscription, payload);
        results.sent++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
        
        // Se subscription expirou (410 Gone), remover do banco
        if (err.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
      }
    }

    console.log(`Ã¢Å“â€¦ Enviadas: ${results.sent}, Falhas: ${results.failed}`);
    res.json(results);
  } catch (error) {
    console.error('Ã°Å¸â€™Â¥ Erro ao enviar push:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/push/status - Status do Web Push
app.get('/api/push/status', (req, res) => {
  res.json({
    enabled: !!webpush && vapidConfigured,
    vapidConfigured: vapidConfigured,
    webPushLoaded: !!webpush,
    publicKey: VAPID_PUBLIC_KEY ? VAPID_PUBLIC_KEY.replace(/=+$/, '') : null,
    timestamp: new Date().toISOString()
  });
});
// GET /api/push/subscriptions - Listar subscriptions (debug)
app.get('/api/push/subscriptions', async (req, res) => {
  try {
    const { hospital_id } = req.query;

    let query = supabase
      .from('push_subscriptions')
      .select('id, endpoint, hospital_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    // Ã¢Å¡Â Ã¯Â¸Â ISOLAMENTO POR HOSPITAL - Filtrar se hospital_id fornecido
    if (hospital_id) {
      query = query.eq('hospital_id', hospital_id);
      console.log(`Ã°Å¸ÂÂ¥ Listando subscriptions do hospital: ${hospital_id}`);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Identificar tipo de dispositivo pelo endpoint
    const subscriptions = (data || []).map(sub => ({
      ...sub,
      device: sub.endpoint.includes('fcm.googleapis.com') ? 'Android/Chrome' :
              sub.endpoint.includes('push.apple.com') ? 'iOS/Safari' :
              sub.endpoint.includes('mozilla.com') ? 'Firefox' :
              sub.endpoint.includes('windows.com') ? 'Windows/Edge' : 'Outro'
    }));

    res.json({ count: subscriptions.length, subscriptions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// FIM WEB PUSH
// ============================================


// GET /api/notifications/status - Status do job de notificacoes
app.get('/api/notifications/status', (req, res) => {
  const status = scheduledNotifications.getStatus ? scheduledNotifications.getStatus() : { running: true };
  res.json({
    ...status,
    version: '3.1.0-notifications',
    timestamp: new Date().toISOString()
  });
});

// Montar rotas de notificacoes agendadas
app.use('/api/scheduled-notifications', scheduledNotifications.router);

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('Ã°Å¸â€™Â¥ Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// Middleware 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota nÃƒÂ£o encontrada',
    path: req.path,
    method: req.method
  });
});

// ExecuÃƒÂ§ÃƒÂ£o local
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Ã°Å¸Å¡â‚¬ VITAL API na porta ${PORT}`);
  });
}


// Importar e iniciar job de notificacoes agendadas
scheduledNotifications.iniciarJobAutomatico(supabase, webpush);

module.exports = app;





