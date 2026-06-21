/**
 * Módulo de Autenticação (auth.js)
 * Gerencia o controle de acesso de usuários com hash e salting de senhas (CryptoJS)
 * Requisitos: RF01, RNF04, RNF08
 */

import { setSessionPassword, loadDatabase, clearSession } from './db.js';

const STORAGE_KEY_USERS = 'sales_monitor_users';

// Sessão ativa do usuário logado (em memória)
let currentUser = null;

/**
 * Retorna a lista de usuários cadastrados no sistema
 */
function getUsersList() {
    const data = localStorage.getItem(STORAGE_KEY_USERS);
    return data ? JSON.parse(data) : [];
}

/**
 * Salva a lista de usuários no localStorage
 */
function saveUsersList(users) {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

/**
 * Verifica se existem usuários registrados no sistema
 */
export function hasRegisteredUsers() {
    return getUsersList().length > 0;
}

/**
 * Registra um novo usuário no sistema
 */
export function registerUser(username, password) {
    const trimmedUsername = username.trim().toLowerCase();
    
    if (trimmedUsername.length < 3) {
        throw new Error('O nome de usuário deve ter pelo menos 3 caracteres.');
    }
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_+\-=\[\]\\/~`|';]).{8,}$/;
    if (!passwordRegex.test(password)) {
        throw new Error('A senha deve ter pelo menos 8 caracteres e conter pelo menos uma letra maiúscula, uma letra minúscula, um número e um caractere especial (ex: @$!%*?&).');
    }

    const users = getUsersList();
    const userExists = users.some(u => u.username === trimmedUsername);

    if (userExists) {
        throw new Error('Este usuário já está cadastrado.');
    }

    // Se for o primeiro cadastro absoluto do sistema, limpa qualquer banco de dados criptografado anterior
    // que possa ter sido criado com outra senha em testes antigos.
    if (users.length === 0) {
        localStorage.removeItem('sales_monitor_db_encrypted');
        localStorage.removeItem('sales_monitor_db_backup');
    }

    // Geração de Salt para segurança contra ataques de dicionário
    const salt = CryptoJS.lib.WordArray.random(16).toString();
    // Geração do Hash SHA-256 com o Salt
    const passwordHash = CryptoJS.SHA256(password + salt).toString();

    const newUser = {
        username: trimmedUsername,
        passwordHash,
        salt
    };

    users.push(newUser);
    saveUsersList(users);

    return true;
}

/**
 * Realiza o login do usuário verificando as credenciais e derivando a chave de sessão do DB
 */
export function loginUser(username, password) {
    const trimmedUsername = username.trim().toLowerCase();
    const users = getUsersList();
    
    const user = users.find(u => u.username === trimmedUsername);
    if (!user) {
        throw new Error('Usuário não encontrado.');
    }

    // Calcula o Hash com o Salt armazenado do usuário
    const calculatedHash = CryptoJS.SHA256(password + user.salt).toString();

    if (calculatedHash !== user.passwordHash) {
        throw new Error('Senha incorreta.');
    }

    // Define a senha inserida como chave de criptografia do DB em memória
    // Isso garante que se a senha for incorreta, o banco não descriptografará.
    setSessionPassword(password);

    try {
        // Tenta carregar o banco de dados descriptografando-o
        loadDatabase();
        
        // Define o usuário da sessão
        currentUser = { username: user.username };
        return currentUser;
    } catch (error) {
        // Limpa a chave caso dê erro no load do DB
        clearSession();
        throw error;
    }
}

/**
 * Realiza o logout limpando os estados da sessão em memória
 */
export function logoutUser() {
    currentUser = null;
    clearSession();
}

/**
 * Retorna o usuário logado atualmente
 */
export function getCurrentUser() {
    return currentUser;
}
