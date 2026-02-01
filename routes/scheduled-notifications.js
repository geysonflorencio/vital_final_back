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
    webpush.setVapidDetails(
      'mailto:suporte@appvital.com.br',
      vapidPublicKey,
      vapidPrivateKey
    );
    console.log('Web Push configurado com sucesso');
  } else {
    console.log('VAPID keys nao configuradas - push notifications desabilitadas');
  }
} catch (error) {
  console.log('web-push nao disponivel:', error.message);
}

// Funcao para processar notificacoes pendentes
async function processarNotificacoesPendentes(supabase) {
  try {
    console.log('Verificando notificacoes agendadas...');
    
    // Buscar notificacoes que devem ser enviadas (horario <= agora e nao enviadas)
    const { data: notificacoes, error } = await supabase
      .from('notificacoes_agendadas')
      .select('*, solicitacoes!inner(id, paciente, leito, setor, hospital_id, status)')
      .lte('data_agendada', new Date().toISOString())
      .eq('enviada', false)
      .limit(50);

    if (error) {
      // Tentar com solicitacoes_trr se solicitacoes falhar
      console.log('Tentando com solicitacoes_trr...');
      const { data: notificacoes2, error: error2 } = await supabase
        .from('notificacoes_agendadas')
        .select('*, solicitacoes_trr!inner(id, paciente_nome, setor_solicitante, hospital_id, status)')
        .lte('data_agendada', new Date().toISOString())
        .eq('enviada', false)
        .limit(50);
      
      if (error2) {
        console.error('Erro ao buscar notificacoes:', error2);
        return { processadas: 0, erro: error2.message };
      }
      
      // Usar notificacoes2
      if (!notificacoes2 || notificacoes2.length === 0) {
        console.log('Nenhuma notificacao pendente');
        return { processadas: 0 };
      }
      
      return processarLista(notificacoes2, supabase, 'solicitacoes_trr');
    }

    if (!notificacoes || notificacoes.length === 0) {
      console.log('Nenhuma notificacao pendente');
      return { processadas: 0 };
    }

    return processarLista(notificacoes, supabase, 'solicitacoes');

  } catch (error) {
    console.error('Erro geral ao processar notificacoes:', error);
    return { processadas: 0, erro: error.message };
  }
}

async function processarLista(notificacoes, supabase, tabela) {
  console.log(notificacoes.length + ' notificacoes para processar');

  let enviadas = 0;
  let erros = 0;
  
  const solicitacaoKey = tabela === 'solicitacoes_trr' ? 'solicitacoes_trr' : 'solicitacoes';

  for (const notif of notificacoes) {
    try {
      const solicitacao = notif[solicitacaoKey];
      
      // Verificar se a solicitacao ainda esta em reavaliacao
      if (solicitacao?.status !== 'em_reavaliacao') {
        console.log('Solicitacao ' + notif.solicitacao_id + ' nao esta mais em reavaliacao');
        
        await supabase
          .from('notificacoes_agendadas')
          .update({ enviada: true, erro: 'Status nao e mais em_reavaliacao' })
          .eq('id', notif.id);
        
        continue;
      }

      const hospitalId = notif.hospital_id || solicitacao?.hospital_id;
      
      // Buscar subscriptions do hospital
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('hospital_id', hospitalId)
        .eq('ativo', true);

      if (subscriptions && subscriptions.length > 0 && webpush) {
        const pacienteNome = solicitacao?.paciente || solicitacao?.paciente_nome || 'Paciente';
        const setor = solicitacao?.setor || solicitacao?.setor_solicitante || '';
        
        // Montar payload da notificacao
        const payload = JSON.stringify({
          title: notif.titulo || 'Tempo de Reavaliacao Expirou!',
          body: notif.corpo || ('Paciente: ' + pacienteNome + ' - ' + setor),
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          tag: 'reavaliacao-' + notif.solicitacao_id,
          data: {
            tipo: 'reavaliacao_expirada',
            solicitacao_id: notif.solicitacao_id,
            url: '/solicitacoes'
          },
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200]
        });

        // Enviar para todas as subscriptions
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, payload);
            console.log('Push enviado para subscription ' + sub.id);
          } catch (pushError) {
            console.error('Erro ao enviar push:', pushError.message);
            if (pushError.statusCode === 410 || pushError.statusCode === 404) {
              await supabase.from('push_subscriptions').update({ ativo: false }).eq('id', sub.id);
            }
          }
        }
      } else {
        console.log('Nenhuma subscription para hospital ' + hospitalId + ' ou webpush indisponivel');
      }

      // Marcar como enviada
      await supabase
        .from('notificacoes_agendadas')
        .update({ enviada: true, enviada_em: new Date().toISOString() })
        .eq('id', notif.id);

      enviadas++;
    } catch (err) {
      console.error('Erro ao processar notificacao ' + notif.id + ':', err);
      erros++;
    }
  }

  console.log('Resultado: ' + enviadas + ' enviadas, ' + erros + ' erros');
  return { processadas: enviadas, erros };
}

// Rota manual para processar (util para testes)
router.post('/processar', async (req, res) => {
  const resultado = await processarNotificacoesPendentes(req.app.get('supabase'));
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

module.exports = { router, processarNotificacoesPendentes };
