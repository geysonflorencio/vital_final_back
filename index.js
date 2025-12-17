// index.js - VITAL Backend (VERSÃO CORRIGIDA)
// Carregar .env apenas em desenvolvimento, sem sobrescrever variáveis do sistema
require('dotenv').config({ override: false });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { getPasswordRedirectURL, logURLConfiguration } = require('./utils/urlUtils');

// Importar web-push de forma segura
let webpush = null;
try {
  webpush = require('web-push');
  console.log('✅ web-push carregado com sucesso');
} catch (e) {
  console.warn('⚠️ web-push não instalado - Web Push desabilitado');
}

const app = express();

// CORS - Configuração simplificada e funcional
app.use(cors({
  origin: [
    'https://appvital.com.br',
    'https://www.appvital.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://vital-deploy.vercel.app',
    'https://vital-final.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://aeysoqtbencykavivgoe.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleXNvcXRiZW5jeWthdml2Z29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTE4MTY1OSwiZXhwIjoyMDY0NzU3NjU5fQ.g64X3iebdB_TY_FWd6AI8mlej4uKMrKiFLG11z6hZlQ';

console.log('🔧 Inicializando Supabase...', { url: supabaseUrl });
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Log da configuração de URLs
logURLConfiguration();

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'VITAL API - Backend Funcional',
    status: 'online',
    version: '3.0.0-direct',
    timestamp: new Date().toISOString()
  });
});

// ROTA DELETE EXCLUIR USUÁRIO - IMPLEMENTAÇÃO DIRETA
app.delete('/api/excluir-usuario', async (req, res) => {
  try {
    console.log('🗑️ DELETE /api/excluir-usuario chamado');
    console.log('Body recebido:', req.body);

    const { user_id, id, userId } = req.body;
    const userIdToDelete = user_id || id || userId;

    if (!userIdToDelete) {
      return res.status(400).json({
        error: 'ID do usuário é obrigatório',
        expected: 'user_id, id ou userId no body da requisição'
      });
    }

    console.log(`🎯 Excluindo usuário: ${userIdToDelete}`);

    // 1. Deletar referências na tabela user_hospitals
    const { error: userHospitalError } = await supabase
      .from('user_hospitals')
      .delete()
      .eq('user_id', userIdToDelete);

    if (userHospitalError) {
      console.warn('⚠️ Erro ao deletar user_hospitals:', userHospitalError);
    }

    // 2. Deletar solicitações relacionadas
    const { error: solicitacoesError } = await supabase
      .from('solicitacoes')
      .delete()
      .eq('user_id', userIdToDelete);

    if (solicitacoesError) {
      console.warn('⚠️ Erro ao deletar solicitações:', solicitacoesError);
    }

    // 3. Deletar perfil do usuário
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userIdToDelete);

    if (profileError) {
      console.error('❌ Erro ao deletar perfil:', profileError);
      return res.status(500).json({
        error: 'Erro ao deletar perfil do usuário',
        details: profileError.message
      });
    }

    // 4. Deletar da autenticação do Supabase
    const { error: authError } = await supabase.auth.admin.deleteUser(userIdToDelete);
    
    if (authError) {
      console.warn('⚠️ Erro ao deletar da auth (perfil já foi removido):', authError.message);
    }

    console.log('✅ Usuário excluído com sucesso:', userIdToDelete);

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso',
      user_id: userIdToDelete,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Erro ao excluir usuário:', error);
    res.status(500).json({
      error: 'Erro interno ao excluir usuário',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST CADASTRAR USUÁRIO - IMPLEMENTAÇÃO DIRETA
app.post('/api/cadastrar-usuario', async (req, res) => {
  try {
    console.log('👤 POST /api/cadastrar-usuario chamado');
    console.log('Body recebido:', req.body);

    const { nome, email, role, hospital_id } = req.body;

    // Validação básica
    if (!nome || !email || !role) {
      return res.status(400).json({
        error: 'Nome, email e role são obrigatórios',
        required: ['nome', 'email', 'role'],
        optional: ['hospital_id']
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Email inválido',
        email: email
      });
    }

    console.log(`👥 Criando usuário: ${nome} (${email}) - Role: ${role}`);

    // 1. Criar usuário na autenticação do Supabase com email de convite
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: false, // Não confirmar automaticamente para forçar definição de senha
      user_metadata: {
        nome_completo: nome,
        role: role
      }
    });

    if (authError) {
      console.error('❌ Erro ao criar usuário na auth:', authError);
      return res.status(400).json({
        error: 'Erro ao criar usuário: ' + authError.message
      });
    }

    console.log('✅ Usuário criado na auth:', authUser.user.id);

    // 2. Enviar email de convite para definir senha
    console.log('📧 Tentando enviar email de convite...');
    const redirectURL = getPasswordRedirectURL();
    console.log('🔗 URL de redirecionamento:', redirectURL);
    
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectURL,
      data: {
        nome_completo: nome,
        role: role,
        user_id: authUser.user.id
      }
    });

    if (inviteError) {
      console.error('❌ ERRO ao enviar email de convite:', inviteError);
      console.error('📧 Detalhes do erro:', {
        code: inviteError.code,
        message: inviteError.message,
        details: inviteError.details || 'Sem detalhes adicionais'
      });
      // Não falhar a criação por causa do email, apenas avisar
    } else {
      console.log('✅ Email de convite enviado com sucesso para:', email);
      console.log('📬 Dados do envio:', inviteData);
    }

    // 2. Criar perfil do usuário na tabela profiles
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
      console.error('❌ Erro ao criar perfil:', profileError);
      // Tentar remover o usuário da auth se o perfil falhar
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({
        error: 'Erro ao criar perfil do usuário',
        details: profileError.message
      });
    }

    console.log('✅ Perfil criado:', profile.id);

    // 3. Criar vínculo com hospital se fornecido
    if (hospital_id) {
      const { error: hospitalError } = await supabase
        .from('user_hospitals')
        .insert({
          user_id: authUser.user.id,
          hospital_id: hospital_id,
          role: role, // Incluindo o role que é obrigatório na tabela
          ativo: true
        });

      if (hospitalError) {
        console.warn('⚠️ Erro ao vincular hospital:', hospitalError);
      } else {
        console.log('✅ Usuário vinculado ao hospital:', hospital_id);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso! Email de convite enviado.',
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
    console.error('💥 Erro ao cadastrar usuário:', error);
    res.status(500).json({
      error: 'Erro interno ao cadastrar usuário',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST DEFINIR SENHA MANUAL - SOLUÇÃO PARA PROBLEMAS DE EMAIL
app.post('/api/definir-senha-manual', async (req, res) => {
  try {
    console.log('🔐 POST /api/definir-senha-manual chamado');
    console.log('Body recebido:', req.body);

    const { user_id, email, senha } = req.body;

    // Validação básica
    if (!user_id || !senha) {
      return res.status(400).json({
        error: 'user_id e senha são obrigatórios',
        required: ['user_id', 'senha']
      });
    }

    // Validar senha (mínimo 6 caracteres)
    if (senha.length < 6) {
      return res.status(400).json({
        error: 'Senha deve ter pelo menos 6 caracteres'
      });
    }

    console.log(`🔐 Definindo senha manual para usuário: ${user_id}`);

    // 1. Atualizar senha no Supabase Auth
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(user_id, {
      password: senha,
      email_confirm: true // Confirmar email automaticamente
    });

    if (updateError) {
      console.error('❌ Erro ao atualizar senha:', updateError);
      return res.status(400).json({
        error: 'Erro ao definir senha: ' + updateError.message
      });
    }

    console.log('✅ Senha definida com sucesso:', user_id);

    res.json({
      success: true,
      message: 'Senha definida com sucesso! Usuário pode fazer login.',
      user_id: user_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Erro ao definir senha manual:', error);
    res.status(500).json({
      error: 'Erro interno ao definir senha',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROTA POST DEFINIR SENHA INICIAL - IMPLEMENTAÇÃO DIRETA
app.post('/api/definir-senha-inicial', async (req, res) => {
  try {
    console.log('🔑 POST /api/definir-senha-inicial chamado');
    console.log('Body recebido:', req.body);

    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email e senha são obrigatórios',
        required: ['email', 'password']
      });
    }

    // Validar senha mínima
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Senha deve ter pelo menos 6 caracteres',
        received_length: password.length
      });
    }

    console.log(`🔑 Definindo senha para: ${email}`);

    // 1. Buscar usuário no Supabase Auth por email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Erro ao listar usuários:', listError);
      return res.status(500).json({
        error: 'Erro ao buscar usuário',
        details: listError.message
      });
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error('❌ Usuário não encontrado:', email);
      return res.status(404).json({
        error: 'Usuário não encontrado',
        email: email
      });
    }

    console.log('👤 Usuário encontrado:', user.id);

    // 2. Atualizar senha do usuário
    const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { 
        password: password,
        email_confirm: true  // Confirmar email automaticamente
      }
    );

    if (updateError) {
      console.error('❌ Erro ao atualizar senha:', updateError);
      return res.status(500).json({
        error: 'Erro ao definir senha',
        details: updateError.message
      });
    }

    console.log('✅ Senha definida com sucesso para:', email);

    res.json({
      success: true,
      message: 'Senha definida com sucesso',
      user_id: user.id,
      email: email,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Erro ao definir senha inicial:', error);
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
    // Limpar chaves - remover espaços, quebras de linha e "="
    const cleanPublicKey = VAPID_PUBLIC_KEY.replace(/[\s\r\n=]+/g, '').trim();
    const cleanPrivateKey = VAPID_PRIVATE_KEY.replace(/[\s\r\n=]+/g, '').trim();
    
    webpush.setVapidDetails(VAPID_SUBJECT, cleanPublicKey, cleanPrivateKey);
    vapidConfigured = true;
    console.log('✅ Web Push VAPID configurado com sucesso');
  } catch (vapidError) {
    console.error('❌ Erro ao configurar VAPID:', vapidError.message);
  }
} else {
  console.warn('⚠️ VAPID keys não configuradas ou web-push não instalado');
}

// POST /api/push/subscription - Registrar subscription
app.post('/api/push/subscription', async (req, res) => {
  try {
    console.log('📱 POST /api/push/subscription');
    const { subscription, user_id, hospital_id, device_info } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription inválida' });
    }

    // Salvar no Supabase
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user_id || null,
        hospital_id: hospital_id || null,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || null,
        auth: subscription.keys?.auth || null,
        device_info: device_info || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'endpoint'
      })
      .select();

    if (error) {
      console.error('❌ Erro ao salvar subscription:', error);
      return res.status(500).json({ error: 'Erro ao salvar subscription', details: error.message });
    }

    console.log('✅ Subscription salva:', data?.[0]?.id);
    res.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error('💥 Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/push/subscription - Remover subscription
app.delete('/api/push/subscription', async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint é obrigatório' });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.error('❌ Erro ao remover subscription:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/push/send - Enviar notificação push
// Aceita tanto formato manual quanto formato do Supabase Database Webhook
app.post('/api/push/send', async (req, res) => {
  try {
    console.log('🔔 POST /api/push/send');
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));
    
    let hospital_id, title, body, data, urgency;
    
    // Verificar se é formato do Supabase Webhook (tem "type" e "record")
    if (req.body.type && req.body.record) {
      // Formato Supabase Database Webhook
      const record = req.body.record;
      hospital_id = record.hospital_id;
      title = '🚨 Nova Solicitação TRR';
      body = `Paciente: ${record.paciente || 'N/A'} - ${record.motivo || 'Nova solicitação'}`;
      urgency = 'high';
      data = {
        solicitacao_id: record.id,
        tipo: 'nova_solicitacao',
        table: req.body.table
      };
      console.log('📋 Formato Supabase Webhook detectado');
    } else {
      // Formato manual
      hospital_id = req.body.hospital_id;
      title = req.body.title;
      body = req.body.body;
      urgency = req.body.urgency;
      data = req.body.data;
      console.log('📋 Formato manual detectado');
    }

    if (!webpush) {
      return res.status(503).json({ error: 'Web Push não disponível' });
    }

    if (!vapidConfigured) {
      return res.status(503).json({ error: 'VAPID não configurado corretamente' });
    }

    // Buscar todas as subscriptions do hospital
    let query = supabase
      .from('push_subscriptions')
      .select('*');

    if (hospital_id && hospital_id !== 'test') {
      query = query.eq('hospital_id', hospital_id);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar subscriptions:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`📤 Enviando para ${subscriptions?.length || 0} dispositivos`);

    const payload = JSON.stringify({
      title: title || 'VITAL - Nova Notificação',
      body: body || 'Você tem uma nova atualização',
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

    console.log(`✅ Enviadas: ${results.sent}, Falhas: ${results.failed}`);
    res.json(results);
  } catch (error) {
    console.error('💥 Erro ao enviar push:', error);
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
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, hospital_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

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

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('💥 Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// Middleware 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Execução local
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 VITAL API na porta ${PORT}`);
  });
}

module.exports = app;
