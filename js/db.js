/**
 * Módulo de Banco de Dados Seguro (db.js)
 * Gerencia o armazenamento persistente em localStorage com criptografia AES-256 (CryptoJS)
 * Requisitos: RNF03, RNF05, RNF08
 */

// Chave da sessão em memória (não persistida decifrada no disco)
let sessionPassword = null;
let currentDatabase = null;

// Nome das chaves no localStorage
const STORAGE_KEY_DB = 'sales_monitor_db_encrypted';
const STORAGE_KEY_BACKUP = 'sales_monitor_db_backup';
const STORAGE_KEY_USERS = 'sales_monitor_users'; // Tabela de usuários para login (descriptografada apenas com hash de senhas)

/**
 * Define a senha da sessão para criptografia/descriptografia
 */
export function setSessionPassword(password) {
    sessionPassword = password;
}

/**
 * Verifica se existe uma sessão ativa em memória
 */
export function hasSession() {
    return sessionPassword !== null;
}

/**
 * Encerra a sessão limpando as variáveis em memória
 */
export function clearSession() {
    sessionPassword = null;
    currentDatabase = null;
}

/**
 * Salva o banco de dados criptografado no localStorage e cria um backup automático
 */
export function saveDatabase() {
    if (!sessionPassword || !currentDatabase) {
        throw new Error('Sessão inválida. Não foi possível salvar os dados.');
    }

    try {
        const jsonStr = JSON.stringify(currentDatabase);
        // Criptografia AES-256 dos dados
        const encrypted = CryptoJS.AES.encrypt(jsonStr, sessionPassword).toString();
        localStorage.setItem(STORAGE_KEY_DB, encrypted);
        
        // Backup automático (RNF05)
        localStorage.setItem(STORAGE_KEY_BACKUP, encrypted);
        return true;
    } catch (error) {
        console.error('Erro ao salvar banco de dados:', error);
        return false;
    }
}

/**
 * Carrega o banco de dados descriptografando-o com a senha da sessão
 */
export function loadDatabase() {
    if (!sessionPassword) {
        throw new Error('Sem senha de sessão ativa.');
    }

    const encryptedData = localStorage.getItem(STORAGE_KEY_DB);
    
    if (!encryptedData) {
        // Se não houver banco, inicializa um vazio com dados mock
        initializeNewDatabase();
        return true;
    }

    try {
        // Descriptografia AES-256
        const bytes = CryptoJS.AES.decrypt(encryptedData, sessionPassword);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedStr) {
            throw new Error('Falha na descriptografia. Senha incorreta.');
        }

        currentDatabase = JSON.parse(decryptedStr);
        if (!currentDatabase.proposals) {
            currentDatabase.proposals = [];
        }
        if (!currentDatabase.paymentMethods) {
            currentDatabase.paymentMethods = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'];
        }
        return true;
    } catch (error) {
        console.error('Falha ao descriptografar banco de dados:', error);
        throw new Error('Senha incorreta ou banco de dados corrompido.');
    }
}

/**
 * Inicializa um banco de dados novo com os dados exigidos no exemplo
 */
function initializeNewDatabase() {
    currentDatabase = {
        sellers: [
            { id: 'sel_joao', name: 'João', email: 'joao@vendasmonitor.com', phone: '(11) 98111-2233', status: 'Ativo' },
            { id: 'sel_maria', name: 'Maria', email: 'maria@vendasmonitor.com', phone: '(11) 98222-3344', status: 'Ativo' },
            { id: 'sel_pedro', name: 'Pedro', email: 'pedro@vendasmonitor.com', phone: '(21) 98333-4455', status: 'Ativo' },
            { id: 'sel_ana', name: 'Ana', email: 'ana@vendasmonitor.com', phone: '(11) 98444-5566', status: 'Ativo' }
        ],
        sales: [],
        proposals: [],
        paymentMethods: ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto']
    };

    // Salva o banco inicial zerado
    saveDatabase();
}

/**
 * Retorna a lista de vendedores
 */
export function getSellers() {
    return currentDatabase ? [...currentDatabase.sellers] : [];
}

/**
 * Adiciona um novo vendedor
 */
export function addSeller(name, email, phone, status) {
    if (!currentDatabase) return null;

    const id = 'sel_' + Date.now();
    const newSeller = { id, name, email, phone, status };
    
    currentDatabase.sellers.push(newSeller);
    saveDatabase();
    return newSeller;
}

/**
 * Atualiza um vendedor existente
 */
export function updateSeller(id, name, email, phone, status) {
    if (!currentDatabase) return false;

    const idx = currentDatabase.sellers.findIndex(s => s.id === id);
    if (idx === -1) return false;

    currentDatabase.sellers[idx] = { id, name, email, phone, status };
    
    // Atualiza também o nome nas vendas caso tenha mudado
    currentDatabase.sales.forEach(sale => {
        if (sale.vendedorId === id) {
            sale.vendedorNome = name;
        }
    });

    saveDatabase();
    return true;
}

/**
 * Exclui um vendedor pelo ID
 */
export function deleteSeller(id) {
    if (!currentDatabase) return false;

    const lengthBefore = currentDatabase.sellers.length;
    currentDatabase.sellers = currentDatabase.sellers.filter(s => s.id !== id);

    if (currentDatabase.sellers.length < lengthBefore) {
        saveDatabase();
        return true;
    }
    return false;
}

/**
 * Retorna as vendas
 */
export function getSales() {
    if (!currentDatabase) return [];
    // Garante retrocompatibilidade de status e parcelamento para registros antigos
    currentDatabase.sales.forEach(sale => {
        if (!sale.status) {
            sale.status = sale.formaPagamento === 'Boleto' ? 'Pendente' : 'Pago';
        }
        if (sale.formaPagamento === 'Boleto') {
            if (sale.quantidadeBoletos === undefined || sale.quantidadeBoletos === null) {
                sale.quantidadeBoletos = 1;
            }
            if (sale.boletosPagos === undefined || sale.boletosPagos === null) {
                sale.boletosPagos = (sale.status === 'Pago') ? sale.quantidadeBoletos : 0;
            }
        }
        // Novas propriedades com defaults para retrocompatibilidade
        if (sale.proposta === undefined) sale.proposta = '';
        if (sale.tipo === undefined) sale.tipo = 'Venda';
        if (sale.executante === undefined) sale.executante = '';
        if (sale.valor2 === undefined) sale.valor2 = null;
        if (sale.observacoes2 === undefined) sale.observacoes2 = '';
    });
    return [...currentDatabase.sales];
}

export function addSale(vendedorId, cliente, numeroNota, valor, dataStr, formaPagamento, observacoes, vencimentoBoleto = null, quantidadeBoletos = 1, proposta = '', tipo = 'Venda', executante = '', valor2 = null, observacoes2 = '') {
    if (!currentDatabase) return null;

    const vendedor = currentDatabase.sellers.find(s => s.id === vendedorId);
    if (!vendedor) throw new Error('Vendedor não encontrado.');

    const newSale = {
        id: 'venda_' + Date.now(),
        vendedorId,
        vendedorNome: vendedor.name,
        cliente,
        numeroNota,
        valor: parseFloat(valor),
        data: new Date(dataStr).toISOString(),
        formaPagamento,
        vencimentoBoleto: vencimentoBoleto || null,
        quantidadeBoletos: formaPagamento === 'Boleto' ? parseInt(quantidadeBoletos) : null,
        boletosPagos: formaPagamento === 'Boleto' ? 0 : null,
        status: formaPagamento === 'Boleto' ? 'Pendente' : 'Pago',
        observacoes: observacoes || '',
        proposta: proposta || '',
        tipo: tipo || 'Venda',
        executante: executante || '',
        valor2: valor2 ? parseFloat(valor2) : null,
        observacoes2: observacoes2 || ''
    };

    currentDatabase.sales.push(newSale);
    // Reordena
    currentDatabase.sales.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    saveDatabase();
    return newSale;
}

/**
 * Confirma o pagamento do próximo boleto (parcela) de uma venda
 */
export function payNextBoleto(saleId) {
    if (!currentDatabase) return null;
    const sale = currentDatabase.sales.find(s => s.id === saleId);
    if (sale && sale.formaPagamento === 'Boleto') {
        const maxBoleto = sale.quantidadeBoletos || 1;
        if (sale.boletosPagos === undefined || sale.boletosPagos === null) {
            sale.boletosPagos = 0;
        }
        if (sale.boletosPagos < maxBoleto) {
            sale.boletosPagos++;
            if (sale.boletosPagos === maxBoleto) {
                sale.status = 'Pago';
            } else {
                sale.status = 'Pendente';
            }
            saveDatabase();
            return {
                success: true,
                paidCount: sale.boletosPagos,
                totalCount: maxBoleto,
                isFullyPaid: sale.status === 'Pago'
            };
        }
    }
    return null;
}

/**
 * Exclui uma venda pelo ID
 */
export function deleteSale(id) {
    if (!currentDatabase) return false;

    const lengthBefore = currentDatabase.sales.length;
    currentDatabase.sales = currentDatabase.sales.filter(s => s.id !== id);
    
    if (currentDatabase.sales.length < lengthBefore) {
        saveDatabase();
        return true;
    }
    return false;
}

/**
 * Limpa todo o banco de dados (Wipe total)
 */
export function clearDatabase() {
    localStorage.removeItem(STORAGE_KEY_DB);
    localStorage.removeItem(STORAGE_KEY_BACKUP);
    initializeNewDatabase();
}

/**
 * Exporta o JSON criptografado como string para backup em arquivo
 */
export function exportBackup() {
    if (!sessionPassword) return null;
    return localStorage.getItem(STORAGE_KEY_DB);
}

/**
 * Importa dados de um arquivo JSON criptografado
 */
export function importBackup(encryptedJsonStr, testPassword) {
    try {
        // Testa se consegue descriptografar
        const bytes = CryptoJS.AES.decrypt(encryptedJsonStr, testPassword);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedStr) {
            return false;
        }

        // Se deu certo, valida estrutura básica
        const parsed = JSON.parse(decryptedStr);
        if (!parsed.sellers || !parsed.sales) {
            return false;
        }
        if (!parsed.proposals) parsed.proposals = [];
        if (!parsed.paymentMethods) parsed.paymentMethods = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'];

        // Aplica ao localStorage e atualiza em memória
        localStorage.setItem(STORAGE_KEY_DB, encryptedJsonStr);
        localStorage.setItem(STORAGE_KEY_BACKUP, encryptedJsonStr);
        
        setSessionPassword(testPassword);
        currentDatabase = parsed;
        return true;
    } catch (e) {
        console.error('Falha ao restaurar backup:', e);
        return false;
    }
}

/**
 * Retorna as propostas
 */
export function getProposals() {
    if (!currentDatabase) return [];
    if (!currentDatabase.proposals) {
        currentDatabase.proposals = [];
    }
    // Preenche defaults para retrocompatibilidade
    currentDatabase.proposals.forEach(prop => {
        if (prop.valor2 === undefined) prop.valor2 = null;
        if (prop.executante === undefined) prop.executante = '';
        if (prop.formaPagamento === undefined) prop.formaPagamento = '';
        if (prop.observacoes2 === undefined) prop.observacoes2 = '';
    });
    return [...currentDatabase.proposals];
}

/**
 * Adiciona uma proposta
 */
export function addProposal(vendedorId, cliente, valor, dataStr, formaPagamento, observacoes, propostaCodigo = '', tipo = 'Proposta', executante = '', valor2 = null, observacoes2 = '') {
    if (!currentDatabase) return null;
    if (!currentDatabase.proposals) currentDatabase.proposals = [];

    const vendedor = currentDatabase.sellers.find(s => s.id === vendedorId);
    if (!vendedor) throw new Error('Vendedor não encontrado.');

    const timestamp = Date.now();
    const finalCodigo = propostaCodigo.trim() || 'PROP-' + timestamp;

    const newProposal = {
        id: 'prop_' + timestamp,
        vendedorId,
        vendedorNome: vendedor.name,
        cliente,
        valor: parseFloat(valor),
        data: new Date(dataStr).toISOString(),
        formaPagamento: formaPagamento || '',
        observacoes: observacoes || '',
        proposta: finalCodigo,
        tipo: tipo || 'Proposta',
        executante: executante || '',
        valor2: valor2 ? parseFloat(valor2) : null,
        observacoes2: observacoes2 || ''
    };

    currentDatabase.proposals.push(newProposal);
    currentDatabase.proposals.sort((a, b) => new Date(b.data) - new Date(a.data));
    
    saveDatabase();
    return newProposal;
}

/**
 * Atualiza uma proposta existente
 */
export function updateProposal(id, vendedorId, cliente, valor, dataStr, formaPagamento, observacoes, propostaCodigo = '', tipo = 'Proposta', executante = '', valor2 = null, observacoes2 = '') {
    if (!currentDatabase || !currentDatabase.proposals) return false;

    const idx = currentDatabase.proposals.findIndex(p => p.id === id);
    if (idx === -1) return false;

    const vendedor = currentDatabase.sellers.find(s => s.id === vendedorId);
    if (!vendedor) throw new Error('Vendedor não encontrado.');

    const finalCodigo = propostaCodigo.trim() || 'PROP-' + Date.now();

    currentDatabase.proposals[idx] = {
        id,
        vendedorId,
        vendedorNome: vendedor.name,
        cliente,
        valor: parseFloat(valor),
        data: new Date(dataStr).toISOString(),
        formaPagamento: formaPagamento || '',
        observacoes: observacoes || '',
        proposta: finalCodigo,
        tipo: tipo || 'Proposta',
        executante: executante || '',
        valor2: valor2 ? parseFloat(valor2) : null,
        observacoes2: observacoes2 || ''
    };

    currentDatabase.proposals.sort((a, b) => new Date(b.data) - new Date(a.data));
    saveDatabase();
    return true;
}

/**
 * Exclui uma proposta pelo ID
 */
export function deleteProposal(id) {
    if (!currentDatabase || !currentDatabase.proposals) return false;

    const lengthBefore = currentDatabase.proposals.length;
    currentDatabase.proposals = currentDatabase.proposals.filter(p => p.id !== id);

    if (currentDatabase.proposals.length < lengthBefore) {
        saveDatabase();
        return true;
    }
    return false;
}

/**
 * Converte proposta em venda
 */
export function convertProposalToSale(proposalId, saleNota, finalPagamento, quantidadeBoletos = 1, vencimentoBoleto = null) {
    if (!currentDatabase) return null;
    if (!currentDatabase.proposals) currentDatabase.proposals = [];

    const proposal = currentDatabase.proposals.find(p => p.id === proposalId);
    if (!proposal) throw new Error('Proposta não encontrada.');

    // Adiciona a venda usando os dados da proposta + dados finais da venda
    const newSale = {
        id: 'venda_' + Date.now(),
        vendedorId: proposal.vendedorId,
        vendedorNome: proposal.vendedorNome,
        cliente: proposal.cliente,
        numeroNota: saleNota,
        valor: proposal.valor,
        data: new Date().toISOString(), // Data de hoje como data da venda
        formaPagamento: finalPagamento,
        vencimentoBoleto: vencimentoBoleto || null,
        quantidadeBoletos: finalPagamento === 'Boleto' ? parseInt(quantidadeBoletos) : null,
        boletosPagos: finalPagamento === 'Boleto' ? 0 : null,
        status: finalPagamento === 'Boleto' ? 'Pendente' : 'Pago',
        observacoes: proposal.observacoes || '',
        proposta: proposal.proposta,
        tipo: 'Venda', // Ao converter, vira tipo "Venda"
        executante: proposal.executante || '',
        valor2: proposal.valor2,
        observacoes2: proposal.observacoes2 || ''
    };

    if (!currentDatabase.sales) currentDatabase.sales = [];
    currentDatabase.sales.push(newSale);
    currentDatabase.sales.sort((a, b) => new Date(b.data) - new Date(a.data));

    // Remove a proposta convertida
    currentDatabase.proposals = currentDatabase.proposals.filter(p => p.id !== proposalId);

    saveDatabase();
    return newSale;
}

/**
 * Retorna as formas de pagamento
 */
export function getPaymentMethods() {
    if (!currentDatabase) return ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'];
    if (!currentDatabase.paymentMethods) {
        currentDatabase.paymentMethods = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'];
        saveDatabase();
    }
    return [...currentDatabase.paymentMethods];
}

/**
 * Adiciona uma nova forma de pagamento
 */
export function addPaymentMethod(name) {
    if (!currentDatabase) return false;
    if (!currentDatabase.paymentMethods) {
        currentDatabase.paymentMethods = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'];
    }
    const cleanName = name.trim();
    if (!cleanName) return false;
    if (currentDatabase.paymentMethods.some(m => m.toLowerCase() === cleanName.toLowerCase())) {
        return false; // Já existe
    }
    currentDatabase.paymentMethods.push(cleanName);
    saveDatabase();
    return true;
}

/**
 * Remove uma forma de pagamento
 */
export function deletePaymentMethod(name) {
    if (!currentDatabase || !currentDatabase.paymentMethods) return false;
    const lengthBefore = currentDatabase.paymentMethods.length;
    currentDatabase.paymentMethods = currentDatabase.paymentMethods.filter(m => m !== name);
    if (currentDatabase.paymentMethods.length < lengthBefore) {
        saveDatabase();
        return true;
    }
    return false;
}
