/**
 * Módulo de Visualização Gráfica (charts.js)
 * Gerencia a renderização de gráficos responsivos e interativos via Chart.js
 * Suporta atualização em tempo real, filtros e adaptação ao tema escuro/claro
 * Requisitos: RF12, RF13, RNF02, RNF06
 */

let chartVendedoresInstance = null;
let chartPeriodoInstance = null;

/**
 * Obtém as cores de acordo com o tema ativo
 */
function getThemeColors() {
    const isDark = document.body.classList.contains('dark-theme');
    return {
        textColor: isDark ? '#9ca3af' : '#475569',
        gridColor: isDark ? 'rgba(31, 41, 55, 0.6)' : 'rgba(226, 232, 240, 0.8)',
        tooltipBg: isDark ? '#1f2937' : '#ffffff',
        tooltipBorder: isDark ? '#374151' : '#cbd5e1',
        tooltipText: isDark ? '#f3f4f6' : '#0f172a',
        accentGradientStart: isDark ? 'rgba(99, 102, 241, 0.8)' : 'rgba(79, 70, 229, 0.85)',
        accentGradientEnd: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
        successGradientStart: isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(5, 150, 105, 0.85)',
        successGradientEnd: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(5, 150, 105, 0.1)'
    };
}

/**
 * Inicializa ou atualiza os gráficos com base nos dados filtrados
 */
export function updateCharts(sales, sellers) {
    const ctxVendedores = document.getElementById('chart-vendedor');
    const ctxPeriodo = document.getElementById('chart-periodo');
    
    if (!ctxVendedores || !ctxPeriodo) return;
    
    const colors = getThemeColors();

    // 1. Processar dados para: Vendas por Vendedor (Quantidade e Valor)
    const sellerSalesData = {};
    
    // Inicializa todos os vendedores ativos (para que mostrem 0 se não tiverem vendas)
    sellers.forEach(s => {
        sellerSalesData[s.name] = { count: 0, total: 0 };
    });

    sales.forEach(sale => {
        if (sellerSalesData[sale.vendedorNome]) {
            sellerSalesData[sale.vendedorNome].count += 1;
            sellerSalesData[sale.vendedorNome].total += sale.valor;
        } else {
            // Caso o vendedor tenha sido excluído mas a venda permaneça
            sellerSalesData[sale.vendedorNome] = { count: 1, total: sale.valor };
        }
    });

    // Ordenar vendedores por quantidade de vendas descrescente
    const sortedSellers = Object.entries(sellerSalesData)
        .sort((a, b) => b[1].count - a[1].count);

    const sellerLabels = sortedSellers.map(item => item[0]);
    const sellerCounts = sortedSellers.map(item => item[1].count);
    const sellerTotals = sortedSellers.map(item => item[1].total);

    // 2. Processar dados para: Vendas por Período (Últimos 30 dias agrupados por dia)
    const periodSalesData = {};
    
    // Obter datas únicas ordenadas cronologicamente
    sales.forEach(sale => {
        const date = new Date(sale.data);
        const dateKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        if (!periodSalesData[dateKey]) {
            periodSalesData[dateKey] = { count: 0, total: 0, rawDate: new Date(date.getFullYear(), date.getMonth(), date.getDate()) };
        }
        periodSalesData[dateKey].count += 1;
        periodSalesData[dateKey].total += sale.valor;
    });

    const sortedPeriods = Object.entries(periodSalesData)
        .sort((a, b) => a[1].rawDate - b[1].rawDate);

    const periodLabels = sortedPeriods.map(item => item[0]);
    const periodTotals = sortedPeriods.map(item => item[1].total);
    const periodCounts = sortedPeriods.map(item => item[1].count);

    // --- GRÁFICO 1: VENDAS POR VENDEDOR ---
    if (chartVendedoresInstance) {
        chartVendedoresInstance.destroy();
    }
    
    const canvasVendedorCtx = ctxVendedores.getContext('2d');
    const gradVendedor = canvasVendedorCtx.createLinearGradient(0, 0, 0, 300);
    gradVendedor.addColorStop(0, colors.accentGradientStart);
    gradVendedor.addColorStop(1, colors.accentGradientEnd);

    chartVendedoresInstance = new Chart(ctxVendedores, {
        type: 'bar',
        data: {
            labels: sellerLabels,
            datasets: [{
                label: 'Quantidade de Vendas',
                data: sellerCounts,
                backgroundColor: gradVendedor,
                borderColor: colors.accentGradientStart.replace('0.8', '1'),
                borderWidth: 1.5,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const count = context.raw;
                            const total = sellerTotals[index].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            return [`Vendas: ${count} un.`, `Faturamento: ${total}`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.textColor, font: { family: 'Plus Jakarta Sans', weight: 600 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: { 
                        color: colors.textColor,
                        font: { family: 'Plus Jakarta Sans' },
                        precision: 0
                    }
                }
            }
        }
    });

    // --- GRÁFICO 2: VENDAS POR PERÍODO ---
    if (chartPeriodoInstance) {
        chartPeriodoInstance.destroy();
    }

    const canvasPeriodoCtx = ctxPeriodo.getContext('2d');
    const gradPeriodo = canvasPeriodoCtx.createLinearGradient(0, 0, 0, 300);
    gradPeriodo.addColorStop(0, colors.successGradientStart);
    gradPeriodo.addColorStop(1, colors.successGradientEnd);

    chartPeriodoInstance = new Chart(ctxPeriodo, {
        type: 'line',
        data: {
            labels: periodLabels,
            datasets: [{
                label: 'Faturamento Diário',
                data: periodTotals,
                fill: true,
                backgroundColor: gradPeriodo,
                borderColor: colors.successGradientStart.replace('0.8', '1'),
                borderWidth: 3,
                tension: 0.35,
                pointBackgroundColor: colors.successGradientStart.replace('0.8', '1'),
                pointBorderColor: colors.tooltipBg,
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const total = context.raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            const count = periodCounts[index];
                            return [`Faturamento: ${total}`, `Vendas no dia: ${count} un.`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.textColor, font: { family: 'Plus Jakarta Sans', weight: 600 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: { 
                        color: colors.textColor,
                        font: { family: 'Plus Jakarta Sans' },
                        callback: function(value) {
                            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
                        }
                    }
                }
            }
        }
    });
}
