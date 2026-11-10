const API_URL = 'https://meninos-da-vila-api.onrender.com';
let listaAtletasGlobal = [];

// ==========================================
// 1. AUTENTICAÇÃO E REDIRECIONAMENTO DE LOGIN
// ==========================================
const token = localStorage.getItem('token');
const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');

// Identifica a página atual
const paginaAtual = window.location.pathname;
const isPaginaLogin = paginaAtual.endsWith('login.html');

// Se NÃO tiver token e NÃO estiver na tela de login, força o redirecionamento
if (!token && !isPaginaLogin) {
    window.location.href = 'login.html';
}

// Se JÁ estiver logado e tentar abrir o login.html, vai direto pro dashboard
if (token && isPaginaLogin) {
    window.location.href = 'index.html';
}

// Restrições de perfil ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    if (!isPaginaLogin) {
        if (usuarioLogado.perfil !== 'admin') {
            const btnNovoJogador = document.getElementById('btn-novo-jogador');
            if (btnNovoJogador) btnNovoJogador.style.display = 'none';
        }
        carregarConfiguracoesVisual();
        carregarJogadores();
    }
});

// Função para Sair
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

// ==========================================
// 2. NAVEGAÇÃO ENTRE ABAS
// ==========================================
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
        'financeiro': 'Controle Financeiro',
        'configuracoes': 'Customização Visual'
    };
    const titleElement = document.getElementById('page-title');
    if (titleElement) titleElement.innerText = titles[tabId] || 'Painel';
}

// Controladores de Modal
function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

// ==========================================
// 3. CUSTOMIZAÇÃO VISUAL (BANNER E NOME)
// ==========================================
async function carregarConfiguracoesVisual() {
    try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        const configs = await res.json();

        if (configs.nome_clube) {
            document.querySelectorAll('.club-name-target').forEach(el => {
                el.innerText = configs.nome_clube;
            });
        }
        
        if (configs.banner_url) {
            const headerEl = document.getElementById('main-header');
            if (headerEl) {
                headerEl.style.backgroundImage = `linear-gradient(rgba(18, 32, 23, 0.9), rgba(18, 32, 23, 0.9)), url('${configs.banner_url}')`;
                headerEl.style.backgroundSize = 'cover';
                headerEl.style.backgroundPosition = 'center';
            }
        }
    } catch (err) {
        console.error('Erro ao carregar identidades visuais:', err);
    }
}

async function salvarConfiguracoes(e) {
    e.preventDefault();
    const tokenAtual = localStorage.getItem('token');
    
    const novasConfigs = {
        nome_clube: document.getElementById('cfg-nome').value,
        banner_url: document.getElementById('cfg-banner').value
    };

    try {
        const res = await fetch(`${API_URL}/api/configuracoes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenAtual}`
            },
            body: JSON.stringify(novasConfigs)
        });

        if (res.ok) {
            alert('Visual atualizado com sucesso!');
            carregarConfiguracoesVisual();
        } else {
            alert('Erro ao atualizar visual. Certifique-se de ser administrador.');
        }
    } catch (err) {
        console.error('Erro ao salvar visual:', err);
    }
}

// ==========================================
// 4. OPERAÇÕES DE JOGADORES (API COM TOKEN)
// ==========================================
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
        console.error('Erro ao buscar atletas:', err);
    }
}

function renderDashboard(jogadores) {
    const dashTotal = document.getElementById('dash-total-jogadores');
    if (dashTotal) dashTotal.innerText = jogadores.length;

    const pagos = jogadores.filter(j => j.status_mensalidade === 'Pago').length;
    const dashPagos = document.getElementById('dash-pagos-count');
    if (dashPagos) dashPagos.innerText = `${pagos}/${jogadores.length}`;
    
    const dashArtilheiro = document.getElementById('dash-artilheiro-nome');
    if (dashArtilheiro && jogadores.length > 0) {
        dashArtilheiro.innerText = jogadores[0].nome;
    }
}

function renderElenco(jogadores) {
    const grid = document.getElementById('jogadores-grid');
    if (!grid) return;

    grid.innerHTML = '';
    jogadores.forEach(j => {
        grid.innerHTML += `
            <div class="bg-pitch-800 border border-pitch-700/60 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                <div>
                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${j.posicao}</span>
                    <h4 class="font-bold text-white text-base mt-2">${j.nome}</h4>
                    <p class="text-xs text-gray-400">Apelido: ${j.apelido || '-'}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-pitch-700/40 text-xs text-gray-300 flex justify-between">
                    <span>⚽ Gols: <strong>${j.gols || 0}</strong></span>
                    <span>📞 ${j.telefone || '-'}</span>
                </div>
            </div>
        `;
    });
}

function renderPresenca(jogadores) {
    const lista = document.getElementById('presenca-lista');
    if (!lista) return;

    lista.innerHTML = '';
    jogadores.forEach((j, index) => {
        lista.innerHTML += `
            <label class="flex items-center space-x-3 p-3 rounded-xl bg-pitch-900/50 border border-pitch-700/40 cursor-pointer mb-2">
                <input type="checkbox" class="atleta-checkbox w-4 h-4 accent-emerald-500 rounded" value="${j.id || index}" data-nome="${j.nome}" data-posicao="${j.posicao}">
                <span class="text-sm font-medium text-white">${j.nome} (${j.posicao})</span>
            </label>
        `;
    });
}

// Salvar Jogador com Token de Autorização
async function salvarJogador(e) {
    e.preventDefault();

    const tokenAtual = localStorage.getItem('token');
    if (!tokenAtual) {
        alert('Sessão expirada. Faça login novamente.');
        window.location.href = 'login.html';
        return;
    }

    const novo = {
        nome: document.getElementById('input-nome').value,
        apelido: document.getElementById('input-apelido').value,
        telefone: document.getElementById('input-telefone').value,
        posicao: document.getElementById('input-posicao').value
    };

    try {
        const res = await fetch(`${API_URL}/api/jogadores`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenAtual}`
            },
            body: JSON.stringify(novo)
        });

        if (res.ok) {
            alert('Atleta salvo com sucesso!');
            closeModal('modal-novo-jogador');
            document.getElementById('form-novo-jogador').reset();
            carregarJogadores();
        } else {
            const errData = await res.json();
            alert(`Erro ao salvar: ${errData.erro || 'Verifique suas credenciais de admin.'}`);
        }
    } catch (err) {
        console.error('Erro na requisição:', err);
        alert('Erro ao conectar com o servidor.');
    }
}

// Sorteio de Times
function sortearTimes() {
    const selecionados = Array.from(document.querySelectorAll('.atleta-checkbox:checked')).map(cb => ({
        nome: cb.dataset.nome,
        posicao: cb.dataset.posicao
    }));

    if (selecionados.length < 2) {
        alert('Selecione pelo menos 2 atletas para o sorteio.');
        return;
    }

    const embaralhados = selecionados.sort(() => 0.5 - Math.random());
    const meio = Math.ceil(embaralhados.length / 2);
    
    const timeA = embaralhados.slice(0, meio);
    const timeB = embaralhados.slice(meio);

    document.getElementById('times-empty-state')?.classList.add('hidden');
    document.getElementById('times-result-container')?.classList.remove('hidden');

    const renderTeam = (containerId, list) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        list.forEach(j => {
            container.innerHTML += `
                <div class="p-2 bg-pitch-900 rounded border border-pitch-700 text-xs text-white flex justify-between">
                    <span>${j.nome}</span>
                    <span class="text-gray-400">${j.posicao}</span>
                </div>
            `;
        });
    };

    renderTeam('team-a-list', timeA);
    renderTeam('team-b-list', timeB);
}