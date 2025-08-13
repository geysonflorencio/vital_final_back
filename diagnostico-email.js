// 🧪 Diagnóstico Rápido - Por que email não chegou
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://aeysoqtbencykavivgoe.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleXNvcXRiZW5jeWthdml2Z29lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTE4MTY1OSwiZXhwIjoyMDY0NzU3NjU5fQ.g64X3iebdB_TY_FWd6AI8mlej4uKMrKiFLG11z6hZlQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnosticarEmailProblema() {
  console.log('🔍 DIAGNÓSTICO: Por que o email não chegou');
  console.log('=' * 50);
  
  // TESTE 1: Verificar se API está funcionando
  console.log('\n1️⃣ TESTANDO API DE CONVITE...');
  
  const emailTeste = 'teste.diagnostico@example.com';
  
  try {
    // Criar usuário temporário
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: emailTeste,
      email_confirm: false
    });
    
    if (userError) {
      console.error('❌ Erro ao criar usuário:', userError.message);
      return;
    }
    
    console.log('✅ Usuário temporário criado');
    
    // Tentar enviar convite
    const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(emailTeste, {
      redirectTo: 'https://www.appvital.com.br/definir-senha'
    });
    
    if (inviteError) {
      console.error('❌ ERRO NO CONVITE:');
      console.error('   Código:', inviteError.code);
      console.error('   Mensagem:', inviteError.message);
      
      // Diagnosticar possíveis causas
      if (inviteError.message.includes('template')) {
        console.log('\n🎯 CAUSA PROVÁVEL: Problema no template de email');
        console.log('   ↳ Template usando {{ .SiteURL }} ao invés de {{ .RedirectTo }}');
      }
      
      if (inviteError.message.includes('SMTP')) {
        console.log('\n🎯 CAUSA PROVÁVEL: SMTP não configurado');
        console.log('   ↳ Supabase precisa de configuração SMTP personalizada');
      }
      
      if (inviteError.code === 'email_rate_limit_exceeded') {
        console.log('\n🎯 CAUSA PROVÁVEL: Rate limit atingido');
        console.log('   ↳ Muitos emails enviados recentemente');
      }
      
    } else {
      console.log('✅ API de convite funcionando!');
      console.log('📧 Email deveria ter sido enviado');
      
      console.log('\n🔍 POSSÍVEIS CAUSAS DO EMAIL NÃO CHEGAR:');
      console.log('1. Template de email com {{ .SiteURL }} ao invés de {{ .RedirectTo }}');
      console.log('2. Email caindo no spam');
      console.log('3. SMTP do Supabase com limitações');
      console.log('4. Provedor de email bloqueando emails do Supabase');
    }
    
    // Limpar usuário temporário
    await supabase.auth.admin.deleteUser(user.user.id);
    console.log('🗑️ Usuário temporário removido');
    
  } catch (error) {
    console.error('💥 Erro geral:', error.message);
  }
  
  console.log('\n📋 AÇÕES NECESSÁRIAS:');
  console.log('=' * 50);
  console.log('1. 📧 Verificar Email Templates no Supabase');
  console.log('   ↳ Authentication > Emails > Invite user');
  console.log('   ↳ Alterar {{ .SiteURL }} para {{ .RedirectTo }}');
  console.log('');
  console.log('2. ⚙️ Verificar configuração SMTP');
  console.log('   ↳ Settings > Auth > SMTP Settings');
  console.log('');
  console.log('3. 🧪 Testar com email real');
  console.log('   ↳ Use seu email pessoal para teste');
  console.log('');
  console.log('4. 📱 Verificar pasta de spam');
  console.log('   ↳ Emails do Supabase podem ir para spam');
}

// Executar diagnóstico
diagnosticarEmailProblema()
  .then(() => {
    console.log('\n🎉 Diagnóstico concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro no diagnóstico:', error);
    process.exit(1);
  });
