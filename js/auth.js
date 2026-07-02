/**
 * Módulo de Autenticação (auth.js)
 * Gerencia o controle de acesso de usuários com hash e salting de senhas (CryptoJS)
 * Requisitos: RF01, RNF04, RNF08
 */

import { setSessionPassword, loadDatabase, saveDatabase, clearSession } from './db.js';

const STORAGE_KEY_USERS = 'sales_monitor_users';

// Sessão ativa do usuário logado (em memória)
let currentUser = null;
let activeMasterKey = null;

export function getUsersList() {
    const data = localStorage.getItem(STORAGE_KEY_USERS);
    return data ? JSON.parse(data) : [];
}

function saveUsersList(users) {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

export function hasRegisteredUsers() {
    return getUsersList().length > 0;
}

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
    if (users.length > 0) {
        throw new Error('O sistema já possui um Administrador. Apenas ele pode cadastrar novas subcontas pelo painel interno.');
    }

    // Se for o primeiro cadastro absoluto do sistema
    localStorage.removeItem('sales_monitor_db_encrypted');
    localStorage.removeItem('sales_monitor_db_backup');

    const salt = CryptoJS.lib.WordArray.random(16).toString();
    const passwordHash = CryptoJS.SHA256(password + salt).toString();
    
    // Geração da Chave Mestra
    const masterKey = CryptoJS.lib.WordArray.random(32).toString();
    const encryptedMasterKey = CryptoJS.AES.encrypt(masterKey, password).toString();

    const newUser = {
        username: trimmedUsername,
        passwordHash,
        salt,
        role: 'admin',
        encryptedMasterKey
    };

    users.push(newUser);
    saveUsersList(users);
    return true;
}

export function createSubaccount(username, password, role) {
    if (!currentUser || currentUser.role !== 'admin') {
        throw new Error('Apenas administradores podem criar subcontas.');
    }
    
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername.length < 3) throw new Error('O nome de usuário deve ter pelo menos 3 caracteres.');
    if (password.length < 4) throw new Error('A senha deve ter pelo menos 4 caracteres.'); // Menos rigorosa para equipe
    
    const users = getUsersList();
    if (users.some(u => u.username === trimmedUsername)) {
        throw new Error('Este usuário já está cadastrado.');
    }
    
    const salt = CryptoJS.lib.WordArray.random(16).toString();
    const passwordHash = CryptoJS.SHA256(password + salt).toString();
    
    // Criptografa a Master Key em memória usando a senha da nova subconta
    const encryptedMasterKey = CryptoJS.AES.encrypt(activeMasterKey, password).toString();

    const newUser = {
        username: trimmedUsername,
        passwordHash,
        salt,
        role: role || 'operator',
        encryptedMasterKey
    };

    users.push(newUser);
    saveUsersList(users);
    return true;
}

export function deleteUser(username) {
    if (!currentUser || currentUser.role !== 'admin') throw new Error('Acesso negado.');
    if (username === currentUser.username) throw new Error('Você não pode excluir sua própria conta.');
    
    let users = getUsersList();
    users = users.filter(u => u.username !== username);
    saveUsersList(users);
}

export function listUsers() {
    if (!currentUser || currentUser.role !== 'admin') return [];
    return getUsersList().map(u => ({
        username: u.username,
        role: u.role || 'admin'
    }));
}

export function loginUser(username, password) {
    const trimmedUsername = username.trim().toLowerCase();
    const users = getUsersList();
    
    const user = users.find(u => u.username === trimmedUsername);
    if (!user) throw new Error('Usuário não encontrado.');

    const calculatedHash = CryptoJS.SHA256(password + user.salt).toString();
    if (calculatedHash !== user.passwordHash) throw new Error('Senha incorreta.');

    let masterKey;
    let isLegacyMigration = false;
    
    if (user.encryptedMasterKey) {
        const bytes = CryptoJS.AES.decrypt(user.encryptedMasterKey, password);
        masterKey = bytes.toString(CryptoJS.enc.Utf8);
        if (!masterKey) throw new Error('Falha de integridade na chave de segurança da conta.');
    } else {
        // Usuário legado (antes da atualização de subcontas)
        masterKey = password;
        isLegacyMigration = true;
    }

    setSessionPassword(masterKey);
    activeMasterKey = masterKey;

    try {
        loadDatabase();
        
        if (isLegacyMigration) {
            // Migra o banco de dados e a conta para o novo sistema
            const newMasterKey = CryptoJS.lib.WordArray.random(32).toString();
            user.encryptedMasterKey = CryptoJS.AES.encrypt(newMasterKey, password).toString();
            user.role = 'admin';
            saveUsersList(users);
            
            setSessionPassword(newMasterKey);
            activeMasterKey = newMasterKey;
            saveDatabase();
        }
        
        currentUser = { username: user.username, role: user.role || 'admin' };
        return currentUser;
    } catch (error) {
        clearSession();
        activeMasterKey = null;
        throw error;
    }
}

export function logoutUser() {
    currentUser = null;
    activeMasterKey = null;
    clearSession();
}

export function getCurrentUser() {
    return currentUser;
}
