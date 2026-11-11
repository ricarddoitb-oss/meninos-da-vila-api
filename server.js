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

function verificarAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        if (decoded.perfil !== 'admin') {
            return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
        }
        next();
    } catch (err) {
        return res.status(403).json({ erro: 'Token inválido ou expirado.' });
    }
}

function verificarGestorOuAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        if (decoded.perfil !== 'admin' && decoded.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Acesso negado. Requer perfil de gestor ou administrador.' });
        }
        next();
    } catch (err) {
        return res.status(403).json({ erro: 'Token inválido ou expirado.' });
    }
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

// JOGADORES
app.get('/api/jogadores', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT j.*, 
            (SELECT COUNT(*) FROM presencas_partidas p WHERE p.jogador_id = j.id) as total_participacoes 
            FROM jogadores j ORDER BY id ASC
        `);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar jogadores' }); }
});

app.post('/api/jogadores', verificarGestorOuAdmin, async (req, res) => {
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols, funcao_grupo, status_aptidao } = req.body;
    
    if (!nome || !data_nascimento || !telefone) {
        return res.status(400).json({ erro: 'Nome, Data de Nascimento e Telefone são obrigatórios.' });
    }

    try {
        const q = `INSERT INTO jogadores (nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols, funcao_grupo, status_aptidao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;`;
        const r = await pool.query(q, [
            nome, 
            data_nascimento, 
            telefone, 
            posicao || 'Meia', 
            parseInt(nivel) || 3, 
            status_mensalidade || 'Pendente', 
            parseInt(gols) || 0,
            funcao_grupo || 'Atleta',
            status_aptidao || 'Ativo'
        ]);

        const novoJogador = r.rows[0];

        if (status_mensalidade === 'Pago') {
            const valorMensalidade = (posicao === 'Goleiro') ? 20.00 : 40.00;
            await pool.query(
                `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, 'Entrada', $2, CURRENT_DATE)`,
                [`Mensalidade - ${nome}`, valorMensalidade]
            );
        }

        res.status(201).json(novoJogador);
    } catch (err) { 
        console.error('Erro ao cadastrar atleta:', err);
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' }); 
    }
});

app.put('/api/jogadores/:id', verificarGestorOuAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols, funcao_grupo, status_aptidao } = req.body;
    
    if (!nome || !data_nascimento || !telefone) {
        return res.status(400).json({ erro: 'Nome, Data de Nascimento e Telefone são obrigatórios.' });
    }

    try {
        const atletaAntigo = await pool.query('SELECT * FROM jogadores WHERE id = $1', [id]);
        const statusAnterior = atletaAntigo.rows[0]?.status_mensalidade;

        const q = `UPDATE jogadores SET nome=$1, data_nascimento=$2, telefone=$3, posicao=$4, nivel=$5, status_mensalidade=$6, gols=$7, funcao_grupo=$8, status_aptidao=$9 WHERE id=$10 RETURNING *;`;
        const r = await pool.query(q, [
            nome, 
            data_nascimento, 
            telefone, 
            posicao, 
            parseInt(nivel) || 3, 
            status_mensalidade || 'Pendente', 
            parseInt(gols) || 0, 
            funcao_grupo || 'Atleta',
            status_aptidao || 'Ativo',
            id
        ]);

        const jogadorAtualizado = r.rows[0];

        if (statusAnterior !== 'Pago' && status_mensalidade === 'Pago') {
            const valorMensalidade = (posicao === 'Goleiro') ? 20.00 : 40.00;
            await pool.query(
                `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, 'Entrada', $2, CURRENT_DATE)`,
                [`Mensalidade - ${nome}`, valorMensalidade]
            );
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

// PRESENÇAS
app.post('/api/presencas', verificarGestorOuAdmin, async (req, res) => {
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

app.delete('/api/presencas', verificarGestorOuAdmin, async (req, res) => {
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

// HISTÓRICO E SALVAMENTO DE SORTEIOS (COM VALIDAÇÃO DE TRAVA POR DATA)
app.post('/api/sorteios', verificarGestorOuAdmin, async (req, res) => {
    const { data_partida, num_times, dados_times } = req.body;
    
    if (!data_partida || !dados_times) {
        return res.status(400).json({ erro: 'Dados da partida e escalação dos times são obrigatórios.' });
    }

    try {
        const check = await pool.query('SELECT id FROM historico_sorteios WHERE data_partida::date = $1::date', [data_partida]);
        if (check.rows.length > 0) {
            return res.status(400).json({ erro: 'Esta rodada já possui um sorteio confirmado e travado. Altere a data da próxima partida para realizar um novo sorteio.' });
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

// FINANCEIRO
app.get('/api/financeiro', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM financeiro_lancamentos ORDER BY data_lancamento DESC, id DESC');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar financeiro.' }); }
});

app.post('/api/financeiro', verificarGestorOuAdmin, async (req, res) => {
    const { descricao, tipo, valor, data_lancamento } = req.body;
    try {
        const q = `INSERT INTO financeiro_lancamentos (descricao, tipo, valor, data_lancamento) VALUES ($1, $2, $3, $4) RETURNING *;`;
        const r = await pool.query(q, [descricao, tipo, valor, data_lancamento || new Date()]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao lançar transação.' }); }
});

app.delete('/api/financeiro/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM financeiro_lancamentos WHERE id=$1', [id]);
        res.json({ mensagem: 'Lançamento removido.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir lançamento.' }); }
});

// CONFIGURAÇÕES
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

// USUÁRIOS
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