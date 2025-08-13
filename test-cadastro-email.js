// Test Script - Cadastro de Usuário com Email (usando módulos nativos)
const http = require('http');

async function testCadastroComEmail() {
  console.log('🧪 Testando cadastro de usuário com envio de email...\n');

  const testUser = {
    nome: 'Teste Email Usuario',
    email: 'teste.email@exemplo.com', // Use um email real para testar
    role: 'medico',
    hospital_id: 1
  };

  const postData = JSON.stringify(testUser);

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/cadastrar-usuario',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    console.log('📤 Enviando requisição para cadastro...');
    console.log('Dados:', testUser);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const responseData = JSON.parse(data);
          
          console.log('\n📥 Resposta recebida:');
          console.log('Status:', res.statusCode);
          console.log('Data:', JSON.stringify(responseData, null, 2));

          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('\n✅ SUCESSO: Usuário cadastrado!');
            console.log('📧 Email enviado:', responseData.data?.email_enviado ? 'SIM' : 'NÃO');
            
            if (responseData.data?.email_enviado) {
              console.log('🎯 Verifique a caixa de email:', testUser.email);
              console.log('📬 O email deve conter um link para definir senha');
            }
            resolve(responseData);
          } else {
            console.log('\n❌ ERRO: Falha no cadastro');
            console.log('Detalhes:', responseData.error || responseData.message);
            reject(new Error(responseData.error || responseData.message));
          }
        } catch (parseError) {
          console.error('\n💥 ERRO ao parsear resposta:', parseError.message);
          console.log('Resposta bruta:', data);
          reject(parseError);
        }
      });
    });

    req.on('error', (error) => {
      console.error('\n💥 ERRO na requisição:', error.message);
      console.log('\n🔍 Verifique se o servidor está rodando em localhost:3001');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Executar teste
testCadastroComEmail()
  .then(() => {
    console.log('\n🎉 Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error.message);
    process.exit(1);
  });
