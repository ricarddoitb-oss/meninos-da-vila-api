const API_URL = 'https://meninos-da-vila-api.onrender.com';
let listaAtletasGlobal = [];

// ==========================================
// 1. AUTENTICAÇÃO E REDIRECIONAMENTO
// ==========================================
const token = localStorage.getItem('token');
const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');

const paginaAtual = window.location.pathname;
const isPaginaLogin = paginaAtual.endsWith('login.html');

if (!token && !isPaginaLogin) {
    window.location.href = 'login.html';
}

if (token && isPaginaLogin) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!isPaginaLogin) {
        if (usuarioLogado.perfil !== 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        }
        carregarConfiguracoesVisual();
        carregarJogadores();
        carregarDadosFinanceiros();
        carregarUsuariosSistema();
    }
});

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
        'financeiro': 'Controle Financeiro & Livro Caixa',
        'usuarios': 'Gestão de Usuários & Acessos',
        'configuracoes': 'Customização Visual'
    };
    const titleElement = document.getElementById('page-title');
    if (titleElement) titleElement.innerText = titles[tabId] || 'Painel';
}

function openModal(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId)?.classList.add('hidden'); }

// ==========================================
// 3. CONFIGURAÇÕES E VISUAL
// ==========================================
async function carregarConfiguracoesVisual() {
    try {
        const res = await fetch(`${API_URL}/api/configuracoes`);
        const configs = await res.json();
        if (configs.nome_clube) {
            document.querySelectorAll('.club-name-target').forEach(el => el.innerText = configs.nome_clube);
        }
    } catch (err) {
        console.error('Erro ao carregar identidades visuais:', err);
    }
}

// ==========================================
// 4. JOGADORES (ELENCO COMPLETO)
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

    const isAdmin = usuarioLogado.perfil === 'admin';
    grid.innerHTML = '';
    jogadores.forEach(j => {
        grid.innerHTML += `
            <div class="bg-pitch-800 border border-pitch-700/60 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${j.posicao}</span>
                        <span class="text-xs px-2 py-0.5 rounded ${j.status_mensalidade === 'Pago' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">${j.status_mensalidade || 'Pendente'}</span>
                    </div>
                    <h4 class="font-bold text-white text-base mt-2">${j.nome}</h4>
                    <p class="text-xs text-gray-400">Apelido: ${j.apelido || '-'}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-pitch-700/40 text-xs text-gray-300 flex justify-between items-center">
                    <span>⚽ Gols: <strong>${j.gols || 0}</strong></span>
                    ${isAdmin ? `
                        <div class="space-x-2">
                            <button onclick='prepararEdicaoJogador(${JSON.stringify(j)})' class="text-amber-400 hover:underline">Editar</button>
                            <button onclick="excluirJogador(${j.id})" class="text-rose-400 hover:underline">Excluir</button>
                        </div>
                    ` : `<span>📞 ${j.telefone || '-'}</span>`}
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

async function salvarJogador(e) {
    e.preventDefault();
    const tokenAtual = localStorage.getItem('token');
    const id = document.getElementById('input-jogador-id').value;

    const dados = {
        nome: document.getElementById('input-nome').value,
        apelido: document.getElementById('input-apelido').value,
        telefone: document.getElementById('input-telefone').value,
        posicao: document.getElementById('input-posicao').value,
        status_mensalidade: document.getElementById('input-mensalidade')?.value || 'Pendente',
        gols: parseInt(document.getElementById('input-gols')?.value || 0)
    };

    const metodo = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/api/jogadores/${id}` : `${API_URL}/api/jogadores`;

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAtual}` },
            body: JSON.stringify(dados)
        });

        if (res.ok) {
            alert('Atleta salvo com sucesso!');
            closeModal('modal-novo-jogador');
            document.getElementById('form-novo-jogador').reset();
            document.getElementById('input-jogador-id').value = '';
            carregarJogadores();
        } else {
            const errData = await res.json();
            alert(`Erro ao salvar: ${errData.erro || 'Verifique permissões.'}`);
        }
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro ao conectar com o servidor.');
    }
}

function prepararEdicaoJogador(j) {
    document.getElementById('input-jogador-id').value = j.id;
    document.getElementById('input-nome').value = j.nome;
    document.getElementById('input-apelido').value = j.apelido || '';
    document.getElementById('input-telefone').value = j.telefone || '';
    document.getElementById('input-posicao').value = j.posicao;
    if(document.getElementById('input-mensalidade')) document.getElementById('input-mensalidade').value = j.status_mensalidade || 'Pendente';
    if(document.getElementById('input-gols')) document.getElementById('input-gols').value = j.gols || 0;
    openModal('modal-novo-jogador');
}

async function excluirJogador(id) {
    if (!confirm('Tem certeza que deseja excluir este atleta?')) return;
    const tokenAtual = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/jogadores/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenAtual}` }
        });
        if (res.ok) {
            carregarJogadores();
        } else {
            alert('Erro ao excluir atleta.');
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// 5. SORTEIO AVANÇADO (MÚLTIPLOS TIMES)
// ==========================================
function sortearTimesAvancado() {
    const selecionados = Array.from(document.querySelectorAll('.atleta-checkbox:checked')).map(cb => ({
        nome: cb.dataset.nome,
        posicao: cb.dataset.posicao
    }));

    const numTimes = parseInt(document.getElementById('qtd-times')?.value || 2);
    if (selecionados.length < numTimes) {
        alert(`Selecione pelo menos ${numTimes} atletas para realizar o sorteio.`);
        return;
    }

    const embaralhados = selecionados.sort(() => 0.5 - Math.random());
    const times = Array.from({ length: numTimes }, () => []);
    
    embaralhados.forEach((atleta, index) => {
        times[index % numTimes].push(atleta);
    });

    const paletaCores = [
        { nome: 'Time Verde', classe: 'border-emerald-500 text-emerald-400' },
        { nome: 'Time Amarelo', classe: 'border-amber-500 text-amber-400' },
        { nome: 'Time Azul', classe: 'border-blue-500 text-blue-400' },
        { nome: 'Time Vermelho', classe: 'border-rose-500 text-rose-400' }
    ];

    const containerResult = document.getElementById('times-result-container');
    document.getElementById('times-empty-state')?.classList.add('hidden');
    containerResult.classList.remove('hidden');
    containerResult.innerHTML = '';

    times.forEach((timeJogadores, idx) => {
        const cor = paletaCores[idx % paletaCores.length];
        let htmlJogadores = timeJogadores.map(j => `
            <div class="p-2 bg-pitch-900 rounded border border-pitch-700 text-xs text-white flex justify-between mb-1">
                <span>${j.nome}</span>
                <span class="text-gray-400">${j.posicao}</span>
            </div>
        `).join('');

        containerResult.innerHTML += `
            <div class="bg-pitch-800 border ${cor.classe} rounded-2xl p-4 mb-4 shadow-md">
                <h4 class="font-bold text-sm ${cor.classe.split(' ')[1]} mb-3">${cor.nome} (${timeJogadores.length} atletas)</h4>
                <div class="space-y-1">${htmlJogadores}</div>
            </div>
        `;
    });
}

// ==========================================
// 6. MÓDULO FINANCEIRO E UTILIZADORES
// ==========================================
function carregarDadosFinanceiros() {
    // Simulação ou carregamento dinâmico das métricas financeiras da próxima partida e livro caixa
    const saldoEl = document.getElementById('saldo-caixa-val');
    if (saldoEl) saldoEl.innerText = 'R$ 150,00';
}

async function carregarUsuariosSistema() {
    const tokenAtual = localStorage.getItem('token');
    const container = document.getElementById('usuarios-lista');
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/api/usuarios`, {
            headers: { 'Authorization': `Bearer ${tokenAtual}` }
        });
        if (res.ok) {
            const usuarios = await res.json();
            container.innerHTML = usuarios.map(u => `
                <div class="p-3 bg-pitch-900 rounded-xl border border-pitch-700/50 flex justify-between items-center mb-2">
                    <div>
                        <p class="text-sm font-bold text-white">${u.nome} (${u.email})</p>
                        <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${u.perfil}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) { console.error(err); }
}