/**
 * Módulo de Exportação e Relatórios (reports.js)
 * Permite a exportação de dados para Excel (CSV formatado com UTF-8 BOM) e PDF através de folha de estilos de impressão
 * Requisitos: RF14, RF15, RNF01
 */

/**
 * Consolida as métricas de vendas por vendedor
 */
export function getConsolidatedSellersMetrics(sales, sellers) {
    const completedSales = sales.filter(s => {
        const isProp = (s.tipo && (s.tipo.toLowerCase() === 'proposta' || s.tipo.toLowerCase() === 'orçamento' || s.tipo.toLowerCase() === 'orcamento')) ||
                       (s.proposta && (!s.numeroNota || s.numeroNota === '-' || s.numeroNota.trim() === ''));
        return !isProp;
    });

    const totalRevenueAll = completedSales.reduce((sum, sale) => sum + sale.valor, 0);
    
    const metrics = sellers.map(seller => {
        const sellerSales = completedSales.filter(s => s.vendedorId === seller.id);
        const quantity = sellerSales.length;
        const revenue = sellerSales.reduce((sum, s) => sum + s.valor, 0);
        const averageTicket = quantity > 0 ? revenue / quantity : 0;
        const percentage = totalRevenueAll > 0 ? (revenue / totalRevenueAll) * 100 : 0;

        return {
            name: seller.name,
            quantity,
            revenue,
            percentage,
            averageTicket
        };
    });

    // Ordena pelo faturamento decrescente
    return metrics.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Exporta o histórico de vendas para um arquivo compatível com Excel (CSV formatado)
 */
export function exportToExcel(sales) {
    if (sales.length === 0) {
        throw new Error('Não há dados de vendas para exportar.');
    }

    // Cabeçalhos das colunas exatamente igual à imagem do usuário
    const headers = [
        'Observações',
        'Proposta',
        'Cliente',
        'Tipo',
        'Valor',
        'Data',
        'Executante',
        'Venda (NF)',
        'Valor2',
        'Pagamento',
        'Vencimento',
        'Vendedor',
        'Observações (2)'
    ];

    // Mapeamento dos registros de vendas
    const rows = sales.map(sale => {
        const dateObj = new Date(sale.data);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        
        // Limpar observações de quebras de linha ou aspas duplas
        const obsEscaped = (sale.observacoes || '')
            .replace(/"/g, '""')
            .replace(/\n/g, ' ');

        const obs2Escaped = (sale.observacoes2 || '')
            .replace(/"/g, '""')
            .replace(/\n/g, ' ');

        const vencimentoStr = sale.vencimentoBoleto
            ? new Date(sale.vencimentoBoleto + 'T12:00:00').toLocaleDateString('pt-BR')
            : '';

        return [
            `"${obsEscaped}"`,
            `"${(sale.proposta || '').replace(/"/g, '""')}"`,
            `"${sale.cliente.replace(/"/g, '""')}"`,
            `"${(sale.tipo || 'Venda').replace(/"/g, '""')}"`,
            sale.valor.toFixed(2).replace('.', ','),
            dateStr,
            `"${(sale.executante || '').replace(/"/g, '""')}"`,
            `"${(sale.numeroNota || '').replace(/"/g, '""')}"`,
            sale.valor2 !== null && sale.valor2 !== undefined ? sale.valor2.toFixed(2).replace('.', ',') : '',
            `"${sale.formaPagamento}"`,
            vencimentoStr,
            `"${sale.vendedorNome}"`,
            `"${obs2Escaped}"`
        ];
    });

    // Cria o conteúdo CSV delimitado por ponto e vírgula (padrão Excel em português)
    const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.join(';'))
    ].join('\n');

    // Prepara o UTF-8 Byte Order Mark (BOM) para forçar o Excel a abrir em UTF-8 correto
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Cria link de download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const timestamp = now.getFullYear() + 
                      String(now.getMonth() + 1).padStart(2, '0') + 
                      String(now.getDate()).padStart(2, '0') + '_' +
                      String(now.getHours()).padStart(2, '0') +
                      String(now.getMinutes()).padStart(2, '0');
                      
    link.href = url;
    link.setAttribute('download', `relatorio_vendas_${timestamp}.csv`);
    
    // Executa clique virtual para disparar download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
}

/**
 * Prepara o documento e aciona a rotina nativa de impressão/salvamento em PDF
 */
export function exportToPDF() {
    const printDateEl = document.getElementById('print-report-date');
    if (printDateEl) {
        const now = new Date();
        printDateEl.textContent = `Emissão: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Aciona a caixa de diálogo de impressão do navegador
    // O estilo @media print definido no CSS cuida de ocultar o layout do app e exibir apenas a tabela do relatório de maneira impecável.
    window.print();
    return true;
}
