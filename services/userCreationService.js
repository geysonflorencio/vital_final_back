// services/userCreationService.js
// Serviço melhorado para criação segura de usuários

const { supabase } = require('../config/supabase-safe');
const { Logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class UserCreationService {
  
  /**
   * Cria usuário de forma segura e atômica
   * @param {string} email 
   * @param {string} nomeCompleto 
   * @param {string} role 
   * @param {string} hospitalId 
   * @returns {Object} Resultado da criação
   */
  static async criarUsuarioSeguro(email, nomeCompleto, role, hospitalId) {
    const startTime = Date.now();
    
    try {
      Logger.info('Iniciando criação segura de usuário', { 
        email, 
        nomeCompleto, 
        role, 
        hospitalId 
      });
      
      // 1. VALIDAÇÕES RIGOROSAS
      await this._validarDadosEntrada(email, nomeCompleto, role, hospitalId);
      
      // 2. VERIFICAR USUÁRIO EXISTENTE
      await this._verificarUsuarioExistente(email);
      
      // 3. PREPARAR METADADOS SEGUROS
      const userData = this._prepararMetadados(nomeCompleto, role, hospitalId);
      
      // 4. CRIAR USUÁRIO NA AUTH COM SENHA TEMPORÁRIA
      const authUser = await this._criarUsuarioAuth(email, userData);
      
      // 5. VERIFICAR METADADOS SALVOS
      await this._verificarMetadados(authUser, userData);
      
      // 6. CRIAR PROFILE (com rollback em caso de erro)
      const profile = await this._criarProfile(authUser, email, nomeCompleto, role, hospitalId);
      
      // 7. CRIAR VÍNCULO HOSPITAL (com rollback em caso de erro)
      const userHospital = await this._criarVinculoHospital(authUser.id, hospitalId, role);
      
      // 8. ENVIAR EMAIL COM SENHA TEMPORÁRIA
      await this._enviarEmailSenhaTemporaria(email, nomeCompleto, authUser.senhaTemporaria);
      
      const duration = Date.now() - startTime;
      
      Logger.security('Usuário criado com sucesso - processo seguro', {
        user_id: authUser.id,
        email,
        duration: `${duration}ms`,
        components_created: ['auth', 'profile', 'user_hospital'],
        senha_definida: true
      });
      
      return {
        success: true,
        user: authUser,
        profile: profile,
        userHospital: userHospital,
        duration: duration
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      Logger.error('Falha na criação segura de usuário', {
        email,
        error: error.message,
        duration: `${duration}ms`,
        stack: error.stack
      });
      
      throw error;
    }
  }
  
  /**
   * Validações rigorosas dos dados de entrada
   */
  static async _validarDadosEntrada(email, nomeCompleto, role, hospitalId) {
    const errors = [];
    
    // Validar email
    if (!email || typeof email !== 'string') {
      errors.push('Email é obrigatório');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Email inválido');
    }
    
    // Validar nome
    if (!nomeCompleto || typeof nomeCompleto !== 'string') {
      errors.push('Nome completo é obrigatório');
    } else if (nomeCompleto.trim().length < 3) {
      errors.push('Nome deve ter pelo menos 3 caracteres');
    } else if (nomeCompleto.trim().length > 100) {
      errors.push('Nome muito longo (máximo 100 caracteres)');
    }
    
    // Validar role
    const rolesValidas = ['medico', 'enfermeira', 'admin', 'tecnico'];
    if (!role || !rolesValidas.includes(role)) {
      errors.push(`Role deve ser uma das opções: ${rolesValidas.join(', ')}`);
    }
    
    // Validar hospitalId
    if (!hospitalId || typeof hospitalId !== 'string') {
      errors.push('Hospital ID é obrigatório');
    } else {
      // Verificar se hospital existe
      const { data: hospital, error } = await supabase
        .from('hospitais')
        .select('id, ativo')
        .eq('id', hospitalId)
        .single();
      
      if (error || !hospital) {
        errors.push('Hospital não encontrado');
      } else if (!hospital.ativo) {
        errors.push('Hospital está inativo');
      }
    }
    
    if (errors.length > 0) {
      throw new AppError(`Dados inválidos: ${errors.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
  }
  
  /**
   * Verificar se usuário já existe
   */
  static async _verificarUsuarioExistente(email) {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      throw new AppError('Erro ao verificar usuários existentes', 500, 'AUTH_ERROR');
    }
    
    const existing = users.users.find(u => 
      u.email && u.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existing) {
      throw new AppError('Usuário já existe', 409, 'USER_EXISTS');
    }
  }
  
  /**
   * Preparar metadados com validações extras
   */
  static _prepararMetadados(nomeCompleto, role, hospitalId) {
    return {
      nome_completo: nomeCompleto.trim(),
      role: role.trim(),
      hospital_id: hospitalId.trim(),
      email_verified: true,
      created_by: 'sistema_admin',
      created_at: new Date().toISOString(),
      version: '2.0'
    };
  }
  
  /**
   * Criar usuário na auth com senha temporária
   * CORREÇÃO PRINCIPAL: Usa createUser() em vez de inviteUserByEmail()
   */
  static async _criarUsuarioAuth(email, userData) {
    // Gerar senha temporária segura
    const senhaTemporaria = this._gerarSenhaTemporaria();
    
    // CORREÇÃO: Criar usuário completo com senha em vez de enviar convite
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: senhaTemporaria,
      email_confirm: true, // Confirmar email automaticamente
      user_metadata: userData
    });
    
    if (authError) {
      throw new AppError(`Erro ao criar usuário na auth: ${authError.message}`, 500, 'AUTH_CREATION_ERROR');
    }
    
    // Armazenar senha temporária para envio por email
    authData.user.senhaTemporaria = senhaTemporaria;
    
    Logger.info('Usuário criado com senha temporária', { 
      user_id: authData.user.id, 
      email: email,
      senha_length: senhaTemporaria.length 
    });
    
    return authData.user;
  }
  
  /**
   * Gerar senha temporária segura
   */
  static _gerarSenhaTemporaria() {
    const chars = {
      maiuscula: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // Sem I, O para evitar confusão
      minuscula: 'abcdefghijkmnpqrstuvwxyz', // Sem l, o para evitar confusão  
      numero: '23456789', // Sem 0, 1 para evitar confusão
      simbolo: '!@#$%&*+='
    };
    
    let senha = '';
    
    // Garantir pelo menos 2 de cada tipo
    senha += chars.maiuscula[Math.floor(Math.random() * chars.maiuscula.length)];
    senha += chars.maiuscula[Math.floor(Math.random() * chars.maiuscula.length)];
    senha += chars.minuscula[Math.floor(Math.random() * chars.minuscula.length)];
    senha += chars.minuscula[Math.floor(Math.random() * chars.minuscula.length)];
    senha += chars.numero[Math.floor(Math.random() * chars.numero.length)];
    senha += chars.numero[Math.floor(Math.random() * chars.numero.length)];
    senha += chars.simbolo[Math.floor(Math.random() * chars.simbolo.length)];
    
    // Completar até 12 caracteres
    const todosChars = chars.maiuscula + chars.minuscula + chars.numero + chars.simbolo;
    for (let i = senha.length; i < 12; i++) {
      senha += todosChars[Math.floor(Math.random() * todosChars.length)];
    }
    
    // Embaralhar para randomizar posições
    return senha.split('').sort(() => Math.random() - 0.5).join('');
  }
  
  /**
   * Verificar se metadados foram salvos corretamente
   */
  static async _verificarMetadados(authUser, expectedData) {
    const saved = authUser.user_metadata;
    
    const metadataCorretos = 
      saved?.nome_completo === expectedData.nome_completo &&
      saved?.hospital_id === expectedData.hospital_id &&
      saved?.role === expectedData.role;
    
    if (!metadataCorretos) {
      // Tentar limpar usuário criado
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch (cleanupError) {
        Logger.error('Erro na limpeza após falha de metadados', {
          user_id: authUser.id,
          cleanup_error: cleanupError.message
        });
      }
      
      throw new AppError('Metadados não foram salvos corretamente', 500, 'METADATA_ERROR');
    }
  }
  
  /**
   * Criar profile com rollback automático
   */
  static async _criarProfile(authUser, email, nomeCompleto, role, hospitalId) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          email: email,
          nome_completo: nomeCompleto,
          role: role,
          hospital_id: hospitalId,
          ativo: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (profileError) {
        throw new AppError(profileError.message, 500, 'PROFILE_CREATION_ERROR');
      }
      
      return profile;
      
    } catch (error) {
      // Rollback: remover usuário da auth
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
        Logger.info('Rollback completo: usuário removido após falha no profile', {
          user_id: authUser.id
        });
      } catch (rollbackError) {
        Logger.error('Erro no rollback após falha do profile', {
          user_id: authUser.id,
          rollback_error: rollbackError.message
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Criar vínculo hospital com rollback automático
   */
  static async _criarVinculoHospital(userId, hospitalId, role) {
    try {
      const { data: userHospital, error: userHospitalError } = await supabase
        .from('user_hospitals')
        .insert({
          user_id: userId,
          hospital_id: hospitalId,
          role: role,
          ativo: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (userHospitalError) {
        throw new AppError(userHospitalError.message, 500, 'USER_HOSPITAL_CREATION_ERROR');
      }
      
      return userHospital;
      
    } catch (error) {
      // Rollback: remover profile e usuário
      try {
        await supabase.from('profiles').delete().eq('id', userId);
        await supabase.auth.admin.deleteUser(userId);
        Logger.info('Rollback completo: profile e auth removidos após falha no vínculo', {
          user_id: userId
        });
      } catch (rollbackError) {
        Logger.error('Erro no rollback após falha do vínculo hospital', {
          user_id: userId,
          rollback_error: rollbackError.message
        });
      }
      
      throw new AppError(error.message, 500, 'USER_HOSPITAL_CREATION_ERROR');
    }
  }
  
  /**
   * Enviar email com senha temporária
   */
  static async _enviarEmailSenhaTemporaria(email, nomeCompleto, senhaTemporaria) {
    try {
      Logger.info('Preparando email com senha temporária', {
        email: email,
        nome: nomeCompleto,
        senha_length: senhaTemporaria.length
      });
      
      // IMPLEMENTAÇÃO AUTOMÁTICA: Email de boas-vindas com explicação clara
      const { error: emailError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `https://vital-deploy.vercel.app/cadastro-senha.html?tipo=primeira_senha&email=${encodeURIComponent(email)}&nome=${encodeURIComponent(nomeCompleto)}&instrucoes=true&novo_usuario=true`
      });
      
      if (emailError) {
        Logger.error('Erro no envio automático de email', {
          email: email,
          error: emailError.message
        });
        
        // Fallback: logar para envio manual
        Logger.warn('EMAIL PARA ENVIO MANUAL - Falha no automático', {
          destinatario: email,
          nome: nomeCompleto,
          senha_temporaria: senhaTemporaria,
          assunto: 'Bem-vindo ao Sistema VITAL - Defina sua primeira senha',
          instrucoes: 'Email chegará como "Reset Password" mas é para PRIMEIRA senha'
        });
        
        console.log('\n📧 EMAIL PARA ENVIO MANUAL (Falha no automático):');
        console.log(`   Para: ${email}`);
        console.log(`   Nome: ${nomeCompleto}`);
        console.log(`   Senha temporária: ${senhaTemporaria}`);
        console.log('   ⚠️ IMPORTANTE: Email chegará como "Reset Password"');
        console.log('   ✅ MAS é para definir PRIMEIRA senha (isso é normal)');
        
      } else {
        Logger.info('Email de boas-vindas enviado automaticamente', {
          email: email,
          nome: nomeCompleto,
          redirect_url: 'cadastro-senha com parâmetros explicativos',
          envio_automatico: true
        });
        
        console.log('\n✅ EMAIL ENVIADO AUTOMATICAMENTE:');
        console.log(`   Para: ${email}`);
        console.log(`   Nome: ${nomeCompleto}`);
        console.log('   Tipo: Email de definição de primeira senha');
        console.log('   📧 AVISO: Email chegará como "Reset your password"');
        console.log('   🎯 REAL: É para definir PRIMEIRA senha (normal!)');
        console.log('   🔗 Link: https://vital-deploy.vercel.app/cadastro-senha.html');
        console.log('\n🔑 INFORMAÇÕES IMPORTANTES:');
        console.log(`   Senha temporária (backup): ${senhaTemporaria}`);
        console.log('   ⚠️ Email terá assunto confuso, mas página explicará');
        console.log('   ✅ Usuário será orientado que é PRIMEIRA senha');
        console.log('   📋 Página terá instruções claras sobre o processo');
        
        // Também enviar um segundo email de backup com contexto
        await this._enviarEmailBackupSenhaTemporaria(email, nomeCompleto, senhaTemporaria);
      }
      
    } catch (error) {
      Logger.error('Erro ao processar email de senha temporária', {
        email: email,
        error: error.message
      });
      
      // Fallback com informações claras
      Logger.warn('EMAIL PARA ENVIO MANUAL - Erro no processamento', {
        destinatario: email,
        nome: nomeCompleto,
        senha_temporaria: senhaTemporaria,
        assunto: 'Bem-vindo ao Sistema VITAL - Sua primeira senha',
        aviso_importante: 'Email automático chegará como "Reset Password" mas é para PRIMEIRA senha'
      });
      
      console.log('\n📧 EMAIL PARA ENVIO MANUAL (Erro no processamento):');
      console.log(`   Para: ${email}`);
      console.log(`   Nome: ${nomeCompleto}`);
      console.log(`   Senha temporária: ${senhaTemporaria}`);
      console.log('   ⚠️ AVISO: Email chegará como "Reset your password"');
      console.log('   ✅ REAL: É para definir PRIMEIRA senha no sistema');
      console.log('   📝 Orientar usuário que isso é normal');
      
      // Não falhar a criação por causa do email
    }
  }
  
  /**
   * Enviar email de backup com senha temporária (método alternativo)
   */
  static async _enviarEmailBackupSenhaTemporaria(email, nomeCompleto, senhaTemporaria) {
    try {
      // Aguardar 2 segundos para evitar rate limit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar enviar um segundo email com instruções diferentes
      const { error: backupError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `https://vital-deploy.vercel.app/login?welcome=true&email=${encodeURIComponent(email)}`
      });
      
      if (!backupError) {
        Logger.info('Email de backup enviado', {
          email: email,
          tipo: 'backup_welcome',
          senha_temporaria_incluida: false
        });
        
        console.log('📧 Email de backup também enviado com instruções de login');
      }
      
    } catch (backupError) {
      Logger.warn('Erro no envio de email de backup', {
        email: email,
        error: backupError.message
      });
    }
  }
  
  /**
   * Verificar integridade completa do usuário criado
   */
  static async verificarIntegridadeUsuario(userId) {
    try {
      // Verificar auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
      
      if (authError || !authUser.user) {
        return { valid: false, error: 'Usuário não encontrado na auth' };
      }
      
      // Verificar profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (profileError || !profile) {
        return { valid: false, error: 'Profile não encontrado' };
      }
      
      // Verificar user_hospitals
      const { data: userHospital, error: uhError } = await supabase
        .from('user_hospitals')
        .select('*')
        .eq('user_id', userId)
        .eq('ativo', true)
        .single();
      
      if (uhError || !userHospital) {
        return { valid: false, error: 'Vínculo hospital não encontrado' };
      }
      
      return {
        valid: true,
        authUser: authUser.user,
        profile: profile,
        userHospital: userHospital
      };
      
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = { UserCreationService };
