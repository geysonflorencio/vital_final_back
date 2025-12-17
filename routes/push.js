// routes/push.js
// Rotas para Web Push Notifications - Sistema VITAL
const express = require('express');
const webpush = require('web-push');
const { supabase } = require('../config/database');

const router = express.Router();

// Configurar VAPID
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:suporte@appvital.com.br';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('✅ Web Push VAPID configurado com sucesso');
} else {
  console.warn('⚠️ VAPID keys não configuradas - Web Push desabilitado');
}

// POST /api/push/subscription - Registrar subscription de um dispositivo
router.post('/subscription', async (req, res) => {
  try {
    const { user_id, hospital_id, subscription } = req.body;

    if (!user_id || !hospital_id || !subscription) {
      return res.status(400).json({ 
        error: 'user_id, hospital_id e subscription são obrigatórios' 
      });
    }

    console.log('🔔 Registrando push subscription', { user_id, hospital_id });

    // Upsert na tabela push_subscriptions
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id,
        hospital_id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,endpoint'
      });

    if (error) {
      console.error('❌ Erro ao salvar subscription', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Subscription salva com sucesso');
    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erro em POST /push/subscription', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/push/subscription - Remover subscription
router.delete('/subscription', async (req, res) => {
  try {
    const { user_id, endpoint } = req.body;

    if (!user_id || !endpoint) {
      return res.status(400).json({ 
        error: 'user_id e endpoint são obrigatórios' 
      });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user_id)
      .eq('endpoint', endpoint);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erro em DELETE /push/subscription', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/push/send - Enviar notificação push (chamado pelo webhook do Supabase)
router.post('/send', async (req, res) => {
  try {
    const { 
      hospital_id, 
      title, 
      body, 
      url = '/', 
      exclude_user_id,
      data = {}
    } = req.body;

    if (!hospital_id) {
      return res.status(400).json({ error: 'hospital_id é obrigatório' });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(503).json({ error: 'Web Push não configurado' });
    }

    console.log('📤 Enviando push notifications', { hospital_id, title });

    // Buscar todas as subscriptions do hospital
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('hospital_id', hospital_id);

    if (error) {
      console.error('❌ Erro ao buscar subscriptions', error.message);
      return res.status(500).json({ error: error.message });
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('ℹ️ Nenhuma subscription encontrada para o hospital');
      return res.json({ success: true, sent: 0, message: 'Sem subscriptions' });
    }

    // Preparar payload da notificação
    const payload = JSON.stringify({
      title: title || '🚨 TRR URGENTE!',
      body: body || 'Nova solicitação de TRR',
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      url: url,
      vibrate: [500, 200, 500, 200, 1000],
      requireInteraction: true,
      tag: `trr-${Date.now()}`,
      data: data
    });

    // Filtrar e enviar para cada subscription
    const results = await Promise.all(
      subscriptions
        .filter(sub => !exclude_user_id || sub.user_id !== exclude_user_id)
        .map(async (sub) => {
          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            }, payload);
            
            return { endpoint: sub.endpoint, success: true };
          } catch (err) {
            console.warn('⚠️ Erro ao enviar push', { 
              endpoint: sub.endpoint, 
              statusCode: err.statusCode,
              error: err.message 
            });
            
            // Se subscription expirou (410 Gone), remove do banco
            if (err.statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', sub.endpoint);
              console.log('🗑️ Subscription expirada removida', sub.endpoint);
            }
            
            return { endpoint: sub.endpoint, success: false, error: err.message };
          }
        })
    );

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('📊 Push notifications enviadas', { sent, failed, total: subscriptions.length });

    res.json({ 
      success: true, 
      sent, 
      failed,
      total: subscriptions.length,
      results 
    });

  } catch (error) {
    console.error('❌ Erro em POST /push/send', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/push/status - Verificar status do Web Push
router.get('/status', (req, res) => {
  res.json({
    enabled: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    vapidConfigured: !!VAPID_PUBLIC_KEY,
    publicKey: VAPID_PUBLIC_KEY || null
  });
});

module.exports = router;
