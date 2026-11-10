const API_URL = 'https://meninos-da-vila-api.onrender.com';
let listaAtletasGlobal = [];

// Função de Troca de Abas
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
        btn.classList.add('text-gray-300');
    });

    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border', 'border-emerald-500/20');
        activeBtn.classList.remove('text-gray-300');
    }

    const titles = {
        'dashboard': 'Dashboard Geral',
        'elenco': 'Gestão de Elenco',
        'presenca': 'Convocação & Sorteio de Times',
        'financeiro': 'Controle Financeiro'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Painel';
}

// Modais
function openModal(modalId) {
    document.getElementById(modalId)?.classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
}

// Carregar Jogadores da API
async function carregarJogadores() {
    try {
        const res = await fetch(`${API_URL}/api/jogadores`);
        const dados = await res.json();
        
        if (Array.isArray(dados)) {
            listaAtletasGlobal = dados;
            renderDashboard(dados);
            renderElenco(dados);
            renderPresenca(dados);
        }
    } catch (err) {
        console.error('Erro ao conectar com a API:', err);
    }
}

// Renderizar Dashboard
function renderDashboard(jogadores) {
    document.getElementById('dash-total-jogadores').innerText = jogadores.length;
    
    const pagos = jogadores.filter(j => j.status_mensalidade === 'Pago').length;
    document.getElementById('dash-pagos-count').innerText = `${pagos}/${jogadores.length}`;
    
    const pct = jogadores.length ? Math.round((pagos / jogadores.length) * 100) : 0;
    document.getElementById('dash-adimplencia-pct').innerText = `${pct}% de adimplência`;

    // Lista de Pendentes
    const pendentesList = document.getElementById('dash-pendentes-list');
    pendentesList.innerHTML = '';
    const pendentes = jogadores.filter(j => j.status_mensalidade !== 'Pago');
    
    pendentes.forEach(j => {
        pendentesList.innerHTML += `
            <div class="flex items-center justify-between p-3 rounded-xl bg-pitch-900/50 border border-pitch-700/40">
                <span class="text-sm font-semibold text-white">${j.nome} (${j.apelido || j.posicao})</span>
                <span class="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-bold">Pendente</span>
            </div>
        `;
    });
}

// Renderizar Elenco
function renderElenco(jogadores) {
    const grid = document.getElementById('jogadores-grid');
    grid.innerHTML = '';

    jogadores.forEach(j => {
        grid.innerHTML += `
            <div class="bg-pitch-800 border border-pitch-700/60 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${j.posicao}</span>
                        <span class="text-xs font-bold ${j.status_mensalidade === 'Pago' ? 'text-emerald-400' : 'text-amber-400'}">${j.status_mensalidade || 'Pendente'}</span>
                    </div>
                    <h4 class="font-bold text-white text-base">${j.nome}</h4>
                    <p class="text-xs text-gray-400 mb-2">Apelido: ${j.apelido || '-'}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-pitch-700/40 flex justify-between items-center text-xs text-gray-300">
                    <span>⚽ Gols: <strong>${j.gols || 0}</strong></span>
                    <span>📞 ${j.telefone || '-'}</span>
                </div>
            </div>
        `;
    });
}

// Renderizar Presença
function renderPresenca(jogadores) {
    const lista = document.getElementById('presenca-lista');
    lista.innerHTML = '';

    jogadores.forEach((j, index) => {
        lista.innerHTML += `
            <label class="flex items-center justify-between p-3 rounded-xl bg-pitch-900/50 border border-pitch-700/40 cursor-pointer hover:border-emerald-500/50 transition">
                <div class="flex items-center space-x-3">
                    <input type="checkbox" class="atleta-checkbox w-4 h-4 accent-emerald-500 rounded" value="${j.id || index}" data-nome="${j.nome}" data-posicao="${j.posicao}">
                    <span class="text-sm font-medium text-white">${j.nome} (${j.posicao})</span>
                </div>
            </label>
        `;
    });
}

// Salvar Novo Jogador
async function salvarJogador(e) {
    e.preventDefault();

    const novo = {
        nome: document.getElementById('input-nome').value,
        apelido: document.getElementById('input-apelido').value,
        posicao: document.getElementById('input-posicao').value,
        telefone: document.getElementById('input-telefone').value
    };

    try {
        const res = await fetch(`${API_URL}/api/jogadores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novo)
        });

        if (res.ok) {
            closeModal('modal-novo-jogador');
            document.getElementById('form-novo-jogador').reset();
            carregarJogadores();
        }
    } catch (err) {
        console.error('Erro ao salvar atleta:', err);
    }
}

// Sorteio de Times
function sortearTimes() {
    const selecionados = Array.from(document.querySelectorAll('.atleta-checkbox:checked')).map(cb => ({
        nome: cb.dataset.nome,
        posicao: cb.dataset.posicao
    }));

    if (selecionados.length < 2) {
        alert('Selecione pelo menos 2 atletas para realizar o sorteio!');
        return;
    }

    // Embaralha
    const embaralhados = selecionados.sort(() => 0.5 - Math.random());
    const meio = Math.ceil(embaralhados.length / 2);
    
    const timeA = embaralhados.slice(0, meio);
    const timeB = embaralhados.slice(meio);

    document.getElementById('times-empty-state').classList.add('hidden');
    document.getElementById('times-result-container').classList.remove('hidden');

    const renderTeam = (containerId, list) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        list.forEach(j => {
            container.innerHTML += `
                <div class="p-3 bg-pitch-900/60 rounded-xl border border-pitch-700/50 flex items-center justify-between">
                    <span class="text-xs font-bold text-white">${j.nome}</span>
                    <span class="text-[10px] text-gray-400 uppercase">${j.posicao}</span>
                </div>
            `;
        });
    };

    renderTeam('team-a-list', timeA);
    renderTeam('team-b-list', timeB);
}

// Inicialização
carregarJogadores();