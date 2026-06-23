/**
 * Orquestrador Principal do App (app.js)
 * Inicializa a aplicação SPA, gerencia fluxos de login/cadastro e conecta os módulos de UI, Auth e DB.
 * Requisitos: RF01, RNF02, RNF04
 */

import { hasRegisteredUsers, registerUser, loginUser, logoutUser, getCurrentUser } from './auth.js';
import { bindUIEvents, navigateTo, showToast } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa o estado dos ícones Lucide carregados via CDN
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } else {
        console.warn('Lucide Icons não pôde ser carregado via CDN. Alguns ícones podem não aparecer.');
    }

    // 2. Configura as transições e formulários de autenticação
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const goToRegisterLink = document.getElementById('go-to-register');
    const goToLoginLink = document.getElementById('go-to-login');
    const btnLogout = document.getElementById('btn-logout');

    // Alternar entre login e registro
    goToRegisterLink?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm?.classList.add('hidden');
        registerForm?.classList.remove('hidden');
    });

    goToLoginLink?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm?.classList.add('hidden');
        loginForm?.classList.remove('hidden');
    });

    // Submissão do Formulário de Registro (Criar conta)
    registerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;

        if (password !== confirmPassword) {
            showToast('Erro de Validação', 'As senhas digitadas não coincidem.', 'danger');
            return;
        }

        try {
            if (registerUser(username, password)) {
                showToast(
                    'Conta Criada!',
                    'Seu usuário administrador foi registrado. Faça login para descriptografar o banco de dados.',
                    'success',
                    5000
                );
                // Reseta form de registro e vai para o de login
                registerForm.reset();
                registerForm.classList.add('hidden');
                loginForm.classList.remove('hidden');
                
                // Preenche o usuário criado no login para facilitar
                const elLoginUser = document.getElementById('login-username');
                if (elLoginUser) elLoginUser.value = username;
                const elLoginPass = document.getElementById('login-password');
                if (elLoginPass) elLoginPass.focus();
            }
        } catch (error) {
            showToast('Falha no Cadastro', error.message, 'danger');
        }
    });

    // Variáveis e funções para controle de Lockout contra Brute Force
    let loginAttempts = 0;
    let lockoutInterval = null;

    function checkLockout() {
        const lockoutUntil = localStorage.getItem('login_lockout_until');
        if (lockoutUntil) {
            const timeLeft = Math.ceil((parseInt(lockoutUntil) - Date.now()) / 1000);
            if (timeLeft > 0) {
                startLockout(timeLeft);
                return true;
            } else {
                localStorage.removeItem('login_lockout_until');
            }
        }
        return false;
    }

    function startLockout(durationSeconds) {
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const btnText = submitBtn ? submitBtn.querySelector('span') : null;

        if (usernameInput) usernameInput.disabled = true;
        if (passwordInput) passwordInput.disabled = true;
        if (submitBtn) submitBtn.disabled = true;

        let secondsRemaining = durationSeconds;
        
        if (lockoutInterval) clearInterval(lockoutInterval);

        function updateTimer() {
            if (secondsRemaining <= 0) {
                clearInterval(lockoutInterval);
                if (usernameInput) usernameInput.disabled = false;
                if (passwordInput) passwordInput.disabled = false;
                if (submitBtn) submitBtn.disabled = false;
                if (btnText) btnText.textContent = 'Entrar';
                localStorage.removeItem('login_lockout_until');
                showToast('Desbloqueado', 'Você já pode tentar realizar o login novamente.', 'info');
            } else {
                if (btnText) btnText.textContent = `Bloqueado (${secondsRemaining}s)`;
                secondsRemaining--;
            }
        }

        updateTimer();
        lockoutInterval = setInterval(updateTimer, 1000);
    }

    // Vincula alternância de visibilidade de senha (.btn-toggle-password)
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.target;
            const passwordInput = document.getElementById(targetId);
            if (!passwordInput) return;

            const icon = btn.querySelector('i');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon?.setAttribute('data-lucide', 'eye-off');
            } else {
                passwordInput.type = 'password';
                icon?.setAttribute('data-lucide', 'eye');
            }
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    });

    // Função para restaurar sessão persistente ("Mantenha-me conectado")
    function performAutoLogin() {
        const remembered = localStorage.getItem('sales_monitor_remembered');
        if (remembered) {
            try {
                const { username, hash } = JSON.parse(remembered);
                if (username && hash) {
                    const key = CryptoJS.SHA256(username + "remember-me-salt").toString();
                    const decryptedBytes = CryptoJS.AES.decrypt(hash, key);
                    const password = decryptedBytes.toString(CryptoJS.enc.Utf8);
                    
                    if (password) {
                        const sessionUser = loginUser(username, password);
                        if (sessionUser) {
                            // Configura detalhes da sessão na UI
                            const elSessionUser = document.getElementById('session-username');
                            if (elSessionUser) elSessionUser.textContent = sessionUser.username;
                            const initials = sessionUser.username.substring(0, 2).toUpperCase();
                            const elAvatar = document.getElementById('user-avatar-initials');
                            if (elAvatar) elAvatar.textContent = initials;

                            // Salva último usuário logado descriptografado de apoio
                            localStorage.setItem('last_logged_user', sessionUser.username);

                            // Alterna visualizações globais da SPA (Esconde login, mostra app)
                            document.getElementById('login-container').classList.add('hidden');
                            document.getElementById('app-container').classList.remove('hidden');

                            // Inicializa os manipuladores de eventos da interface
                            bindUIEvents();

                            // Navega para o Dashboard por padrão
                            navigateTo('dashboard');
                            
                            showToast(
                                'Acesso Automático',
                                `Sessão restaurada para o usuário <strong>${sessionUser.username}</strong>.`,
                                'success'
                            );
                            return true;
                        }
                    }
                }
            } catch (error) {
                console.error('Falha ao restaurar sessão automática:', error);
                localStorage.removeItem('sales_monitor_remembered');
            }
        }
        return false;
    }

    // Submissão do Formulário de Login (Entrar no sistema)
    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        if (checkLockout()) return;

        const username = document.getElementById('login-username')?.value || '';
        const password = document.getElementById('login-password')?.value || '';
        const rememberMe = document.getElementById('login-remember')?.checked || false;

        try {
            const sessionUser = loginUser(username, password);
            if (sessionUser) {
                // Sucesso: Limpa tentativas e lockout
                loginAttempts = 0;
                localStorage.removeItem('login_lockout_until');

                // Salva ou remove sessão persistente
                if (rememberMe) {
                    const key = CryptoJS.SHA256(username + "remember-me-salt").toString();
                    const encrypted = CryptoJS.AES.encrypt(password, key).toString();
                    localStorage.setItem('sales_monitor_remembered', JSON.stringify({ username, hash: encrypted }));
                } else {
                    localStorage.removeItem('sales_monitor_remembered');
                }

                showToast(
                    'Acesso Autorizado',
                    `Bem-vindo de volta, <strong>${sessionUser.username}</strong>! O banco de dados criptografado foi carregado com sucesso.`,
                    'success'
                );

                // Configura detalhes da sessão na UI
                const elSessionUser = document.getElementById('session-username');
                if (elSessionUser) elSessionUser.textContent = sessionUser.username;
                const initials = sessionUser.username.substring(0, 2).toUpperCase();
                const elAvatar = document.getElementById('user-avatar-initials');
                if (elAvatar) elAvatar.textContent = initials;

                // Salva último usuário logado descriptografado de apoio
                localStorage.setItem('last_logged_user', sessionUser.username);

                // Alterna visualizações globais da SPA (Esconde login, mostra app)
                document.getElementById('login-container').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');

                // Inicializa os manipuladores de eventos da interface
                bindUIEvents();

                // Navega para o Dashboard por padrão
                navigateTo('dashboard');
            }
        } catch (error) {
            loginAttempts++;
            if (loginAttempts >= 5) {
                const lockoutTime = Date.now() + 30000; // 30 segundos
                localStorage.setItem('login_lockout_until', lockoutTime.toString());
                loginAttempts = 0;
                showToast('Bloqueio Temporário', 'Muitas tentativas incorretas. Login bloqueado por 30 segundos.', 'danger', 5000);
                startLockout(30);
            } else {
                const remaining = 5 - loginAttempts;
                showToast('Acesso Negado', `${error.message} (Tentativas restantes: ${remaining})`, 'danger');
            }
        }
    });

    // Evento de Logout
    btnLogout?.addEventListener('click', () => {
        logoutUser();
        // Limpa o continuar conectado ao deslogar manualmente
        localStorage.removeItem('sales_monitor_remembered');
        showToast('Sessão Encerrada', 'Você saiu do sistema e o login automático foi desativado.', 'info');
        
        // Limpa inputs de login
        loginForm.reset();
        
        // Alterna telas
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('login-container').classList.remove('hidden');
    });

    // Evento de Reset Total do Sistema
    document.getElementById('btn-reset-system')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Tem certeza de que deseja resetar todo o sistema? Isso limpará todas as contas e bancos de dados locais e reiniciará a aplicação.')) {
            localStorage.clear();
            location.reload();
        }
    });

    // 3. Verificações de Inicialização
    if (!hasRegisteredUsers()) {
        // Se for o primeiro acesso absoluto, força ir para a tela de registro
        loginForm?.classList.add('hidden');
        registerForm?.classList.remove('hidden');
        showToast(
            'Primeiro Acesso',
            'Nenhum usuário administrador cadastrado. Crie sua conta para inicializar o banco de dados seguro.',
            'info',
            6000
        );
    } else {
        // Verifica se o usuário já estava em lockout antes de recarregar/iniciar
        const isLocked = checkLockout();
        
        let autoLoggedIn = false;
        if (!isLocked) {
            // Tenta o auto-login
            autoLoggedIn = performAutoLogin();
        }

        if (!autoLoggedIn) {
            // Preenche o campo de usuário com o último logado se houver
            const lastUser = localStorage.getItem('last_logged_user');
            if (lastUser) {
                const elLoginUser = document.getElementById('login-username');
                if (elLoginUser) elLoginUser.value = lastUser;
                const elLoginPass = document.getElementById('login-password');
                if (elLoginPass) elLoginPass.focus();
            }
        }
    }
});
