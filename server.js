const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_meninos_da_vila';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('🟢 Conectado ao PostgreSQL com segurança!'))
    .catch(err => console.error('🔴 Erro na conexão com o banco:', err));

// ================= CRIAÇÃO AUTOMÁTICA DA TABELA DE CONVIDADOS =================
async function criarTabelaConvidados() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS convidados (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT,
                valor_diaria NUMERIC(10, 2) DEFAULT 15.00,
                participacoes INTEGER DEFAULT 0
            );
        `);
        console.log('🟢 Tabela de convidados verificada/criada com sucesso!');
    } catch (err) {
        console.error('🔴 Erro ao criar tabela de convidados:', err);
    }
}
criarTabelaConvidados();

// ================= MIDDLEWARES DE AUTORIZAÇÃO =================
function verificarTokenBase(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ erro: 'Token inválido ou expirado.' });
    }
}

function verificarAdmin(req, res, next) {
    verificarTokenBase(req, res, () => {
        if (req.usuario.perfil !== 'admin') {
            return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
        }
        next();
    });
}

function verificarPerfisPermitidos(perfisPermitidos) {
    return (req, res, next) => {
        verificarTokenBase(req, res, () => {
            if (!perfisPermitidos.includes(req.usuario.perfil)) {
                return res.status(403).json({ erro: 'Acesso negado para este perfil de usuário.' });
            }
            next();
        });
    };
}

app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', sistema: 'Clube Meninos da Vila' });
});

async function processarLogin(req, res) {
    const { email, senha } = req.body;
    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length === 0) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
        const usuario = resultado.rows[0];
        
        const senhaValida = await bcrypt.compare(senha, usuario.senha || usuario.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

        const token = jwt.sign({ id: usuario.id, nome: usuario.nome, perfil: usuario.perfil }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ mensagem: 'Login realizado com sucesso!', token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil } });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ erro: 'Erro interno no login.' });
    }
}

app.post('/api/login', processarLogin);
app.post('/api/auth/login', processarLogin);

// ================= JOGADORES (COM COMPETÊNCIA MENSAL) =================
app.get('/api/jogadores', async (req, res) => {
    const competencia = req.query.competencia || new Date().toISOString().slice(0, 7);
    try {
        const r = await pool.query(`
            SELECT j.*, 
            COALESCE(mc.status, 'Pendente') as status_mensalidade,
            (SELECT COUNT(*) FROM presencas_partidas p WHERE p.jogador_id = j.id) as total_participacoes 
            FROM jogadores j 
            LEFT JOIN mensalidades_competencia mc ON mc.jogador_id = j.id AND mc.competencia = $1
            ORDER BY j.id ASC
        `, [competencia]);
        res.json(r.rows);
    } catch (err) { 
        console.error('Erro ao buscar jogadores:', err);
        res.status(500).json({ erro: 'Erro ao buscar jogadores' }); 
    }
});

app.get('/api/jogadores/:id/perfil', async (req, res) => {
    const { id } = req.params;
    const competenciaAtual = new Date().toISOString().slice(0, 7);
    try {
        const jogadorRes = await pool.query(`
            SELECT j.*, COALESCE(mc.status, 'Pendente') as status_mensalidade 
            FROM jogadores j 
            LEFT JOIN mensalidades_competencia mc ON mc.jogador_id = j.id AND mc.competencia = $2
            WHERE j.id = $1
        `, [id, competenciaAtual]);
        
        if (jogadorRes.rows.length === 0) return res.status(404).json({ erro: 'Atleta não encontrado' });
        const jogador = jogadorRes.rows[0];

        const presencasRes = await pool.query('SELECT data_partida FROM presencas_partidas WHERE jogador_id = $1 ORDER BY data_partida DESC', [id]);
        const competenciasRes = await pool.query('SELECT * FROM mensalidades_competencia WHERE jogador_id = $1 ORDER BY competencia DESC', [id]);

        res.json({
            jogador,
            presencas: presencasRes.rows,
            competencias: competenciasRes.rows
        });
    } catch (err) {
        console.error('Erro ao buscar perfil do atleta:', err);
        res.status(500).json({ erro: 'Erro ao buscar perfil do atleta.' });
    }
});

app.post('/api/jogadores', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro', 'secretario']), async (req, res) => {
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, funcao_grupo, status_aptidao, competencia } = req.body;
    
    if (!nome || !data_nascimento || !telefone) {
        return res.status(400).json({ erro: 'Nome, Data de Nascimento e Telefone são obrigatórios.' });
    }

    try {
        const compAlvo = competencia || new Date().toISOString().slice(0, 7);
        const mensalidadeFinal = (req.usuario.perfil === 'secretario') ? 'Pendente' : (status_mensalidade || 'Pendente');

        const q = `INSERT INTO jogadores (nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols, funcao_grupo, status_aptidao) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8) RETURNING *;`;
        const r = await pool.query(q, [
            nome, 
            data_nascimento, 
            telefone, 
            posicao || 'Meia', 
            parseInt(nivel) || 3, 
            mensalidadeFinal, 
            funcao_grupo || 'Atleta',
            status_aptidao || 'Ativo'
        ]);

        const novoJogador = r.rows[0];

        if (mensalidadeFinal === 'Pago') {
            const valorMensalidade = (posicao === 'Goleiro') ? 20.00 : 40.00;
            const descricaoMensalidade = `Mensalidade (${compAlvo}) - ${nome}`;

            await pool.query(
                `INSERT INTO mensalidades_competencia (jogador_id, competencia, status, valor) VALUES ($1, $2, 'Pago', $3) ON CONFLICT (jogador_id, competencia) DO UPDATE SET status = 'Pago', valor = $3`,
                [novoJogador.id, compAlvo, valorMensalidade]
            );

            const existe = await pool.query(
                `SELECT id FROM financeiro_lancamentos WHERE descricao = $1`,
                [descricaoMensalidade]
            );

            if (existe.rows.length === 0) {
                await pool.query(
                    `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, 'Entrada', $2, CURRENT_DATE)`,
                    [descricaoMensalidade, valorMensalidade]
                );
            }
        }

        res.status(201).json(novoJogador);
    } catch (err) { 
        console.error('Erro ao cadastrar atleta:', err);
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' }); 
    }
});

app.put('/api/jogadores/:id', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro', 'secretario']), async (req, res) => {
    const { id } = req.params;
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, funcao_grupo, status_aptidao, competencia } = req.body;
    
    if (!nome || !data_nascimento || !telefone) {
        return res.status(400).json({ erro: 'Nome, Data de Nascimento e Telefone são obrigatórios.' });
    }

    try {
        const compAlvo = competencia || new Date().toISOString().slice(0, 7);
        const atletaAntigo = await pool.query('SELECT * FROM jogadores WHERE id = $1', [id]);
        if (atletaAntigo.rows.length === 0) return res.status(404).json({ erro: 'Atleta não encontrado.' });
        
        const compAntigaRes = await pool.query('SELECT status FROM mensalidades_competencia WHERE jogador_id = $1 AND competencia = $2', [id, compAlvo]);
        const statusAnterior = compAntigaRes.rows[0]?.status || 'Pendente';
        const statusMensalidadeFinal = (req.usuario.perfil === 'secretario') ? statusAnterior : (status_mensalidade || 'Pendente');

        const q = `UPDATE jogadores SET nome=$1, data_nascimento=$2, telefone=$3, posicao=$4, nivel=$5, status_mensalidade=$6, funcao_grupo=$7, status_aptidao=$8 WHERE id=$9 RETURNING *;`;
        const r = await pool.query(q, [
            nome, 
            data_nascimento, 
            telefone, 
            posicao, 
            parseInt(nivel) || 3, 
            statusMensalidadeFinal, 
            funcao_grupo || 'Atleta',
            status_aptidao || 'Ativo',
            id
        ]);

        const jogadorAtualizado = r.rows[0];
        const descricaoMensalidade = `Mensalidade (${compAlvo}) - ${nome}`;

        if (req.usuario.perfil !== 'secretario') {
            if (statusAnterior !== 'Pago' && statusMensalidadeFinal === 'Pago') {
                const valorMensalidade = (posicao === 'Goleiro') ? 20.00 : 40.00;
                
                await pool.query(
                    `INSERT INTO mensalidades_competencia (jogador_id, competencia, status, valor) VALUES ($1, $2, 'Pago', $3) ON CONFLICT (jogador_id, competencia) DO UPDATE SET status = 'Pago', valor = $3`,
                    [id, compAlvo, valorMensalidade]
                );

                const existe = await pool.query(
                    `SELECT id FROM financeiro_lancamentos WHERE descricao = $1`,
                    [descricaoMensalidade]
                );

                if (existe.rows.length === 0) {
                    await pool.query(
                        `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, 'Entrada', $2, CURRENT_DATE)`,
                        [descricaoMensalidade, valorMensalidade]
                    );
                }
            } else if (statusAnterior === 'Pago' && statusMensalidadeFinal === 'Pendente') {
                await pool.query(
                    `DELETE FROM mensalidades_competencia WHERE jogador_id = $1 AND competencia = $2`,
                    [id, compAlvo]
                );
                await pool.query(
                    `DELETE FROM financeiro_lancamentos WHERE descricao = $1 AND tipo = 'Entrada'`,
                    [descricaoMensalidade]
                );
            }
        }

        res.json(jogadorAtualizado);
    } catch (err) { 
        console.error('Erro ao atualizar jogador:', err);
        res.status(500).json({ erro: 'Erro ao atualizar jogador.' }); 
    }
});

app.delete('/api/jogadores/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM jogadores WHERE id=$1', [id]);
        res.json({ mensagem: 'Removido com sucesso.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir jogador.' }); }
});

// ================= GESTÃO DE CONVIDADOS (API) =================
app.get('/api/convidados', verificarTokenBase, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM convidados ORDER BY nome ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/convidados', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro', 'secretario']), async (req, res) => {
    try {
        const { nome, telefone, valor_diaria } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });

        const result = await pool.query(
            `INSERT INTO convidados (nome, telefone, valor_diaria, participacoes) VALUES ($1, $2, $3, 0) RETURNING *`,
            [nome, telefone, valor_diaria || 15.00]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put('/api/convidados/:id', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro', 'secretario']), async (req, res) => {
    try {
        const { nome, telefone, valor_diaria } = req.body;
        const { id } = req.params;

        await pool.query(
            `UPDATE convidados SET nome = $1, telefone = $2, valor_diaria = $3 WHERE id = $4`,
            [nome, telefone, valor_diaria, id]
        );
        res.json({ mensagem: 'Convidado atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.delete('/api/convidados/:id', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM convidados WHERE id = $1`, [id]);
        res.json({ mensagem: 'Convidado removido com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/convidados/:id/presenca', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro', 'secretario']), async (req, res) => {
    try {
        const { id } = req.params;
        const { pagar_diaria, valor_diaria } = req.body;

        const convResult = await pool.query(
            `UPDATE convidados SET participacoes = participacoes + 1 WHERE id = $1 RETURNING nome`,
            [id]
        );

        if (convResult.rows.length === 0) {
            return res.status(404).json({ erro: 'Convidado não encontrado.' });
        }

        const nomeConvidado = convResult.rows[0].nome;

        if (pagar_diaria) {
            const descricao = `Diária Convidado: ${nomeConvidado}`;
            const tipo = 'Entrada';
            const valor = parseFloat(valor_diaria) || 15.00;
            const data_lancamento = new Date().toISOString().split('T')[0];

            await pool.query(
                `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, $2, $3, $4)`,
                [descricao, tipo, valor, data_lancamento]
            );
        }

        res.json({ mensagem: 'Presença registrada com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ================= PRESENÇAS =================
app.post('/api/presencas', verificarPerfisPermitidos(['admin', 'gestor', 'secretario']), async (req, res) => {
    const { data_partida, jogador_ids } = req.body;
    if (!data_partida || !Array.isArray(jogador_ids)) {
        return res.status(400).json({ erro: 'Data da partida e lista de jogadores são obrigatórias.' });
    }

    try {
        for (const jId of jogador_ids) {
            await pool.query(
                `INSERT INTO presencas_partidas (jogador_id, data_partida) VALUES ($1, $2) ON CONFLICT (jogador_id, data_partida) DO NOTHING;`,
                [jId, data_partida]
            );
        }
        res.json({ mensagem: 'Presenças registradas com sucesso!' });
    } catch (err) {
        console.error('Erro ao registrar presenças:', err);
        res.status(500).json({ erro: 'Erro ao registrar presenças.' });
    }
});

app.delete('/api/presencas', verificarPerfisPermitidos(['admin', 'gestor', 'secretario']), async (req, res) => {
    const { jogador_id, data_partida } = req.body;
    if (!jogador_id || !data_partida) {
        return res.status(400).json({ erro: 'ID do jogador e data da partida são obrigatórios.' });
    }

    try {
        const r = await pool.query(
            `DELETE FROM presencas_partidas WHERE jogador_id = $1 AND data_partida = $2 RETURNING *;`,
            [jogador_id, data_partida]
        );

        if (r.rowCount === 0) {
            return res.status(404).json({ erro: 'Nenhum registro de presença encontrado para este atleta nesta data.' });
        }

        res.json({ mensagem: 'Presença removida com sucesso!' });
    } catch (err) {
        console.error('Erro ao remover presença:', err);
        res.status(500).json({ erro: 'Erro ao remover presença do atleta.' });
    }
});

// ================= SORTEIOS =================
app.post('/api/sorteios', verificarPerfisPermitidos(['admin', 'gestor', 'secretario']), async (req, res) => {
    const { data_partida, num_times, dados_times } = req.body;
    
    if (!data_partida || !dados_times) {
        return res.status(400).json({ erro: 'Dados da partida e escalação dos times são obrigatórios.' });
    }

    try {
        const check = await pool.query('SELECT id FROM historico_sorteios WHERE data_partida::date = $1::date', [data_partida]);
        if (check.rows.length > 0) {
            return res.status(400).json({ erro: 'Esta rodada já possui um sorteio confirmado e travado.' });
        }

        const q = `INSERT INTO historico_sorteios (data_partida, num_times, dados_times) VALUES ($1, $2, $3) RETURNING *;`;
        const r = await pool.query(q, [data_partida, num_times, JSON.stringify(dados_times)]);
        res.status(201).json({ mensagem: 'Sorteio confirmado e salvo no histórico com sucesso!', registro: r.rows[0] });
    } catch (err) {
        console.error('Erro ao salvar sorteio:', err);
        res.status(500).json({ erro: 'Erro ao salvar histórico do sorteio.' });
    }
});

app.get('/api/sorteios', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM historico_sorteios ORDER BY data_partida DESC, id DESC LIMIT 50');
        res.json(r.rows);
    } catch (err) {
        console.error('Erro ao buscar histórico de sorteios:', err);
        res.status(500).json({ erro: 'Erro ao buscar histórico.' });
    }
});

// ================= FINANCEIRO =================
app.get('/api/financeiro', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro']), async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM financeiro_lancamentos ORDER BY data_lancamento DESC, id DESC');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar financeiro.' }); }
});

app.post('/api/financeiro', verificarPerfisPermitidos(['admin', 'gestor', 'tesoureiro']), async (req, res) => {
    const { descricao, tipo, valor, data_lancamento } = req.body;
    try {
        const q = `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, $2, $3, $4) RETURNING *;`;
        const r = await pool.query(q, [descricao, tipo, valor, data_lancamento || new Date()]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao lançar transação.' }); }
});

app.delete('/api/financeiro/:id', verificarPerfisPermitidos(['admin', 'tesoureiro']), async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM financeiro_lancamentos WHERE id=$1', [id]);
        res.json({ mensagem: 'Lançamento removido.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir lançamento.' }); }
});

// ================= CONFIGURAÇÕES =================
app.get('/api/configuracoes', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM configuracoes_clube');
        const configs = {};
        r.rows.forEach(row => { configs[row.chave] = row.valor; });
        res.json(configs);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar configurações' }); }
});

app.post('/api/configuracoes', verificarAdmin, async (req, res) => {
    const configs = req.body;
    try {
        for (const [chave, valor] of Object.entries(configs)) {
            await pool.query(
                `INSERT INTO configuracoes_clube (chave, valor) VALUES ($1, $2) 
                 ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
                [chave, valor]
            );
        }
        res.json({ mensagem: 'Configurações atualizadas com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar configs:', err);
        res.status(500).json({ erro: 'Erro ao salvar configurações.' });
    }
});

// ================= USUÁRIOS =================
app.get('/api/usuarios', verificarAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nome, email, perfil FROM usuarios ORDER BY id ASC');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao listar utilizadores.' }); }
});

app.post('/api/usuarios', verificarAdmin, async (req, res) => {
    const { nome, email, senha, perfil } = req.body;
    try {
        const hashed = await bcrypt.hash(senha, 10);
        const r = await pool.query('INSERT INTO usuarios (nome, email, senha, perfil) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, perfil;', [nome, email, hashed, perfil || 'usuario']);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao criar utilizador.' }); }
});

app.put('/api/usuarios/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, email, senha, perfil } = req.body;
    try {
        if (senha && senha.trim() !== '') {
            const hashed = await bcrypt.hash(senha, 10);
            const r = await pool.query('UPDATE usuarios SET nome=$1, email=$2, senha=$3, perfil=$4 WHERE id=$5 RETURNING id, nome, email, perfil;', [nome, email, hashed, perfil, id]);
            return res.json(r.rows[0]);
        } else {
            const r = await pool.query('UPDATE usuarios SET nome=$1, email=$2, perfil=$3 WHERE id=$4 RETURNING id, nome, email, perfil;', [nome, email, perfil, id]);
            return res.json(r.rows[0]);
        }
    } catch (err) { res.status(500).json({ erro: 'Erro ao atualizar utilizador.' }); }
});

app.delete('/api/usuarios/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id=$1', [id]);
        res.json({ mensagem: 'Utilizador removido.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir utilizador.' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});