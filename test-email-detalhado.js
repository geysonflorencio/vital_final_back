// 🧪 Teste Específico de Email com Logs Detalhados
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://aeysoqtbencykavivgoe.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleXNvcXRiZW5jeWthdml2Z29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTE4MTY1OSwiZXhwIjoyMDY0NzU3NjU5fQ.g64X3iebdB_TY_FWd6AI8mlej4uKMrKiFLG11z6hZlQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testarEnvioEmail() {
  console.log('🧪 TESTE DE ENVIO DE EMAIL - DIAGNÓSTICO COMPLETO');
  console.log('=' * 60);
  
  // Use um email real para teste
  const emailTeste = 'teste.convite@exemplo.com'; // ALTERE para seu email real
  const nomeTeste = 'Usuário Teste Email';
  
  try {
    console.log('\n1️⃣ CRIANDO USUÁRIO...');
    console.log(`📧 Email: ${emailTeste}`);
    console.log(`👤 Nome: ${nomeTeste}`);
    
    // 1. Criar usuário
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: emailTeste,
      email_confirm: false,
      user_metadata: {
        nome_completo: nomeTeste,
        role: 'medico'
      }
    });

    if (authError) {
      console.error('❌ ERRO ao criar usuário:', authError);
      return;
    }

    console.log('✅ Usuário criado:', authUser.user.id);
    
    console.log('\n2️⃣ ENVIANDO EMAIL DE CONVITE...');
    
    // 2. Enviar convite
    const redirectUrl = 'https://www.appvital.com.br/definir-senha';
    console.log(`🔗 Redirect URL: ${redirectUrl}`);
    
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(emailTeste, {
      redirectTo: redirectUrl,
      data: {
        nome_completo: nomeTeste,
        role: 'medico',
        user_id: authUser.user.id
      }
    });

    if (inviteError) {
      console.error('\n❌ ERRO NO ENVIO DE EMAIL:');
      console.error('🔴 Código:', inviteError.code);
      console.error('🔴 Mensagem:', inviteError.message);
      console.error('🔴 Detalhes:', JSON.stringify(inviteError, null, 2));
      
      // Verificar possíveis causas
      console.log('\n🔍 POSSÍVEIS CAUSAS:');
      console.log('1. Template de email usando {{ .SiteURL }} ao invés de {{ .RedirectTo }}');
      console.log('2. URLs de redirecionamento não configuradas no Supabase');
      console.log('3. SMTP não configurado no Supabase');
      console.log('4. Limites de rate do Supabase atingidos');
      
    } else {
      console.log('\n✅ EMAIL ENVIADO COM SUCESSO!');
      console.log('📬 Dados do envio:', JSON.stringify(inviteData, null, 2));
      console.log('\n📧 VERIFICAR:');
      console.log(`1. Caixa de entrada: ${emailTeste}`);
      console.log('2. Pasta de spam/lixo eletrônico');
      console.log('3. Remetente: noreply@mail.supabase.io');
    }
    
    console.log('\n3️⃣ LIMPEZA - REMOVENDO USUÁRIO DE TESTE...');
    
    // 3. Limpar usuário de teste
    await supabase.auth.admin.deleteUser(authUser.user.id);
    console.log('🗑️ Usuário de teste removido');
    
  } catch (error) {
    console.error('\n💥 ERRO GERAL:', error);
  }
  
  console.log('\n📋 CONFIGURAÇÕES NECESSÁRIAS NO SUPABASE:');
  console.log('=' * 60);
  console.log('🔧 Dashboard > Authentication > URL Configuration:');
  console.log('   Site URL: https://www.appvital.com.br');
  console.log('   Redirect URLs: https://www.appvital.com.br/**');
  console.log('');
  console.log('📧 Dashboard > Authentication > Email Templates:');
  console.log('   Alterar "Invite user" template:');
  console.log('   {{ .SiteURL }} → {{ .RedirectTo }}');
  console.log('');
  console.log('⚙️ Dashboard > Settings > Auth > SMTP Settings:');
  console.log('   Configurar provedor de email (se necessário)');
}

// Executar teste
testarEnvioEmail()
  .then(() => {
    console.log('\n🎉 Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro no teste:', error);
    process.exit(1);
  });
