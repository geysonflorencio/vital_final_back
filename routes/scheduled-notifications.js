// routes/scheduled-notifications.js
// Rota para processar notificacoes agendadas de reavaliacao

const express = require('express');
const router = express.Router();
let webpush = null;

// Configuracao do Web Push (carregar dinamicamente)
try {
  webpush = require('web-push');

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    // Limpar chaves
    const cleanPublic = vapidPublicKey.replace(/[\s\r\n=]+/g, '').trim();
    const cleanPrivate = vapidPrivateKey.replace(/[\s\r\n=]+/g, '').trim();
    
    webpush.setVapidDetails(
      'mailto:suporte@appvital.com.br',
      cleanPublic,
      cleanPrivate
    );
    console.log('[scheduled-notifications] Web Push configurado');
  } else {
    console.log('[scheduled-notifications] VAPID keys nao configuradas');
  }
} catch (error) {
  console.log('[scheduled-notifications] web-push nao disponivel:', error.message);
}

// Funcao para processar notificacoes pendentes
async function processarNotificacoesPendentes(supabase) {
  try {
    console.log('[scheduled-notifications] Verificando notificacoes agendadas...');

    // Buscar notificacoes pendentes SEM JOIN (mais simples e confiavel)
    const { data: notificacoes, error } = await supabase
      .from('notificacoes_agendadas')
      .select('*')
      .lte('data_agendada', new Date().toISOString())
      .eq('enviada', false)
      .limit(50);

    if (error) {
      console.error('[scheduled-notifications] Erro ao buscar:', error.message);
      return { processadas: 0, erro: error.message };
    }

    if (!notificacoes || notificacoes.length === 0) {
      console.log('[scheduled-notifications] Nenhuma notificacao pendente');
      return { processadas: 0 };
    }

    console.log('[scheduled-notifications] ' + notificacoes.length + ' notificacoes para processar');

    let enviadas = 0;
    let erros = 0;

    for (const notif of notificacoes) {
      try {
        const hospitalId = notif.hospital_id;

        if (!hospitalId) {
          console.log('[scheduled-notifications] Notificacao sem hospital_id:', notif.id);
          await supabase
            .from('notificacoes_agendadas')
            .update({ enviada: true, erro: 'Sem hospital_id' })
            .eq('id', notif.id);
          continue;
        }

        // Buscar subscriptions do hospital (SEM filtro de ativo)
        const { data: subscriptions, error: subError } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('hospital_id', hospitalId);

        if (subError) {
          console.error('[scheduled-notifications] Erro ao buscar subscriptions:', subError.message);
          erros++;
          continue;
        }

        if (subscriptions && subscriptions.length > 0 && webpush) {
          console.log('[scheduled-notifications] Enviando para ' + subscriptions.length + ' dispositivos');
          
          // Usar titulo e mensagem da notificacao agendada
          const payload = JSON.stringify({
            title: notif.titulo || 'Tempo de Reavaliacao Expirou!',
            body: notif.mensagem || 'Paciente precisa de atencao!',
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            tag: 'reavaliacao-' + notif.solicitacao_id,
            data: {
              tipo: 'reavaliacao_expirada',
              solicitacao_id: notif.solicitacao_id,
              url: '/'
            }
          });

          let enviouAlgum = false;
          for (const sub of subscriptions) {
            try {
              await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              }, payload);
              enviouAlgum = true;
              console.log('[scheduled-notifications] Push enviado para:', sub.id);
            } catch (pushError) {
              console.error('[scheduled-notifications] Erro push:', pushError.message);
              // Remover subscription invalida
              if (pushError.statusCode === 410 || pushError.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              }
            }
          }

          if (enviouAlgum) {
            enviadas++;
          }
        } else {
          console.log('[scheduled-notifications] Nenhuma subscription ou webpush indisponivel');
        }

        // Marcar como enviada (mesmo se nao tinha subscriptions)
        await supabase
          .from('notificacoes_agendadas')
          .update({ enviada: true, data_envio: new Date().toISOString() })
          .eq('id', notif.id);

      } catch (err) {
        console.error('[scheduled-notifications] Erro ao processar:', err.message);
        erros++;
      }
    }

    console.log('[scheduled-notifications] Resultado: ' + enviadas + ' enviadas, ' + erros + ' erros');
    return { processadas: enviadas, erros };

  } catch (error) {
    console.error('[scheduled-notifications] Erro geral:', error.message);
    return { processadas: 0, erro: error.message };
  }
}

// Rota manual para processar (util para testes)
router.post('/processar', async (req, res) => {
  const supabase = req.app.get('supabase');
  const resultado = await processarNotificacoesPendentes(supabase);
  res.json({ success: true, ...resultado });
});

// Status das notificacoes agendadas
router.get('/status', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    const { data: pendentes } = await supabase
      .from('notificacoes_agendadas')
      .select('id')
      .eq('enviada', false);

    const { data: enviadas } = await supabase
      .from('notificacoes_agendadas')
      .select('id')
      .eq('enviada', true);

    res.json({
      success: true,
      pendentes: pendentes?.length || 0,
      enviadas: enviadas?.length || 0,
      webpush_disponivel: !!webpush,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar job automatico de verificacao
let jobInterval = null;
let supabaseInstance = null;

function iniciarJobAutomatico(supabase, webpushInstance) {
  supabaseInstance = supabase;
  
  console.log('[scheduled-notifications] Job iniciado (intervalo: 1 minuto)');
  
  // Executar imediatamente
  processarNotificacoesPendentes(supabase).catch(err => {
    console.error('[scheduled-notifications] Erro na execucao inicial:', err.message);
  });
  
  // Configurar intervalo (a cada 1 minuto)
  jobInterval = setInterval(() => {
    processarNotificacoesPendentes(supabase).catch(err => {
      console.error('[scheduled-notifications] Erro no job:', err.message);
    });
  }, 60000);
  
  return { started: true };
}

function getStatus() {
  return {
    jobRunning: !!jobInterval,
    supabaseConnected: !!supabaseInstance
  };
}

module.exports = { router, processarNotificacoesPendentes, iniciarJobAutomatico, getStatus };
