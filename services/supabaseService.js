// services/supabaseService.js
const { supabase } = require('../config/database');
const { Logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');

class SupabaseService {
  // Método genérico para queries seguras
  static async safeQuery(operation, tableName, params = {}) {
    try {
      const startTime = Date.now();
      const result = await operation;
      const duration = Date.now() - startTime;

      Logger.info('Database query executada', {
        table: tableName,
        duration: `${duration}ms`,
        success: !result.error
      });

      if (result.error) {
        Logger.error('Erro na query do banco', {
          table: tableName,
          error: result.error.message,
          params
        });
        throw new AppError(`Erro na operação: ${result.error.message}`, 500, 'DATABASE_ERROR');
      }

      return result.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      Logger.error('Erro inesperado na query', {
        table: tableName,
        error: error.message,
        params
      });
      throw new AppError('Erro interno do banco de dados', 500, 'DATABASE_ERROR');
    }
  }

  // Buscar usuários por hospital
  static async getUsersByHospital(hospitalId) {
    const operation = supabase
      .from('profiles')
      .select('id, nome_completo, email, role, hospital_id, created_at')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });

    return this.safeQuery(operation, 'profiles', { hospitalId });
  }

  // Buscar perfil por ID
  static async getProfileById(userId) {
    const operation = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    return this.safeQuery(operation, 'profiles', { userId });
  }

  // Criar perfil de usuário
  static async createProfile(profileData) {
    const operation = supabase
      .from('profiles')
      .insert([profileData])
      .select()
      .single();

    return this.safeQuery(operation, 'profiles', { profileData });
  }

  // Criar vinculação usuário-hospital
  static async createUserHospital(userHospitalData) {
    const operation = supabase
      .from('user_hospitals')
      .insert([userHospitalData])
      .select()
      .single();

    return this.safeQuery(operation, 'user_hospitals', { userHospitalData });
  }

  // Buscar solicitações por hospital
  static async getSolicitacoesByHospital(hospitalId, status = null) {
    let operation = supabase
      .from('solicitacoes')
      .select('*')
      .eq('hospital_id', hospitalId);

    if (status) {
      operation = operation.eq('status', status);
    }

    operation = operation.order('created_at', { ascending: false });

    return this.safeQuery(operation, 'solicitacoes', { hospitalId, status });
  }

  // Criar solicitação
  static async createSolicitacao(solicitacaoData) {
    const operation = supabase
      .from('solicitacoes')
      .insert([solicitacaoData])
      .select()
      .single();

    return this.safeQuery(operation, 'solicitacoes', { solicitacaoData });
  }

  // Atualizar solicitação
  static async updateSolicitacao(id, updateData) {
    const operation = supabase
      .from('solicitacoes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    return this.safeQuery(operation, 'solicitacoes', { id, updateData });
  }

  // Métodos de autenticação (Admin)
  static async createAuthUser(email, password, userData) {
    try {
      // URL de redirecionamento para definir senha (nova página simplificada)
      const redirectUrl = process.env.FRONTEND_URL 
        ? `${process.env.FRONTEND_URL}/cadastro-senha.html?email=${encodeURIComponent(email)}`
        : `https://vital-deploy.vercel.app/cadastro-senha.html?email=${encodeURIComponent(email)}`;

      Logger.info('Enviando convite de usuário', { 
        email, 
        redirectUrl,
        userData: Object.keys(userData),
        FRONTEND_URL: process.env.FRONTEND_URL,
        fallbackUrl: 'https://vital-deploy.vercel.app/cadastro-senha.html'
      });

      // Enviar convite por email (método preferido)
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: userData,
        redirectTo: redirectUrl
      });

      if (inviteError) {
        Logger.error('Erro ao enviar convite por email', { email, error: inviteError.message });
        throw new AppError(`Erro ao enviar convite: ${inviteError.message}`, 400, 'INVITE_ERROR');
      }

      Logger.info('Convite enviado por email com sucesso', { 
        email,
        user_id: inviteData.user?.id 
      });

      return inviteData.user;
    } catch (error) {
      if (error instanceof AppError) throw error;
      Logger.error('Erro inesperado ao enviar convite', { email, error: error.message });
      throw new AppError('Erro interno no envio de convite', 500, 'INVITE_ERROR');
    }
  }

  static async updateUserPassword(userId, newPassword) {
    try {
      const { data, error } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
        email_confirm: true
      });

      if (error) {
        Logger.error('Erro ao atualizar senha', { userId, error: error.message });
        throw new AppError(`Erro ao atualizar senha: ${error.message}`, 400, 'PASSWORD_UPDATE_ERROR');
      }

      return data.user;
    } catch (error) {
      if (error instanceof AppError) throw error;
      Logger.error('Erro inesperado ao atualizar senha', { userId, error: error.message });
      throw new AppError('Erro interno na atualização de senha', 500, 'PASSWORD_UPDATE_ERROR');
    }
  }

  // Definir senha inicial (método otimizado para primeira definição)
  static async definirSenhaInicial(email, newPassword) {
    try {
      Logger.info('Iniciando definição de senha inicial', { email });

      // Buscar usuário pelo email
      const users = await this.listAuthUsers();
      const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        Logger.error('Usuário não encontrado para definir senha', { email });
        throw new AppError('Usuário não encontrado', 404, 'USER_NOT_FOUND');
      }

      // Verificar se o usuário já tem senha definida
      if (user.last_sign_in_at) {
        Logger.warn('Tentativa de redefinir senha de usuário que já fez login', { 
          email, 
          user_id: user.id,
          last_sign_in: user.last_sign_in_at 
        });
      }

      // NOVA ABORDAGEM: Usar resetPasswordForEmail seguido de confirmação
      // Isso é mais confiável para definir senha inicial
      Logger.info('Usando abordagem de reset de senha para definir senha inicial', { 
        user_id: user.id, 
        email 
      });

      // Primeira opção: Tentar updateUserById (método direto)
      let updateResult = null;
      try {
        const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
          password: newPassword,
          email_confirm: true,
          email_confirmed_at: new Date().toISOString(),
          user_metadata: {
            password_set_via: 'admin_update',
            password_set_at: new Date().toISOString()
          }
        });
        Logger.info('Retorno updateUserById', { user_id: user.id, data, error });
        if (!error) {
          updateResult = data;
          Logger.info('Senha definida via updateUserById', { user_id: user.id });
        } else {
          Logger.warn('updateUserById falhou, tentando método alternativo', { 
            user_id: user.id, 
            error: error.message 
          });
        }
      } catch (updateError) {
        Logger.warn('Erro no updateUserById, tentando método alternativo', { 
          user_id: user.id, 
          error: updateError.message 
        });
      }

      // Se updateUserById falhou, tentar método alternativo
      if (!updateResult) {
        Logger.info('Tentando método alternativo: forçar confirmação de email', { user_id: user.id });
        try {
          const confirmRet = await supabase.auth.admin.updateUserById(user.id, {
            email_confirm: true,
            email_confirmed_at: new Date().toISOString()
          });
          Logger.info('Retorno confirmação de email', { user_id: user.id, confirmRet });
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: retryData, error: retryError } = await supabase.auth.admin.updateUserById(user.id, {
            password: newPassword,
            user_metadata: {
              password_set_via: 'admin_retry',
              password_set_at: new Date().toISOString()
            }
          });
          Logger.info('Retorno retry updateUserById', { user_id: user.id, retryData, retryError });
          if (retryError) {
            throw retryError;
          }
          updateResult = retryData;
          Logger.info('Senha definida via método alternativo', { user_id: user.id });
        } catch (retryError) {
          Logger.error('Método alternativo também falhou', { 
            user_id: user.id, 
            error: retryError.message 
          });
          throw new AppError(`Erro ao definir senha: ${retryError.message}`, 400, 'PASSWORD_SET_ERROR');
        }
      }

      // Verificação final: tentar login para confirmar se senha foi definida
      try {
        Logger.info('Verificando se senha foi definida corretamente', { user_id: user.id });
        
        // Criar cliente temporário para teste
        const testClient = require('@supabase/supabase-js').createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_ANON_KEY
        );
        
        const { data: testLogin, error: testError } = await testClient.auth.signInWithPassword({
          email: email,
          password: newPassword
        });
        
        if (testError) {
          Logger.warn('Teste de login falhou, mas senha pode ter sido definida', { 
            user_id: user.id, 
            test_error: testError.message 
          });
        } else {
          Logger.success('Teste de login bem-sucedido', { user_id: user.id });
          // Fazer logout do cliente de teste
          await testClient.auth.signOut();
        }
      } catch (testLoginError) {
        Logger.warn('Erro no teste de login, mas continuando', { 
          user_id: user.id, 
          error: testLoginError.message 
        });
      }

      Logger.security('Senha inicial definida com sucesso', {
        user_id: user.id,
        email,
        previous_login: user.last_sign_in_at,
        method_used: updateResult ? 'success' : 'unknown'
      });

      return {
        user: updateResult?.user || { id: user.id, email: user.email },
        isFirstTimeSetup: !user.last_sign_in_at
      };

    } catch (error) {
      if (error instanceof AppError) throw error;
      Logger.error('Erro inesperado ao definir senha inicial', { email, error: error.message });
      throw new AppError('Erro interno na definição de senha', 500, 'PASSWORD_SET_ERROR');
    }
  }

  static async listAuthUsers() {
    try {
      const { data, error } = await supabase.auth.admin.listUsers();

      if (error) {
        Logger.error('Erro ao listar usuários auth', { error: error.message });
        throw new AppError(`Erro ao listar usuários: ${error.message}`, 400, 'LIST_USERS_ERROR');
      }

      return data.users;
    } catch (error) {
      if (error instanceof AppError) throw error;
      Logger.error('Erro inesperado ao listar usuários', { error: error.message });
      throw new AppError('Erro interno na listagem de usuários', 500, 'LIST_USERS_ERROR');
    }
  }

  // Excluir usuário do sistema COMPLETAMENTE (versão simplificada e confiável)
  static async deleteUser(userId) {
    try {
      console.log('🎯 [INICIO] Excluindo usuário:', userId);
      
      let deletionResults = {
        authDeleted: false,
        profileDeleted: false,
        userHospitalsDeleted: false,
        solicitacoesUpdated: false
      };

      // 1. BUSCAR O PERFIL PRIMEIRO
      let userProfile = null;
      try {
        const profileQuery = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        userProfile = await this.safeQuery(profileQuery, 'profiles', { userId });
        console.log('👤 [PERFIL] Usuário encontrado:', userProfile?.email);
      } catch (error) {
        console.log('⚠️ [PERFIL] Perfil não encontrado na base');
      }

      // 2. EXCLUIR DA AUTENTICAÇÃO SUPABASE (mais direto)
      try {
        console.log('🔥 [AUTH] Tentando exclusão da autenticação...');
        
        // Método direto sem verificações complexas
        const { data: deleteAuthData, error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
        
        if (deleteAuthError) {
          console.error('❌ [AUTH] Erro na exclusão:', deleteAuthError.message);
          // Tentar método alternativo
          const { data: deleteAuthData2, error: deleteAuthError2 } = await supabase.auth.admin.deleteUser(userId, false);
          if (!deleteAuthError2) {
            console.log('✅ [AUTH] Exclusão bem-sucedida (método 2)');
            deletionResults.authDeleted = true;
          }
        } else {
          console.log('✅ [AUTH] Exclusão da autenticação bem-sucedida');
          deletionResults.authDeleted = true;
        }
      } catch (authError) {
        console.error('💥 [AUTH] Erro crítico na exclusão auth:', authError.message);
      }

      // 3. EXCLUIR VINCULAÇÕES USER_HOSPITALS
      try {
        console.log('🗑️ [USER_HOSPITALS] Excluindo vinculações...');
        const deleteUserHospitals = supabase
          .from('user_hospitals')
          .delete()
          .eq('user_id', userId);

        await this.safeQuery(deleteUserHospitals, 'user_hospitals', { userId });
        console.log('✅ [USER_HOSPITALS] Vinculações excluídas');
        deletionResults.userHospitalsDeleted = true;
      } catch (error) {
        console.log('⚠️ [USER_HOSPITALS] Erro ou nenhuma vinculação:', error.message);
      }

      // 4. ATUALIZAR REFERÊNCIAS EM SOLICITAÇÕES
      try {
        console.log('🗑️ [SOLICITACOES] Removendo referências...');
        const updateSolicitacoes = supabase
          .from('solicitacoes')
          .update({ solicitado_por: null })
          .eq('solicitado_por', userId);

        await this.safeQuery(updateSolicitacoes, 'solicitacoes', { userId });
        console.log('✅ [SOLICITACOES] Referências removidas');
        deletionResults.solicitacoesUpdated = true;
      } catch (error) {
        console.log('⚠️ [SOLICITACOES] Erro ou nenhuma solicitação:', error.message);
      }

      // 5. EXCLUIR PERFIL (POR ÚLTIMO)
      if (userProfile) {
        try {
          console.log('🗑️ [PROFILES] Excluindo perfil...');
          const deleteProfile = supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

          await this.safeQuery(deleteProfile, 'profiles', { userId });
          console.log('✅ [PROFILES] Perfil excluído');
          deletionResults.profileDeleted = true;
        } catch (error) {
          console.error('❌ [PROFILES] Erro ao excluir perfil:', error.message);
          throw error; // Falha crítica
        }
      }

      // RESULTADO FINAL
      console.log('📊 [RESULTADO] Sumário da exclusão:', deletionResults);
      
      Logger.security('Usuário excluído do sistema', {
        user_id: userId,
        user_email: userProfile?.email,
        results: deletionResults
      });

      return { 
        success: true, 
        deletionResults,
        userEmail: userProfile?.email
      };

    } catch (error) {
      console.error('💥 [ERRO GERAL] Falha na exclusão:', error);
      
      if (error instanceof AppError) throw error;
      Logger.error('Erro inesperado ao excluir usuário', { 
        userId, 
        error: error.message 
      });
      throw new AppError('Erro interno na exclusão de usuário', 500, 'DELETE_USER_ERROR');
    }
  }

  // Verificar se usuário ainda existe na autenticação
  static async checkUserExistsInAuth(userId) {
    try {
      console.log('🔍 [CHECK AUTH] Verificando usuário:', userId);
      
      // Tentar buscar por ID primeiro
      try {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        
        if (error) {
          console.log('❌ [CHECK AUTH] Usuário não existe (getUserById):', error.message);
          return { exists: false, method: 'getUserById', error: error.message };
        }
        
        console.log('✅ [CHECK AUTH] Usuário existe (getUserById):', data.user?.email);
        return { 
          exists: true, 
          method: 'getUserById',
          user: {
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at,
            last_sign_in_at: data.user.last_sign_in_at,
            banned_until: data.user.banned_until
          }
        };
      } catch (getUserByIdError) {
        console.log('⚠️ [CHECK AUTH] getUserById não disponível, tentando listUsers:', getUserByIdError.message);
        
        // Fallback: listar todos os usuários e filtrar
        const { data, error } = await supabase.auth.admin.listUsers();
        
        if (error) {
          console.log('❌ [CHECK AUTH] Erro ao listar usuários:', error.message);
          return { exists: false, method: 'listUsers', error: error.message };
        }
        
        const user = data.users.find(u => u.id === userId);
        
        if (!user) {
          console.log('❌ [CHECK AUTH] Usuário não encontrado na lista');
          return { exists: false, method: 'listUsers' };
        }
        
        console.log('✅ [CHECK AUTH] Usuário encontrado na lista:', user.email);
        return { 
          exists: true, 
          method: 'listUsers',
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            banned_until: user.banned_until
          }
        };
      }
    } catch (error) {
      console.error('💥 [CHECK AUTH] Erro:', error.message);
      return { exists: false, error: error.message };
    }
  }

  // Verificar se usuário ainda existe nas tabelas do banco
  static async checkUserExistsInDatabase(userId) {
    try {
      console.log('🔍 [CHECK DB] Verificando usuário nas tabelas:', userId);
      
      const results = {
        profiles: false,
        user_hospitals: false,
        solicitacoes_references: false
      };

      // Verificar tabela profiles
      try {
        const profileQuery = supabase
          .from('profiles')
          .select('id, email, nome_completo')
          .eq('id', userId)
          .single();
        
        const profile = await this.safeQuery(profileQuery, 'profiles', { userId });
        if (profile) {
          results.profiles = true;
          results.profileData = profile;
          console.log('🔴 [CHECK DB] Usuário ainda existe em profiles:', profile.email);
        }
      } catch (error) {
        console.log('✅ [CHECK DB] Usuário não existe em profiles');
      }

      // Verificar tabela user_hospitals
      try {
        const userHospitalsQuery = supabase
          .from('user_hospitals')
          .select('*')
          .eq('user_id', userId);
        
        const userHospitals = await this.safeQuery(userHospitalsQuery, 'user_hospitals', { userId });
        if (userHospitals && userHospitals.length > 0) {
          results.user_hospitals = true;
          results.userHospitalsCount = userHospitals.length;
          console.log('🔴 [CHECK DB] Usuário ainda tem vinculações em user_hospitals:', userHospitals.length);
        }
      } catch (error) {
        console.log('✅ [CHECK DB] Usuário não tem vinculações em user_hospitals');
      }

      // Verificar referências em solicitacoes
      try {
        const solicitacoesQuery = supabase
          .from('solicitacoes')
          .select('id')
          .eq('solicitado_por', userId);
        
        const solicitacoes = await this.safeQuery(solicitacoesQuery, 'solicitacoes', { userId });
        if (solicitacoes && solicitacoes.length > 0) {
          results.solicitacoes_references = true;
          results.solicitacoesCount = solicitacoes.length;
          console.log('🔴 [CHECK DB] Usuário ainda tem referências em solicitacoes:', solicitacoes.length);
        }
      } catch (error) {
        console.log('✅ [CHECK DB] Usuário não tem referências em solicitacoes');
      }

      const existsInDatabase = results.profiles || results.user_hospitals || results.solicitacoes_references;
      
      console.log('📊 [CHECK DB] Resultado final:', results);
      
      return {
        exists: existsInDatabase,
        details: results
      };

    } catch (error) {
      console.error('💥 [CHECK DB] Erro:', error.message);
      return { exists: false, error: error.message };
    }
  }
}

module.exports = { SupabaseService };
