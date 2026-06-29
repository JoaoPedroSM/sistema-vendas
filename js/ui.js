/**
 * Módulo de Interface do Usuário (ui.js)
 * Gerencia o roteamento interno (SPA), manipulação do DOM, eventos de formulários,
 * paginação, filtros, sistema de Toasts de notificação e janelas modais.
 * Requisitos: RF01-RF11, RF14-RF15, RNF02, RNF06
 */

import { 
    getSellers, addSeller, updateSeller, deleteSeller,
    getSales, addSale, deleteSale, payNextBoleto,
    clearDatabase, exportBackup, importBackup,
    convertExistingProposalToSale,
    getPaymentMethods, addPaymentMethod, deletePaymentMethod,
    getSystemSettings, updateSystemSettings
} from './db.js';
import { updateCharts, setChartPeriodoType } from './charts.js';
import { getConsolidatedSellersMetrics, exportToExcel, exportToPDF } from './reports.js';

let activeSalesView = 'table';
let calendarCurrentDate = new Date();

/**
 * Escapa caracteres especiais de uma string para evitar vulnerabilidades de XSS (Cross-Site Scripting)
 */
export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Calcula a data de vencimento da parcela (boleto) somando index * 30 dias à data do 1º vencimento
 */
export function getBoletoDueDate(originalDateStr, indexZeroBased) {
    if (!originalDateStr) return '';
    const d = new Date(originalDateStr + 'T12:00:00');
    d.setDate(d.getDate() + (indexZeroBased * 30));
    return d.toISOString().split('T')[0];
}

// Estado da UI
let activeView = 'dashboard';
let salesPage = 1;
const salesPageSize = 10;
let filteredSalesList = [];

// Elementos gerais
let activeModalConfirmCallback = null;

// Helper para formatar o badge de pagamento com data de vencimento se for boleto e status
function getPaymentBadgeHTML(sale) {
    if (sale.formaPagamento === 'Boleto' && sale.vencimentoBoleto) {
        const qtd = sale.quantidadeBoletos ? parseInt(sale.quantidadeBoletos) : 1;
        const pagos = sale.boletosPagos !== undefined && sale.boletosPagos !== null ? parseInt(sale.boletosPagos) : 0;
        const valorParcela = sale.valor / qtd;
        const formattedParcela = valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        if (pagos === qtd) {
            return `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="check-circle" style="width:12px;height:12px;"></i>Pago - Boleto (${qtd}x de ${formattedParcela})</span>`;
        } else {
            // Data de vencimento da parcela pendente atual
            const pendingDueDate = getBoletoDueDate(sale.vencimentoBoleto, pagos);
            const parts = pendingDueDate.split('-');
            const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : pendingDueDate;
            
            // Verifica se a parcela atual está vencida
            const today = new Date();
            const offset = today.getTimezoneOffset() * 60000;
            const todayStr = (new Date(today - offset)).toISOString().split('T')[0];
            
            const bltInfo = `Boleto ${pagos + 1}/${qtd} (${formattedParcela})`;
            
            if (pendingDueDate < todayStr) {
                return `<span class="badge badge-danger" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i>Vencido - ${bltInfo} - Venc: ${escapeHTML(dateFormatted)}</span>`;
            } else {
                return `<span class="badge badge-warning" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="clock" style="width:12px;height:12px;"></i>Pendente - ${bltInfo} - Venc: ${escapeHTML(dateFormatted)}</span>`;
            }
        }
    }
    
    // Pix, Cartão, Dinheiro (sempre Pago)
    return `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="check-circle" style="width:12px;height:12px;"></i>${escapeHTML(sale.formaPagamento)}</span>`;
}

/**
 * Exibe uma notificação do tipo Toast (Toast Notification) na tela
 */
export function showToast(title, message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Mapeia ícones
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'danger') iconName = 'alert-triangle';
    if (type === 'warning') iconName = 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i data-lucide="x"></i></button>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Evento de fechar no clique
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        closeToast(toast);
    });

    // Remove automaticamente após a duração
    const timeoutId = setTimeout(() => {
        closeToast(toast);
    }, duration);

    // Salva o timeout no elemento
    toast.dataset.timeoutId = timeoutId;
}

function closeToast(toast) {
    if (toast.classList.contains('toast-closing')) return;
    toast.classList.add('toast-closing');
    
    // Limpa timeout se houver
    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
    }

    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

/**
 * Abre o modal de confirmação personalizado
 */
export function openConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    
    if (!modal || !titleEl || !messageEl) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    activeModalConfirmCallback = onConfirm;

    modal.classList.remove('hidden');
}

/**
 * Fecha o modal de confirmação
 */
function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    activeModalConfirmCallback = null;
}

/**
 * Alterna a visualização ativa (SPA router simples)
 */
export function navigateTo(viewId) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.add('hidden'));

    const activeTarget = document.getElementById(`view-${viewId}`);
    if (activeTarget) {
        activeTarget.classList.remove('hidden');
        activeView = viewId;
        
        // Atualiza título do cabeçalho
        const titleMap = {
            'dashboard': 'Dashboard de Vendas',
            'vendas': 'Lançamento e Histórico de Vendas',
            'vendedores': 'Gerenciamento de Vendedores',
            'relatorios': 'Exportação de Relatórios e Backup'
        };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = titleMap[viewId] || 'VendasMonitor';

        // Atualiza classes do menu
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            if (link.dataset.view === viewId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Eventos específicos ao carregar views
        if (viewId === 'dashboard') {
            refreshDashboard();
        } else if (viewId === 'vendas') {
            refreshSalesPage();
        } else if (viewId === 'vendedores') {
            refreshSellersPage();
        } else if (viewId === 'relatorios') {
            refreshReportsPage();
        }
        updateCloudBadge();
    }
    
    // Fecha menu lateral no mobile após navegação
    document.querySelector('.sidebar')?.classList.remove('active');
}

/**
 * Atualiza os dados da tela principal (Dashboard)
 */
function refreshDashboard() {
    const sales = getSales();
    const sellers = getSellers();

    // Verifica boletos vencidos ou vencendo hoje (Alertas)
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const todayStr = (new Date(today - offset)).toISOString().split('T')[0];

    const overdueBoletos = [];
    const dueTodayBoletos = [];

    sales.forEach(sale => {
        if (sale.formaPagamento === 'Boleto' && sale.vencimentoBoleto && sale.status === 'Pendente') {
            const activeDueDate = getBoletoDueDate(sale.vencimentoBoleto, sale.boletosPagos || 0);
            if (activeDueDate < todayStr) {
                overdueBoletos.push(sale);
            } else if (activeDueDate === todayStr) {
                dueTodayBoletos.push(sale);
            }
        }
    });

    const alertsContainer = document.getElementById('dashboard-alerts-container');
    if (alertsContainer) {
        if (overdueBoletos.length === 0 && dueTodayBoletos.length === 0) {
            alertsContainer.classList.add('hidden');
            alertsContainer.innerHTML = '';
        } else {
            alertsContainer.classList.remove('hidden');
            
            let alertsHtml = '';
            
            if (overdueBoletos.length > 0) {
                const totalOverdueVal = overdueBoletos.reduce((sum, s) => sum + s.valor, 0);
                alertsHtml += `
                    <div class="alert-box alert-box-danger">
                        <i data-lucide="alert-triangle" class="alert-box-icon"></i>
                        <div class="alert-box-content">
                            <div class="alert-box-title">ATENÇÃO: Você possui ${overdueBoletos.length} boleto(s) vencido(s)!</div>
                            <div>Total em atraso: <strong>${totalOverdueVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>. Verifique o histórico de vendas para cobrança.</div>
                        </div>
                    </div>
                `;
            }

            if (dueTodayBoletos.length > 0) {
                const totalDueTodayVal = dueTodayBoletos.reduce((sum, s) => sum + s.valor, 0);
                alertsHtml += `
                    <div class="alert-box alert-box-warning">
                        <i data-lucide="bell" class="alert-box-icon"></i>
                        <div class="alert-box-content">
                            <div class="alert-box-title">ALERTA: Você possui ${dueTodayBoletos.length} boleto(s) vencendo hoje!</div>
                            <div>Total faturado vencendo hoje: <strong>${totalDueTodayVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.</div>
                        </div>
                    </div>
                `;
            }

            alertsContainer.innerHTML = alertsHtml;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    // KPIs Cálculos (Apenas vendas reais contam para faturamento)
    const completedSales = sales.filter(s => {
        const isProp = (s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) ||
                       (s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === ''));
        return !isProp;
    });

    const totalSales = completedSales.length;
    const totalRevenue = completedSales.reduce((sum, s) => sum + s.valor, 0);
    const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Acha melhor vendedor
    let bestSeller = 'Nenhum';
    let bestSellerCount = 0;
    const sellerCounts = {};

    completedSales.forEach(s => {
        sellerCounts[s.vendedorNome] = (sellerCounts[s.vendedorNome] || 0) + 1;
    });

    Object.entries(sellerCounts).forEach(([name, count]) => {
        if (count > bestSellerCount) {
            bestSellerCount = count;
            bestSeller = name;
        }
    });

    // Renderiza KPIs
    const elKpiTotal = document.getElementById('kpi-total-vendas');
    if (elKpiTotal) elKpiTotal.textContent = totalSales;
    const elKpiValor = document.getElementById('kpi-valor-total');
    if (elKpiValor) elKpiValor.textContent = totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const elKpiTicket = document.getElementById('kpi-ticket-medio');
    if (elKpiTicket) elKpiTicket.textContent = averageTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const elKpiVendedor = document.getElementById('kpi-melhor-vendedor');
    if (elKpiVendedor) elKpiVendedor.textContent = bestSeller;
    const elKpiVendedorVendas = document.getElementById('kpi-melhor-vendedor-vendas');
    if (elKpiVendedorVendas) elKpiVendedorVendas.textContent = `${bestSellerCount} vendas`;

    // Atualiza gráficos (apenas vendas)
    updateCharts(completedSales, sellers);



    // Tabela de Vendas Recentes (últimas 5)
    const recentSales = sales.slice(0, 5);
    const tbody = document.getElementById('recent-sales-tbody');
    
    if (tbody) {
        if (recentSales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-muted text-center" style="text-align: center;">Nenhuma venda cadastrada.</td></tr>`;
        } else {
            tbody.innerHTML = recentSales.map(sale => `
                <tr>
                    <td>${escapeHTML(sale.observacoes)}</td>
                    <td>${escapeHTML(sale.proposta)}</td>
                    <td>${escapeHTML(sale.cliente)}</td>
                    <td>${escapeHTML(sale.tipo)}</td>
                    <td class="money-cell" style="font-weight: 700; color: var(--success);">${sale.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${new Date(sale.data).toLocaleDateString('pt-BR')}</td>
                    <td>${escapeHTML(sale.executante)}</td>
                    <td><span class="badge badge-primary">${escapeHTML(sale.numeroNota)}</span></td>
                    <td class="money-cell" style="font-weight: 600; color: var(--text-secondary);">${sale.valor2 ? sale.valor2.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
                    <td>${getPaymentBadgeHTML(sale)}</td>
                    <td>${sale.vencimentoBoleto ? new Date(sale.vencimentoBoleto + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    <td style="font-weight: 600;">${escapeHTML(sale.vendedorNome)}</td>
                    <td>${escapeHTML(sale.observacoes2)}</td>
                </tr>
            `).join('');
        }
    }
}

/**
 * Atualiza a tela de Vendas (Lista, Filtros, Formulário)
 */
function refreshSalesPage() {
    const sellers = getSellers();
    
    // Atualiza dropdowns de vendedores (Cadastro de Vendas e Filtro de Vendas)
    const selectForm = document.getElementById('sale-vendedor');
    const selectFilter = document.getElementById('filter-vendedor');
    
    if (selectForm) {
        selectForm.innerHTML = '<option value="" disabled selected>Selecione o vendedor</option>' + 
            sellers.filter(s => s.status === 'Ativo').map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join('');
    }

    if (selectFilter) {
        const currentVal = selectFilter.value || 'todos';
        selectFilter.innerHTML = '<option value="todos">Todos Vendedores</option>' +
            sellers.map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join('');
        selectFilter.value = currentVal;
    }

    // Atualiza dropdown de formas de pagamento
    const selectPagamento = document.getElementById('sale-pagamento');
    if (selectPagamento) {
        const currentVal = selectPagamento.value;
        const methods = getPaymentMethods();
        selectPagamento.innerHTML = '<option value="" disabled selected>Selecione o pagamento</option>' +
            methods.map(m => `<option value="${m}">${escapeHTML(m)}</option>`).join('');
        if (currentVal && methods.includes(currentVal)) {
            selectPagamento.value = currentVal;
        }
    }

    // Configura data padrão do form de venda como data/hora atual local (para atender RF06)
    const saleDateInput = document.getElementById('sale-data');
    if (saleDateInput && !saleDateInput.value) {
        const now = new Date();
        // Corrige fuso horário para preencher campo datetime-local corretamente
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
        saleDateInput.value = localISOTime;
    }

    updateAutocompletes();
    applySalesFilters();
}

/**
 * Aplica os filtros de vendas ativos e atualiza a tabela (RF07, RF08, RF09)
 */
function applySalesFilters() {
    const sales = getSales();
    const searchVal = (document.getElementById('filter-search-input')?.value || '').toLowerCase().trim();
    const sellerVal = document.getElementById('filter-vendedor')?.value || 'todos';
    const startVal = document.getElementById('filter-data-inicio')?.value || '';
    const endVal = document.getElementById('filter-data-fim')?.value || '';

    filteredSalesList = sales.filter(sale => {
        // Busca textual (cliente ou número da nota)
        const matchSearch = sale.cliente.toLowerCase().includes(searchVal) || 
                            (sale.numeroNota && sale.numeroNota.toLowerCase().includes(searchVal));
        
        // Filtro por Vendedor
        const matchSeller = sellerVal === 'todos' || sale.vendedorId === sellerVal;
        
        // Filtro por Período
        let matchDate = true;
        const saleDate = new Date(sale.data);
        saleDate.setHours(0, 0, 0, 0);

        if (startVal) {
            const startDate = new Date(startVal);
            startDate.setHours(0,0,0,0);
            if (saleDate < startDate) matchDate = false;
        }

        if (endVal) {
            const endDate = new Date(endVal);
            endDate.setHours(0,0,0,0);
            if (saleDate > endDate) matchDate = false;
        }

        return matchSearch && matchSeller && matchDate;
    });

    if (activeSalesView === 'kanban') {
        renderSalesKanban();
    } else {
        renderSalesTable();
    }
}

/**
 * Renderiza a tabela de vendas com base na paginação
 */
function renderSalesTable() {
    const tbody = document.getElementById('sales-history-tbody');
    if (!tbody) return;

    const totalRecords = filteredSalesList.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / salesPageSize));

    // Ajusta página atual caso ultrapasse o total filtrado
    if (salesPage > totalPages) salesPage = totalPages;
    if (salesPage < 1) salesPage = 1;

    // Recorta dados da página
    const startIndex = (salesPage - 1) * salesPageSize;
    const pageSales = filteredSalesList.slice(startIndex, startIndex + salesPageSize);

    // Atualiza controles de rodapé
    const countEl = document.getElementById('table-sales-count');
    if (countEl) {
        countEl.textContent = totalRecords > 0 
            ? `Mostrando ${startIndex + 1} a ${Math.min(startIndex + salesPageSize, totalRecords)} de ${totalRecords} vendas`
            : `Nenhuma venda encontrada`;
    }
    const pageEl = document.getElementById('table-page-number');
    if (pageEl) pageEl.textContent = salesPage;
    const btnPrev = document.getElementById('btn-page-prev');
    if (btnPrev) btnPrev.disabled = salesPage === 1;
    const btnNext = document.getElementById('btn-page-next');
    if (btnNext) btnNext.disabled = salesPage === totalPages;

    if (pageSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-muted text-center" style="text-align: center;">Nenhuma venda encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = pageSales.map(sale => `
        <tr>
            <td>${escapeHTML(sale.observacoes)}</td>
            <td>${escapeHTML(sale.proposta)}</td>
            <td>${escapeHTML(sale.cliente)}</td>
            <td>${escapeHTML(sale.tipo)}</td>
            <td class="money-cell" style="font-weight: 700; color: var(--success);">${sale.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td>${new Date(sale.data).toLocaleDateString('pt-BR')}</td>
            <td>${escapeHTML(sale.executante)}</td>
            <td><span class="badge badge-primary">${escapeHTML(sale.numeroNota)}</span></td>
            <td class="money-cell" style="font-weight: 600; color: var(--text-secondary);">${sale.valor2 ? sale.valor2.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
            <td>${getPaymentBadgeHTML(sale)}</td>
            <td>${sale.vencimentoBoleto ? new Date(sale.vencimentoBoleto + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
            <td style="font-weight: 600;">${escapeHTML(sale.vendedorNome)}</td>
            <td class="actions-column">
                <div class="actions-cell-wrapper">
                    ${sale.formaPagamento === 'Boleto' && sale.status === 'Pendente' ? `
                        <button class="action-btn action-btn-success btn-pay-boleto" data-id="${sale.id}" title="Marcar Boleto como Pago">
                            <i data-lucide="check"></i>
                        </button>

                    ` : ''}
                    ${((sale.tipo && (sale.tipo.toLowerCase() === 'proposta' || sale.tipo.toLowerCase() === 'orçamento' || sale.tipo.toLowerCase() === 'orcamento')) || (sale.proposta && (!sale.numeroNota || sale.numeroNota === '-' || sale.numeroNota.trim() === ''))) ? `
                        <button class="action-btn btn-convert-proposal btn-convert-sale-proposal" data-id="${sale.id}" title="Transformar Proposta em Venda">
                            <i data-lucide="shopping-cart"></i>
                        </button>
                    ` : ''}
                    <button class="action-btn action-btn-danger btn-delete-sale" data-id="${sale.id}" title="Excluir Venda">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();

    // Atribui cliques de confirmação de pagamento do boleto
    tbody.querySelectorAll('.btn-pay-boleto').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const sales = getSales();
            const sale = sales.find(s => s.id === id);
            if (!sale) return;

            const nextBoletoIndex = (sale.boletosPagos || 0) + 1;
            const total = sale.quantidadeBoletos || 1;
            
            let message = '';
            if (nextBoletoIndex === total) {
                message = `Tem certeza de que deseja confirmar o pagamento do ÚLTIMO boleto (parcela ${nextBoletoIndex} de ${total})? Isso quitará totalmente esta venda.`;
            } else {
                message = `Tem certeza de que deseja confirmar o pagamento do boleto (parcela ${nextBoletoIndex} de ${total})? Após confirmar, o sistema passará a monitorar o vencimento da parcela ${nextBoletoIndex + 1} de ${total}.`;
            }

            openConfirmModal(
                'Confirmar Pagamento de Parcela',
                message,
                () => {
                    const result = payNextBoleto(id);
                    if (result && result.success) {
                        if (result.isFullyPaid) {
                            showToast('Venda Quitada', `Todas as ${total} parcelas da Nota Fiscal Nº ${sale.numeroNota} foram quitadas.`, 'success');
                        } else {
                            showToast('Parcela Paga', `Boleto ${result.paidCount} de ${result.totalCount} confirmado como pago. Próxima parcela pendente registrada.`, 'success');
                        }
                        refreshSalesPage();
                    } else {
                        showToast('Erro', 'Não foi possível confirmar o pagamento da parcela.', 'danger');
                    }
                }
            );
        });
    });



    // Atribui cliques de exclusão
    tbody.querySelectorAll('.btn-delete-sale').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            openConfirmModal(
                'Confirmar Exclusão',
                `Tem certeza que deseja excluir a venda de ID ${id.replace('venda_', '')}? Essa ação é definitiva e atualizará os relatórios.`,
                () => {
                    if (deleteSale(id)) {
                        showToast('Venda Excluída', 'O registro foi removido com sucesso.', 'success');
                        refreshSalesPage();
                    } else {
                        showToast('Erro', 'Não foi possível excluir o registro.', 'danger');
                    }
                }
            );
        });
    });

    // Atribui cliques de conversão de proposta em venda
    tbody.querySelectorAll('.btn-convert-sale-proposal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const sales = getSales();
            const sale = sales.find(s => s.id === id);
            if (sale) {
                openConvertProposalModal(sale);
            }
        });
    });
}

/**
 * Atualiza a tela de Vendedores (Lista e Formulário) (RF02)
 */
function refreshSellersPage() {
    const sellers = getSellers();
    const sales = getSales();
    const tbody = document.getElementById('sellers-list-tbody');
    
    if (!tbody) return;

    if (sellers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center" style="text-align: center;">Nenhum vendedor cadastrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = sellers.map(seller => {
        // Métricas rápidas por vendedor
        const sellerSales = sales.filter(s => s.vendedorId === seller.id);
        const count = sellerSales.length;
        const total = sellerSales.reduce((sum, s) => sum + s.valor, 0);
        const statusBadgeClass = seller.status === 'Ativo' ? 'badge-success' : 'badge-danger';
        const goalVal = seller.goal || 5000;

        return `
            <tr>
                <td style="font-weight: 600;">${escapeHTML(seller.name)}</td>
                <td>${escapeHTML(seller.email)}</td>
                <td>${escapeHTML(seller.phone || '-')}</td>

                <td style="font-weight: 600; text-align: center;">${count}</td>
                <td class="money-cell" style="font-weight: 700; color: var(--success);">${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td><span class="badge ${statusBadgeClass}">${escapeHTML(seller.status)}</span></td>
                <td class="actions-column">
                    <div class="actions-cell-wrapper">
                        <button class="action-btn btn-edit-seller" data-id="${seller.id}" title="Editar Vendedor">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="action-btn action-btn-danger btn-delete-seller" data-id="${seller.id}" title="Excluir Vendedor">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();

    // Eventos de Edição
    tbody.querySelectorAll('.btn-edit-seller').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const seller = sellers.find(s => s.id === id);
            if (seller) {
                const elId = document.getElementById('seller-id-edit');
                if (elId) elId.value = seller.id;
                const elName = document.getElementById('seller-name');
                if (elName) elName.value = seller.name;
                const elEmail = document.getElementById('seller-email');
                if (elEmail) elEmail.value = seller.email;
                const elPhone = document.getElementById('seller-phone');
                if (elPhone) elPhone.value = seller.phone;
                const elStatus = document.getElementById('seller-status');
                if (elStatus) elStatus.value = seller.status;

                
                const elTitle = document.getElementById('title-form-vendedor');
                if (elTitle) elTitle.textContent = 'Editar Vendedor';
                const elBtnText = document.getElementById('btn-seller-submit-text');
                if (elBtnText) elBtnText.textContent = 'Salvar Alterações';
                const elCancelBtn = document.getElementById('btn-cancel-edit-seller');
                if (elCancelBtn) elCancelBtn.classList.remove('hidden');
                
                showToast('Modo de Edição', `Editando dados de ${seller.name}.`, 'info');
            }
        });
    });

    // Eventos de Exclusão
    tbody.querySelectorAll('.btn-delete-seller').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const seller = sellers.find(s => s.id === id);
            if (seller) {
                openConfirmModal(
                    'Confirmar Exclusão',
                    `Tem certeza que deseja excluir o vendedor ${seller.name}? Ele será removido do cadastro de ativos, mas suas vendas serão mantidas no histórico de relatórios.`,
                    () => {
                        if (deleteSeller(id)) {
                            showToast('Vendedor Removido', `O vendedor ${seller.name} foi removido com sucesso.`, 'success');
                            refreshSellersPage();
                        } else {
                            showToast('Erro', 'Não foi possível excluir o vendedor.', 'danger');
                        }
                    }
                );
            }
        });
    });
}

/**
 * Reseta o formulário de cadastro de vendedores
 */
function resetSellerForm() {
    const sellerForm = document.getElementById('seller-form');
    if (sellerForm) sellerForm.reset();
    
    const sellerIdEdit = document.getElementById('seller-id-edit');
    if (sellerIdEdit) sellerIdEdit.value = '';
    
    const titleFormVendedor = document.getElementById('title-form-vendedor');
    if (titleFormVendedor) titleFormVendedor.textContent = 'Cadastrar Vendedor';
    
    const btnSellerSubmitText = document.getElementById('btn-seller-submit-text');
    if (btnSellerSubmitText) btnSellerSubmitText.textContent = 'Cadastrar Vendedor';
    
    const btnCancelEditSeller = document.getElementById('btn-cancel-edit-seller');
    if (btnCancelEditSeller) btnCancelEditSeller.classList.add('hidden');


}

/**
 * Atualiza a tela de Relatórios (Histórico de Consolidação)
 */
function refreshReportsPage() {
    const sales = getSales();
    const sellers = getSellers();
    
    const consolidated = getConsolidatedSellersMetrics(sales, sellers);
    const tbody = document.getElementById('reports-consolidation-tbody');

    if (!tbody) return;

    if (consolidated.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center" style="text-align: center;">Nenhum faturamento consolidado.</td></tr>`;
    } else {
        tbody.innerHTML = consolidated.map(item => `
            <tr>
                <td style="font-weight: 600;">${escapeHTML(item.name)}</td>
                <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
                <td class="money-cell" style="font-weight: 700; color: var(--success);">${item.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td style="font-weight: 600;">${item.percentage.toFixed(1)}%</td>
                <td class="money-cell" style="color: var(--info); font-weight: 600;">${item.averageTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
        `).join('');
    }

    refreshPaymentMethodsList();
    renderFinancialCalendar();
    populateSystemSettingsInForm();
    updateCloudBadge();
}

/**
 * Simula a notificação de confirmação ao cliente de maneira interativa (RF04)
 */
function simulateCustomerNotification(sale) {
    const escapedCliente = escapeHTML(sale.cliente);
    const escapedNota = escapeHTML(sale.numeroNota);
    const escapedVendedor = escapeHTML(sale.vendedorNome);
    const escapedPagamento = escapeHTML(sale.formaPagamento);

    // 1. Emite o toast sonoro e visual
    showToast(
        'Notificação Enviada!',
        `Confirmação enviada simuladamente ao cliente <strong>${escapedCliente}</strong> sobre a Nota Fiscal Nº <strong>${escapedNota}</strong> via e-mail e WhatsApp.`,
        'info',
        6000
    );

    // 2. Registra log detalhado na auditoria
    console.log(`[RF04 - NOTIFICAÇÃO DO CLIENTE]
    Enviado para: ${escapedCliente}
    Mensagem: Olá ${escapedCliente}, sua nota fiscal Nº "${escapedNota}" no valor de R$ ${sale.valor.toFixed(2)} com o vendedor ${escapedVendedor} foi registrada com sucesso! Forma de Pagamento: ${escapedPagamento}.
    Status do Envio: SUCESSO (Simulado via Browser Push e Logs)
    Timestamp: ${new Date().toISOString()}`);
}

/**
 * Liga todos os eventos de clique, envio e alteração da UI (Event Binding)
 */
export function bindUIEvents() {
    
    // --- SIDEBAR LINKS VIEWS NAVIGATION ---
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            navigateTo(view);
        });
    });

    // Hamburguer Mobile Toggle
    document.getElementById('btn-mobile-toggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('active');
    });

    // Botão de Dashboard Vendas "Ver todas"
    document.getElementById('btn-dashboard-go-sales')?.addEventListener('click', () => {
        navigateTo('vendas');
    });

    // --- FORM DE VENDEDORES (CADASTRO / EDIÇÃO) ---
    const sellerForm = document.getElementById('seller-form');
    sellerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const idEdit = document.getElementById('seller-id-edit')?.value || '';
        const name = (document.getElementById('seller-name')?.value || '').trim();
        const email = (document.getElementById('seller-email')?.value || '').trim();
        const phone = (document.getElementById('seller-phone')?.value || '').trim();
        const status = document.getElementById('seller-status')?.value || 'Ativo';

        if (idEdit) {
            // Edição
            if (updateSeller(idEdit, name, email, phone, status)) {
                showToast('Cadastro Atualizado', `Vendedor ${name} foi atualizado com sucesso.`, 'success');
                resetSellerForm();
                refreshSellersPage();
            } else {
                showToast('Erro', 'Não foi possível atualizar o vendedor.', 'danger');
            }
        } else {
            // Cadastro novo
            const newSel = addSeller(name, email, phone, status);
            if (newSel) {
                showToast('Vendedor Cadastrado', `${name} foi adicionado à equipe.`, 'success');
                resetSellerForm();
                refreshSellersPage();
            } else {
                showToast('Erro', 'Não foi possível cadastrar o vendedor.', 'danger');
            }
        }
    });

    // Cancelar Edição
    document.getElementById('btn-cancel-edit-seller')?.addEventListener('click', resetSellerForm);

    // --- FORM DE VENDAS ---
    // Mostrar/ocultar data de vencimento e quantidade se pagamento for Boleto
    const selectPagamento = document.getElementById('sale-pagamento');
    const groupBoleto = document.getElementById('group-boleto-container');
    const inputVencimento = document.getElementById('sale-vencimento');
    const inputQuantidade = document.getElementById('sale-quantidade-boleto');
    const inputValor = document.getElementById('sale-valor');
    const previewContainer = document.getElementById('boleto-division-preview');
    const previewSpan = document.getElementById('boleto-division-value');

    function updateBoletoDivisionPreview() {
        if (selectPagamento?.value === 'Boleto' && inputValor && inputQuantidade) {
            const valorTotal = parseFloat(inputValor.value) || 0;
            const qtdBoletos = parseInt(inputQuantidade.value) || 1;
            
            if (valorTotal > 0 && qtdBoletos >= 1) {
                const valorCada = valorTotal / qtdBoletos;
                const formattedCada = valorCada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                
                if (previewContainer && previewSpan) {
                    previewSpan.textContent = `${qtdBoletos}x de ${formattedCada}`;
                    previewContainer.style.display = 'block';
                }
            } else {
                if (previewContainer) previewContainer.style.display = 'none';
            }
        } else {
            if (previewContainer) previewContainer.style.display = 'none';
        }
    }

    selectPagamento?.addEventListener('change', (e) => {
        if (e.target.value === 'Boleto') {
            groupBoleto?.classList.remove('hidden');
            inputVencimento?.setAttribute('required', 'true');
            inputQuantidade?.setAttribute('required', 'true');
            
            // Define vencimento padrão como 3 dias a partir de hoje
            const d = new Date();
            d.setDate(d.getDate() + 3);
            inputVencimento.value = d.toISOString().split('T')[0];
            inputQuantidade.value = '1';
        } else {
            groupBoleto?.classList.add('hidden');
            inputVencimento?.removeAttribute('required');
            inputQuantidade?.removeAttribute('required');
            inputVencimento.value = '';
            inputQuantidade.value = '1';
        }
        updateBoletoDivisionPreview();
    });

    inputValor?.addEventListener('input', updateBoletoDivisionPreview);
    inputQuantidade?.addEventListener('input', updateBoletoDivisionPreview);

    const saleForm = document.getElementById('sale-form');
    saleForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const vendedorId = document.getElementById('sale-vendedor')?.value || '';
        const cliente = document.getElementById('sale-cliente')?.value.trim() || '';
        const tipo = document.getElementById('sale-tipo')?.value.trim() || 'Venda';
        const proposta = document.getElementById('sale-proposta')?.value.trim() || '';
        const executante = document.getElementById('sale-executante')?.value.trim() || '';
        const nota = document.getElementById('sale-nota')?.value.trim() || '';
        const valor = document.getElementById('sale-valor')?.value || '0';
        const valor2Val = document.getElementById('sale-valor2')?.value || '';
        const valor2 = valor2Val ? parseFloat(valor2Val) : null;
        const dataVal = document.getElementById('sale-data')?.value || '';
        const pagamento = document.getElementById('sale-pagamento')?.value || '';
        const vencimento = document.getElementById('sale-vencimento')?.value || '';
        const quantidade = document.getElementById('sale-quantidade-boleto')?.value || '1';
        const obs = document.getElementById('sale-obs')?.value.trim() || '';
        const obs2 = document.getElementById('sale-obs2')?.value.trim() || '';

        try {
            const newSale = addSale(
                vendedorId, cliente, nota, valor, dataVal, pagamento, obs,
                vencimento, quantidade, proposta, tipo, executante, valor2, obs2
            );
            if (newSale) {
                showToast('Venda Registrada', `A venda de Nota Fiscal Nº ${nota} no valor de R$ ${parseFloat(valor).toFixed(2)} foi inserida.`, 'success');
                
                // Dispara o RF04 (Notificar cliente)
                simulateCustomerNotification(newSale);
                
                // Reseta formulário mantendo a data atual e ocultando os detalhes do boleto
                saleForm.reset();
                groupBoleto?.classList.add('hidden');
                inputVencimento?.removeAttribute('required');
                inputQuantidade?.removeAttribute('required');
                if (previewContainer) previewContainer.style.display = 'none';
                
                // Redefine valor padrão para o tipo
                const saleTipoInput = document.getElementById('sale-tipo');
                if (saleTipoInput) saleTipoInput.value = 'Venda';
                
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                const saleDataInput = document.getElementById('sale-data');
                if (saleDataInput) saleDataInput.value = (new Date(now - offset)).toISOString().slice(0, 16);
                
                refreshSalesPage();
            }
        } catch (error) {
            showToast('Erro no Lançamento', error.message, 'danger');
        }
    });

    // --- FILTROS DE HISTÓRICO DE VENDAS ---
    document.getElementById('filter-search-input')?.addEventListener('input', () => {
        salesPage = 1;
        applySalesFilters();
    });
    
    document.getElementById('filter-vendedor')?.addEventListener('change', () => {
        salesPage = 1;
        applySalesFilters();
    });
    
    document.getElementById('filter-data-inicio')?.addEventListener('change', () => {
        salesPage = 1;
        applySalesFilters();
    });
    
    document.getElementById('filter-data-fim')?.addEventListener('change', () => {
        salesPage = 1;
        applySalesFilters();
    });

    // Botão Limpar Filtros
    document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
        const fSearch = document.getElementById('filter-search-input');
        if (fSearch) fSearch.value = '';
        
        const fVendedor = document.getElementById('filter-vendedor');
        if (fVendedor) fVendedor.value = 'todos';
        
        const fDataInicio = document.getElementById('filter-data-inicio');
        if (fDataInicio) fDataInicio.value = '';
        
        const fDataFim = document.getElementById('filter-data-fim');
        if (fDataFim) fDataFim.value = '';
        
        salesPage = 1;
        applySalesFilters();
        showToast('Filtros Limpos', 'A listagem está mostrando todas as vendas.', 'info');
    });

    // --- PAGINAÇÃO DE VENDAS ---
    document.getElementById('btn-page-prev')?.addEventListener('click', () => {
        if (salesPage > 1) {
            salesPage--;
            renderSalesTable();
        }
    });

    document.getElementById('btn-page-next')?.addEventListener('click', () => {
        const totalRecords = filteredSalesList.length;
        const totalPages = Math.ceil(totalRecords / salesPageSize);
        if (salesPage < totalPages) {
            salesPage++;
            renderSalesTable();
        }
    });

    // --- EVENTOS DO MODAL DE CONFIRMAÇÃO ---
    document.getElementById('btn-modal-cancel')?.addEventListener('click', closeConfirmModal);
    document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
        if (activeModalConfirmCallback) {
            activeModalConfirmCallback();
        }
        closeConfirmModal();
    });

    // --- EXPORTAÇÃO E IMPRESSÃO (REPORTS) ---
    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
        try {
            // Exporta as vendas filtradas no momento para maior flexibilidade
            exportToExcel(filteredSalesList);
            showToast('Sucesso', 'Planilha exportada com sucesso.', 'success');
        } catch (e) {
            showToast('Erro na Exportação', e.message, 'danger');
        }
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
        showToast('Impressora Acionada', 'Formatando folha de impressão e abrindo janela...', 'info');
        setTimeout(() => {
            exportToPDF();
        }, 500);
    });

    // --- BACKUP E LIMPEZA DE DADOS (DB) ---
    document.getElementById('btn-backup-export')?.addEventListener('click', () => {
        const encryptedData = exportBackup();
        if (encryptedData) {
            const blob = new Blob([encryptedData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'salesmonitor_backup.json');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showToast('Backup Concluído', 'O arquivo de backup criptografado foi gerado.', 'success');
        } else {
            showToast('Erro', 'Sessão inválida. Não foi possível exportar.', 'danger');
        }
    });

    // Importação de Backup
    const backupFileInput = document.getElementById('backup-import-file');
    backupFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const encryptedJsonStr = evt.target.result;
            
            // Solicita a senha para tentar abrir o backup
            const promptPassword = prompt('Digite a senha de criptografia do backup para restaurar os dados:');
            if (promptPassword === null) return; // cancelou

            if (importBackup(encryptedJsonStr, promptPassword)) {
                showToast('Backup Restaurado', 'O banco de dados foi carregado e descriptografado.', 'success');
                // Atualiza sessão visual se necessário
                document.getElementById('session-username').textContent = localStorage.getItem('last_logged_user') || 'Admin';
                navigateTo('dashboard');
            } else {
                showToast('Falha na Importação', 'A senha informada está incorreta ou o arquivo de backup é inválido.', 'danger');
            }
            // Limpa o input file
            backupFileInput.value = '';
        };
        reader.readAsText(file);
    });

    // Limpar Banco de Dados
    document.getElementById('btn-clear-db')?.addEventListener('click', () => {
        openConfirmModal(
            'Zerar Banco de Dados',
            'ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os lançamentos de vendas e vendedores cadastrados, retornando o sistema aos dados iniciais padrão. Confirma?',
            () => {
                clearDatabase();
                showToast('Banco Limpo', 'Os dados de fábrica foram reinstaurados com sucesso.', 'success');
                navigateTo('dashboard');
            }
        );
    });

    // --- TEMA E DATA ATUAL ---
    // Coloca a data atual no cabeçalho
    const headerDateSpan = document.getElementById('header-date');
    if (headerDateSpan) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        headerDateSpan.textContent = new Date().toLocaleDateString('pt-BR', options);
    }

    // Toggle de Tema
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
        const body = document.body;
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            showToast('Tema Claro', 'A interface foi alterada para o tema claro.', 'info');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            showToast('Tema Escuro', 'A interface foi alterada para o tema escuro.', 'info');
        }
        
        // Atualiza gráficos com as novas cores de tema
        const sales = getSales();
        const sellers = getSellers();
        const completedSales = sales.filter(s => {
            const isProp = (s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) ||
                           (s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === ''));
            return !isProp;
        });
        updateCharts(completedSales, sellers);
    });

    // Toggle de Modo Privacidade (Ocultar Valores Sensíveis)
    document.getElementById('btn-privacy-toggle')?.addEventListener('click', () => {
        const body = document.body;
        const isPrivacyActive = body.classList.toggle('privacy-mode-active');
        
        const openIcon = document.querySelector('.privacy-open-icon');
        const closedIcon = document.querySelector('.privacy-closed-icon');
        
        if (isPrivacyActive) {
            openIcon?.classList.add('hidden');
            closedIcon?.classList.remove('hidden');
            showToast('Modo Privacidade', 'Valores financeiros foram ocultados da tela por segurança.', 'warning');
        } else {
            openIcon?.classList.remove('hidden');
            closedIcon?.classList.add('hidden');
            showToast('Modo Privacidade', 'Valores financeiros estão visíveis novamente.', 'info');
        }
    });

    // --- ALTERNAR VISUALIZAÇÃO DE HISTÓRICO (TABELA VS KANBAN) ---
    document.getElementById('btn-view-table')?.addEventListener('click', (e) => {
        activeSalesView = 'table';
        document.getElementById('btn-view-table').classList.add('active');
        document.getElementById('btn-view-kanban').classList.remove('active');
        document.querySelector('.table-panel .table-responsive').classList.remove('hidden');
        document.querySelector('.table-panel .table-footer-meta').classList.remove('hidden');
        document.getElementById('sales-kanban-board').classList.add('hidden');
        renderSalesTable();
    });

    document.getElementById('btn-view-kanban')?.addEventListener('click', (e) => {
        activeSalesView = 'kanban';
        document.getElementById('btn-view-table').classList.remove('active');
        document.getElementById('btn-view-kanban').classList.add('active');
        document.querySelector('.table-panel .table-responsive').classList.add('hidden');
        document.querySelector('.table-panel .table-footer-meta').classList.add('hidden');
        document.getElementById('sales-kanban-board').classList.remove('hidden');
        renderSalesKanban();
    });

    // --- CONTROLES DO CALENDÁRIO FINANCEIRO ---
    document.getElementById('btn-calendar-prev')?.addEventListener('click', () => {
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
        renderFinancialCalendar();
    });

    document.getElementById('btn-calendar-next')?.addEventListener('click', () => {
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
        renderFinancialCalendar();
    });

    // --- CONFIGURAÇÕES DO SISTEMA (FORM SUBMIT) ---
    const settingsForm = document.getElementById('system-settings-form');
    settingsForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const pixKey = document.getElementById('settings-pix-key')?.value || '';
        const webhookUrl = document.getElementById('settings-webhook-url')?.value || '';
        if (updateSystemSettings(pixKey, webhookUrl)) {
            showToast('Configurações Salvas', 'Os dados de cobrança e webhook foram atualizados.', 'success');
            updateCloudBadge();
        } else {
            showToast('Erro', 'Não foi possível salvar as configurações.', 'danger');
        }
    });

    // --- STATUS WEBHOOK SINC ---
    window.addEventListener('webhook-backup-status', (e) => {
        const badge = document.getElementById('cloud-sync-badge');
        if (!badge) return;
        
        const okIcon = badge.querySelector('.cloud-ok-icon');
        const syncIcon = badge.querySelector('.cloud-sync-icon');
        const offIcon = badge.querySelector('.cloud-off-icon');
        
        okIcon.classList.add('hidden');
        syncIcon.classList.add('hidden');
        offIcon.classList.add('hidden');
        
        if (e.detail.success) {
            okIcon.classList.remove('hidden');
            badge.style.color = 'var(--success)';
            badge.setAttribute('title', 'Nuvem Sincronizada');
        } else {
            syncIcon.classList.remove('hidden');
            badge.style.color = 'var(--warning)';
            badge.setAttribute('title', 'Erro ao Sincronizar Webhook');
        }
    });

    // --- ALTERNAR TIPO DE GRÁFICO DE PERÍODO (LINHA VS BARRAS) ---
    document.getElementById('btn-chart-periodo-line')?.addEventListener('click', () => {
        setChartPeriodoType('line');
        document.getElementById('btn-chart-periodo-line').classList.add('active');
        document.getElementById('btn-chart-periodo-bar').classList.remove('active');
    });

    document.getElementById('btn-chart-periodo-bar')?.addEventListener('click', () => {
        setChartPeriodoType('bar');
        document.getElementById('btn-chart-periodo-line').classList.remove('active');
        document.getElementById('btn-chart-periodo-bar').classList.add('active');
    });

    // Fecha o menu lateral móvel ao clicar fora dele
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        const mobileToggle = document.getElementById('btn-mobile-toggle');
        
        if (sidebar && sidebar.classList.contains('active')) {
            // Se o clique foi fora do menu lateral E fora do botão de hambúrguer que o abre
            if (!sidebar.contains(e.target) && !mobileToggle?.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });

    // --- GERENCIAMENTO DINÂMICO DE OBRIGATORIEDADE DA NF ---
    const inputTipo = document.getElementById('sale-tipo');
    const inputNota = document.getElementById('sale-nota');
    const asteriskNota = inputNota?.closest('.input-group')?.querySelector('.required');

    const updateNotaRequiredState = () => {
        if (inputTipo && inputNota) {
            const val = inputTipo.value.trim().toLowerCase();
            if (val === 'proposta' || val === 'orçamento' || val === 'orcamento') {
                inputNota.removeAttribute('required');
                if (asteriskNota) asteriskNota.style.display = 'none';
            } else {
                inputNota.setAttribute('required', 'true');
                if (asteriskNota) asteriskNota.style.display = 'inline';
            }
        }
    };

    inputTipo?.addEventListener('input', updateNotaRequiredState);
    inputTipo?.addEventListener('change', updateNotaRequiredState);
    
    // Executa uma vez no início para alinhar com o valor inicial
    updateNotaRequiredState();

    // --- EVENTOS DO MODAL DE CONVERSÃO DE PROPOSTA ---
    document.getElementById('btn-convert-cancel')?.addEventListener('click', closeConvertProposalModal);
    triggerConvertBoletoDetails();
    
    const convertProposalForm = document.getElementById('convert-proposal-form');
    convertProposalForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const proposalId = document.getElementById('convert-proposal-id').value;
        const saleNota = document.getElementById('convert-sale-nota').value.trim();
        const finalPagamento = document.getElementById('convert-sale-pagamento').value;
        const quantidadeBoletos = document.getElementById('convert-sale-quantidade-boleto')?.value || '1';
        const vencimentoBoleto = document.getElementById('convert-sale-vencimento')?.value || '';
        const saleValor2 = document.getElementById('convert-sale-valor2')?.value || '';

        try {
            const newSale = convertExistingProposalToSale(
                proposalId, saleNota, finalPagamento, quantidadeBoletos, vencimentoBoleto, saleValor2
            );
            if (newSale) {
                showToast('Conversão Concluída', `A proposta foi convertida em Venda com sucesso! NF: ${saleNota}`, 'success');
                closeConvertProposalModal();
                refreshSalesPage();
            }
        } catch (error) {
            showToast('Erro na Conversão', error.message, 'danger');
        }
    });

    // --- FORM DE ADICIONAR FORMA DE PAGAMENTO ---
    const addPaymentForm = document.getElementById('add-payment-method-form');
    addPaymentForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('new-payment-method-input');
        const name = input?.value.trim() || '';
        
        if (name) {
            if (addPaymentMethod(name)) {
                showToast('Sucesso', `Forma de pagamento "${name}" adicionada.`, 'success');
                input.value = '';
                refreshPaymentMethodsList();
                // Atualiza dropdowns abertos
                refreshSalesPage();
            } else {
                showToast('Aviso', 'Forma de pagamento já cadastrada ou inválida.', 'warning');
            }
        }
    });
}

/**
 * Abre o modal de conversão de proposta em venda
 */
/**
 * Abre o modal de conversão de proposta em venda
 */
function openConvertProposalModal(proposal) {
    const modal = document.getElementById('convert-proposal-modal');
    if (!modal) return;

    document.getElementById('convert-proposal-id').value = proposal.id;
    document.getElementById('convert-proposal-client').textContent = proposal.cliente;
    document.getElementById('convert-proposal-value').textContent = proposal.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // Reseta inputs do modal
    const inputNota = document.getElementById('convert-sale-nota');
    if (inputNota) {
        inputNota.value = '';
    }

    // Popula seletores de pagamento no modal
    const selectPagamento = document.getElementById('convert-sale-pagamento');
    if (selectPagamento) {
        const methods = getPaymentMethods();
        selectPagamento.innerHTML = '<option value="" disabled selected>Selecione o pagamento</option>' +
            methods.map(m => `<option value="${m}">${escapeHTML(m)}</option>`).join('');
        // Prefila com a forma sugerida na proposta se houver
        if (proposal.formaPagamento && methods.includes(proposal.formaPagamento)) {
            selectPagamento.value = proposal.formaPagamento;
        } else {
            selectPagamento.value = '';
        }
    }

    // Prefila vencimento e quantidade caso venha da proposta como Boleto
    const inputVencimento = document.getElementById('convert-sale-vencimento');
    if (inputVencimento) {
        inputVencimento.value = proposal.vencimentoBoleto || '';
    }

    const inputQuantidade = document.getElementById('convert-sale-quantidade-boleto');
    if (inputQuantidade) {
        inputQuantidade.value = proposal.quantidadeBoletos || '1';
    }

    const inputValor2 = document.getElementById('convert-sale-valor2');
    if (inputValor2) {
        inputValor2.value = proposal.valor2 || '';
    }

    // Dispara manualmente um evento de change para configurar a visibilidade inicial dos campos
    if (selectPagamento) {
        selectPagamento.dispatchEvent(new Event('change'));
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeConvertProposalModal() {
    const modal = document.getElementById('convert-proposal-modal');
    if (modal) modal.classList.add('hidden');
}

function triggerConvertBoletoDetails() {
    const selectPagamento = document.getElementById('convert-sale-pagamento');
    const groupBoleto = document.getElementById('convert-group-boleto-container');
    const inputVencimento = document.getElementById('convert-sale-vencimento');
    const inputQuantidade = document.getElementById('convert-sale-quantidade-boleto');
    const previewContainer = document.getElementById('convert-boleto-division-preview');
    const previewSpan = document.getElementById('convert-boleto-division-value');
    
    const updateConvertBoletoPreview = () => {
        const valTotalStr = document.getElementById('convert-proposal-value').textContent;
        const valTotal = parseFloat(valTotalStr.replace(/[^\d]/g, '')) / 100 || 0;
        const qtdBoletos = parseInt(inputQuantidade?.value) || 1;
        
        if (qtdBoletos >= 1 && valTotal > 0) {
            const valorCada = valTotal / qtdBoletos;
            const formattedCada = valorCada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            if (previewContainer && previewSpan) {
                previewSpan.textContent = `${qtdBoletos}x de ${formattedCada}`;
                previewContainer.style.display = 'block';
            }
        } else {
            if (previewContainer) previewContainer.style.display = 'none';
        }
    };

    selectPagamento?.addEventListener('change', (e) => {
        if (e.target.value === 'Boleto') {
            groupBoleto?.classList.remove('hidden');
            inputVencimento?.setAttribute('required', 'true');
            inputQuantidade?.setAttribute('required', 'true');
            
            // Define data padrão de hoje + 3 dias apenas se estiver vazio
            if (inputVencimento && !inputVencimento.value) {
                const d = new Date();
                d.setDate(d.getDate() + 3);
                inputVencimento.value = d.toISOString().split('T')[0];
            }
            // Garante quantidade mínima se vazio ou zero
            if (inputQuantidade && (!inputQuantidade.value || inputQuantidade.value === '0')) {
                inputQuantidade.value = '1';
            }
        } else {
            groupBoleto?.classList.add('hidden');
            inputVencimento?.removeAttribute('required');
            inputQuantidade?.removeAttribute('required');
            if (inputVencimento) inputVencimento.value = '';
            if (inputQuantidade) inputQuantidade.value = '1';
        }
        updateConvertBoletoPreview();
    });

    inputQuantidade?.addEventListener('input', updateConvertBoletoPreview);
}

/**
 * Atualiza o painel de Gerenciamento de Formas de Pagamento na tela de relatórios
 */
function refreshPaymentMethodsList() {
    const listEl = document.getElementById('payment-methods-list');
    if (!listEl) return;

    const methods = getPaymentMethods();
    if (methods.length === 0) {
        listEl.innerHTML = `<li class="text-muted text-center" style="padding: 10px; font-style: italic;">Nenhuma forma de pagamento registrada.</li>`;
        return;
    }

    listEl.innerHTML = methods.map(method => `
        <li class="payment-method-item" style="margin-bottom: 8px;">
            <span>${escapeHTML(method)}</span>
            <button type="button" class="btn-delete-payment-method" data-method="${escapeHTML(method)}" title="Excluir forma de pagamento">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
        </li>
    `).join('');

    lucide.createIcons();

    // Eventos de exclusão de formas de pagamento
    listEl.querySelectorAll('.btn-delete-payment-method').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const method = e.currentTarget.dataset.method;
            // Evita deletar boleto pois tem lógica especial de parcelamento
            if (method === 'Boleto') {
                showToast('Ação Bloqueada', 'A forma de pagamento "Boleto" não pode ser removida pois possui integrações específicas de controle de vencimento no sistema.', 'warning');
                return;
            }

            openConfirmModal(
                'Remover Forma de Pagamento',
                `Tem certeza que deseja remover a forma de pagamento "${method}"? Novos registros não poderão utilizá-la, mas dados históricos serão preservados.`,
                () => {
                    if (deletePaymentMethod(method)) {
                        showToast('Sucesso', `Forma de pagamento "${method}" removida.`, 'success');
                        refreshPaymentMethodsList();
                        // Atualiza dropdowns abertos
                        refreshSalesPage();
                    } else {
                        showToast('Erro', 'Não foi possível remover a forma de pagamento.', 'danger');
                    }
                }
            );
        });
    });
}

/**
 * Atualiza os datalists globais para autocompletar inputs
 */
function updateAutocompletes() {
    const sales = getSales();
    const sellers = getSellers();

    // 1. Clientes únicos
    const clients = new Set();
    sales.forEach(s => { if (s.cliente) clients.add(s.cliente); });
    const dlClients = document.getElementById('clients-list');
    if (dlClients) {
        dlClients.innerHTML = Array.from(clients).map(c => `<option value="${escapeHTML(c)}">`).join('');
    }

    // 2. Executantes únicos (inclui vendedores ativos por padrão como sugestão)
    const executants = new Set();
    sellers.filter(s => s.status === 'Ativo').forEach(s => executants.add(s.name));
    sales.forEach(s => { if (s.executante) executants.add(s.executante); });
    const dlExecutants = document.getElementById('executants-list');
    if (dlExecutants) {
        dlExecutants.innerHTML = Array.from(executants).map(e => `<option value="${escapeHTML(e)}">`).join('');
    }

    // 3. Tipos únicos
    const types = new Set(["Venda", "Serviço", "Orçamento", "Proposta"]);
    sales.forEach(s => { if (s.tipo) types.add(s.tipo); });
    const dlTypes = document.getElementById('types-list');
    if (dlTypes) {
        dlTypes.innerHTML = Array.from(types).map(t => `<option value="${escapeHTML(t)}">`).join('');
    }
}

function renderSalesKanban() {
    const listProposal = document.getElementById('kanban-list-proposal');
    const listPending = document.getElementById('kanban-list-pending');
    const listCompleted = document.getElementById('kanban-list-completed');
    
    if (!listProposal || !listPending || !listCompleted) return;
    
    const proposals = filteredSalesList.filter(s => 
        (s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) ||
        (s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === ''))
    );
    
    const pendings = filteredSalesList.filter(s => 
        !(s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) &&
        !(s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === '')) &&
        s.formaPagamento === 'Boleto' && s.status === 'Pendente'
    );
    
    const completed = filteredSalesList.filter(s => 
        !(s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) &&
        !(s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === '')) &&
        !(s.formaPagamento === 'Boleto' && s.status === 'Pendente')
    );
    
    document.getElementById('kanban-count-proposal').textContent = proposals.length;
    document.getElementById('kanban-count-pending').textContent = pendings.length;
    document.getElementById('kanban-count-completed').textContent = completed.length;
    
    const renderColumnCards = (cards, listEl, type) => {
        if (cards.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; padding: 20px; font-style:italic; font-size:0.8rem; color:var(--text-muted);">Nenhum cartão</div>`;
            return;
        }
        listEl.innerHTML = cards.map(sale => {
            const formattedVal = sale.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const dateStr = new Date(sale.data).toLocaleDateString('pt-BR');
            
            let actionsHtml = '';
            if (type === 'proposal') {
                actionsHtml = `
                    <button class="action-btn btn-convert-proposal btn-convert-sale-proposal" data-id="${sale.id}" title="Converter em Venda" style="padding: 5px 8px;">
                        <i data-lucide="shopping-cart" style="width: 13px; height: 13px;"></i>
                    </button>
                `;
            } else if (type === 'pending') {
                actionsHtml = `
                    <button class="action-btn action-btn-success btn-pay-boleto" data-id="${sale.id}" title="Marcar Boleto como Pago" style="padding: 5px 8px;">
                        <i data-lucide="check" style="width: 13px; height: 13px;"></i>
                    </button>
                `;
            }
            


            return `
                <div class="kanban-card">
                    <div class="kanban-card-title">${escapeHTML(sale.cliente)}</div>
                    <div class="kanban-card-meta">
                        <span><strong>Valor:</strong> ${formattedVal}</span>
                        <span><strong>Vendedor:</strong> ${escapeHTML(sale.vendedorNome)}</span>
                        <span><strong>Data:</strong> ${dateStr}</span>
                        ${sale.proposta ? `<span><strong>Cód:</strong> ${escapeHTML(sale.proposta)}</span>` : ''}
                        ${sale.numeroNota ? `<span><strong>NF:</strong> ${escapeHTML(sale.numeroNota)}</span>` : ''}
                    </div>
                    <div class="kanban-card-actions">

                        ${actionsHtml}
                        <button class="action-btn action-btn-danger btn-delete-sale" data-id="${sale.id}" title="Excluir" style="padding: 5px 8px;">
                            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };
    
    renderColumnCards(proposals, listProposal, 'proposal');
    renderColumnCards(pendings, listPending, 'pending');
    renderColumnCards(completed, listCompleted, 'completed');
    
    lucide.createIcons();
    
    const attachCardEvents = (listEl) => {
        listEl.querySelectorAll('.btn-convert-sale-proposal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const sales = getSales();
                const sale = sales.find(s => s.id === id);
                if (sale) openConvertProposalModal(sale);
            });
        });
        listEl.querySelectorAll('.btn-pay-boleto').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const sales = getSales();
                const sale = sales.find(s => s.id === id);
                if (!sale) return;
                
                const nextBoletoIndex = (sale.boletosPagos || 0) + 1;
                const total = sale.quantidadeBoletos || 1;
                let message = nextBoletoIndex === total 
                    ? `Confirmar pagamento do ÚLTIMO boleto (parcela ${nextBoletoIndex} de ${total})?`
                    : `Confirmar pagamento do boleto (parcela ${nextBoletoIndex} de ${total})?`;
                    
                openConfirmModal('Confirmar Parcela', message, () => {
                    const result = payNextBoleto(id);
                    if (result && result.success) {
                        showToast('Parcela Paga', 'Pagamento confirmado.', 'success');
                        refreshSalesPage();
                    }
                });
            });
        });
        listEl.querySelectorAll('.btn-delete-sale').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openConfirmModal('Excluir', 'Tem certeza que deseja excluir?', () => {
                    if (deleteSale(id)) {
                        showToast('Excluído', 'Registro removido.', 'success');
                        refreshSalesPage();
                    }
                });
            });
        });

    };
    
    attachCardEvents(listProposal);
    attachCardEvents(listPending);
    attachCardEvents(listCompleted);
}



function renderFinancialCalendar() {
    const gridContainer = document.getElementById('financial-calendar-grid-container');
    const monthYearEl = document.getElementById('calendar-month-year');
    if (!gridContainer || !monthYearEl) return;
    
    const sales = getSales();
    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();
    
    const monthsNames = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    monthYearEl.textContent = `${monthsNames[month]} ${year}`;
    
    const boletosMap = {};
    sales.forEach(sale => {
        if (sale.formaPagamento === 'Boleto' && sale.status === 'Pendente' && sale.vencimentoBoleto) {
            const qtd = sale.quantidadeBoletos || 1;
            const pagos = sale.boletosPagos || 0;
            for (let i = pagos; i < qtd; i++) {
                const due = getBoletoDueDate(sale.vencimentoBoleto, i);
                const [dYear, dMonth, dDay] = due.split('-').map(Number);
                if (dYear === year && (dMonth - 1) === month) {
                    const valParcela = sale.valor / qtd;
                    if (!boletosMap[due]) {
                        boletosMap[due] = { total: 0, list: [] };
                    }
                    boletosMap[due].total += valParcela;
                    boletosMap[due].list.push({ sale, parcela: i + 1, totalParcelas: qtd, valor: valParcela });
                }
            }
        }
    });
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    let calendarHtml = `
        <div class="calendar-grid">
            <div class="calendar-day-header">Dom</div>
            <div class="calendar-day-header">Seg</div>
            <div class="calendar-day-header">Ter</div>
            <div class="calendar-day-header">Qua</div>
            <div class="calendar-day-header">Qui</div>
            <div class="calendar-day-header">Sex</div>
            <div class="calendar-day-header">Sáb</div>
    `;
    
    for (let i = 0; i < firstDayIndex; i++) {
        calendarHtml += `<div class="calendar-day empty"></div>`;
    }
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    for (let day = 1; day <= totalDays; day++) {
        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dayStr === todayStr;
        
        let valueHtml = '';
        let hasPending = false;
        let overdueClass = '';
        
        if (boletosMap[dayStr]) {
            hasPending = true;
            const totalDue = boletosMap[dayStr].total;
            valueHtml = `<span class="calendar-day-value" title="${boletosMap[dayStr].list.length} parcelas pendentes">${totalDue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}</span>`;
            if (dayStr < todayStr) {
                overdueClass = 'has-overdue';
            }
        }
        
        calendarHtml += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${overdueClass}" data-date="${dayStr}" style="cursor:${hasPending ? 'pointer' : 'default'};">
                <span class="calendar-day-number">${day}</span>
                ${valueHtml}
            </div>
        `;
    }
    
    calendarHtml += `</div>`;
    gridContainer.innerHTML = calendarHtml;
    
    gridContainer.querySelectorAll('.calendar-day').forEach(dayEl => {
        const date = dayEl.dataset.date;
        if (date && boletosMap[date]) {
            dayEl.addEventListener('click', () => {
                const list = boletosMap[date].list;
                const listText = list.map(item => 
                    `- ${escapeHTML(item.sale.cliente)} (Parcela ${item.parcela}/${item.totalParcelas}): ${item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                ).join('\n');
                alert(`Boletos com vencimento em ${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')}:\n\n${listText}`);
            });
        }
    });
}

function populateSystemSettingsInForm() {
    const settings = getSystemSettings();
    const elPix = document.getElementById('settings-pix-key');
    if (elPix) elPix.value = settings.pixKey || '';
    
    const elWeb = document.getElementById('settings-webhook-url');
    if (elWeb) elWeb.value = settings.webhookUrl || '';
}

function updateCloudBadge() {
    const badge = document.getElementById('cloud-sync-badge');
    if (!badge) return;
    
    const settings = getSystemSettings();
    const okIcon = badge.querySelector('.cloud-ok-icon');
    const syncIcon = badge.querySelector('.cloud-sync-icon');
    const offIcon = badge.querySelector('.cloud-off-icon');
    
    okIcon.classList.add('hidden');
    syncIcon.classList.add('hidden');
    offIcon.classList.add('hidden');
    
    if (settings.webhookUrl) {
        okIcon.classList.remove('hidden');
        badge.style.color = 'var(--success)';
        badge.setAttribute('title', 'Nuvem Ativada (Sincronizado)');
    } else {
        offIcon.classList.remove('hidden');
        badge.style.color = 'var(--text-muted)';
        badge.setAttribute('title', 'Backup em Nuvem Desativado');
    }
}
