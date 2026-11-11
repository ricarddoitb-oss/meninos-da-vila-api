let historicoSorteiosGlobal = [];

function verificarTravaRodadaAtual() {
    const dataPartidaAtual = configsGlobal.partida_data || new Date().toISOString().split('T')[0];
    const alerta = document.getElementById('alerta-rodada-travada');
    const btnGerar = document.getElementById('btn-gerar-sorteio');
    const btnRefazer = document.getElementById('btn-refazer-sorteio');

    const jaExiste = historicoSorteiosGlobal.some(s => {
        if (!s.data_partida) return false;
        const dataSorteio = s.data_partida.split('T')[0];
        return dataSorteio === dataPartidaAtual;
    });

    if (jaExiste) {
        if (alerta) alerta.classList.remove('hidden');
        if (btnGerar) {
            btnGerar.disabled = true;
            btnGerar.classList.add('opacity-50', 'cursor-not-allowed');
            btnGerar.innerText = 'Rodada Travada';
        }
        if (btnRefazer) {
            btnRefazer.disabled = true;
            btnRefazer.classList.add('opacity-50', 'cursor-not-allowed');
        }
        return true; // Travado
    } else {
        if (alerta) alerta.classList.add('hidden');
        if (btnGerar) {
            btnGerar.disabled = false;
            btnGerar.classList.remove('opacity-50', 'cursor-not-allowed');
            btnGerar.innerHTML = '<i class="fa-solid fa-shuffle mr-1"></i>Gerar Sorteio (Prévia)';
        }
        if (btnRefazer) {
            btnRefazer.disabled = false;
            btnRefazer.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return false; // Liberado
    }
}

function sortearTimesAvancado() {
    if (verificarTravaRodadaAtual()) {
        alert('A rodada atual já foi confirmada e travada! Altere a data da próxima partida para realizar um novo sorteio.');
        return;
    }

    const selecionados = Array.from(document.querySelectorAll('.atleta-checkbox:checked')).map(cb => ({
        id: parseInt(cb.value),
        nome: cb.dataset.nome,
        posicao: cb.dataset.posicao
    }));

    const numTimes = parseInt(document.getElementById('qtd-times').value) || 2;
    if (selecionados.length < numTimes) {
        alert(`Selecione pelo menos ${numTimes} atletas para sortear.`);
        return;
    }

    const goleiros = selecionados.filter(j => j.posicao && j.posicao.toLowerCase() === 'goleiro');
    const linha = selecionados.filter(j => !j.posicao || j.posicao.toLowerCase() !== 'goleiro');

    goleiros.sort(() => 0.5 - Math.random());
    linha.sort(() => 0.5 - Math.random());

    const times = Array.from({ length: numTimes }, () => []);

    goleiros.forEach((g, idx) => {
        times[idx % numTimes].push(g);
    });

    linha.forEach((atleta, index) => {
        times[index % numTimes].push(atleta);
    });

    const paletaCores = [
        { nome: 'Time Colete Preto', classe: 'border-gray-500 text-gray-200 bg-black/40' },
        { nome: 'Time Colete Vermelho', classe: 'border-rose-500 text-rose-400' },
        { nome: 'Time Colete Azul', classe: 'border-blue-500 text-blue-400' },
        { nome: 'Time Colete Laranja', classe: 'border-orange-500 text-orange-400' }
    ];

    const dataPartidaStr = configsGlobal.partida_data || new Date().toISOString().split('T')[0];
    const localPartidaStr = configsGlobal.partida_local || 'Campo Principal - CMV';

    ultimoSorteioGerado = {
        data_partida: dataPartidaStr,
        local_partida: localPartidaStr,
        num_times: numTimes,
        jogador_ids: selecionados.map(j => j.id),
        dados_times: times.map((t, idx) => ({ nome: paletaCores[idx % paletaCores.length].nome, jogadores: t }))
    };

    const container = document.getElementById('times-result-container');
    document.getElementById('times-empty-state').classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = '';

    times.forEach((tJogadores, idx) => {
        const cor = paletaCores[idx % paletaCores.length];
        let htmlMembros = tJogadores.map(j => `
            <div class="p-2 bg-pitch-900 rounded border border-pitch-700 text-xs text-white flex justify-between mb-1">
                <span>${j.nome}</span><span class="text-gray-400">${j.posicao}</span>
            </div>
        `).join('');

        container.innerHTML += `
            <div class="bg-pitch-800 border ${cor.classe} rounded-2xl p-4 mb-4 shadow-md">
                <h4 class="font-bold text-sm mb-3">${cor.nome} (${tJogadores.length} atletas)</h4>
                <div class="space-y-1">${htmlMembros}</div>
            </div>
        `;
    });

    document.getElementById('container-btn-confirmar').classList.remove('hidden');
    document.getElementById('status-sorteio-badge').classList.add('hidden');
}

async function confirmarETravarSorteio() {
    if (!ultimoSorteioGerado) {
        alert('Nenhum sorteio gerado para confirmar.');
        return;
    }

    if (!confirm('Deseja confirmar e travar este resultado? Isso registrará a presença oficial de todos os atletas selecionados na rodada e salvará o histórico.')) {
        return;
    }

    try {
        const resSorteio = await fetch(`${API_URL}/api/sorteios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(ultimoSorteioGerado)
        });

        if (!resSorteio.ok) {
            const err = await resSorteio.json();
            alert(`Atenção: ${err.erro || 'Não foi possível salvar o sorteio.'}`);
            return;
        }

        await fetch(`${API_URL}/api/presencas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ 
                data_partida: ultimoSorteioGerado.data_partida, 
                jogador_ids: ultimoSorteioGerado.jogador_ids 
            })
        });

        alert('Presenças computadas e sorteio travado com sucesso!');
        document.getElementById('container-btn-confirmar').classList.add('hidden');
        document.getElementById('status-sorteio-badge').classList.remove('hidden');
        
        // Atualiza histórico localmente e reaplica o bloqueio visual
        await carregarHistoricoSorteios();
        carregarJogadores();
    } catch (err) {
        console.error('Erro:', err);
        alert('Erro de conexão ao salvar.');
    }
}

async function carregarHistoricoSorteios() {
    const tbody = document.getElementById('tabela-historico-sorteios');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_URL}/api/sorteios`);
        if (res.ok) {
            historicoSorteiosGlobal = await res.json();
            verificarTravaRodadaAtual();

            if (historicoSorteiosGlobal.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-gray-400 text-xs">Nenhum sorteio registrado no histórico ainda.</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            historicoSorteiosGlobal.forEach(s => {
                let dataFmt = '-';
                if (s.data_partida) {
                    const partes = s.data_partida.split('T')[0].split('-');
                    if (partes.length === 3) {
                        dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    }
                }
                
                const localJogo = s.local_partida || configsGlobal.partida_local || 'Campo Principal - CMV';

                let timesHtml = '';
                if (Array.isArray(s.dados_times)) {
                    timesHtml = s.dados_times.map(t => `
                        <div class="mb-2 p-2 bg-pitch-900 rounded border border-pitch-700/60">
                            <strong class="text-amber-400 text-xs">${t.nome}:</strong> 
                            <span class="text-xs text-gray-300">${t.jogadores.map(j => j.nome).join(', ')}</span>
                        </div>
                    `).join('');
                }

                tbody.innerHTML += `
                    <tr class="border-b border-pitch-700/50 hover:bg-pitch-900/40 align-top">
                        <td class="py-3 font-medium text-white">
                            <div class="text-emerald-400 font-bold">${dataFmt}</div>
                            <div class="text-[11px] text-gray-400 mt-0.5">${localJogo}</div>
                        </td>
                        <td class="py-3 text-gray-300">${s.num_times} Times</td>
                        <td class="py-3">${timesHtml}</td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar histórico de sorteios:', err);
    }
}