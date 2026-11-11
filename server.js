const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'segredo_super_secreto_meninos_da_vila';

// Middleware de Autenticação
function verificarToken(req, res, next) {
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

function verificarGestorOuAdmin(req, res, next) {
    verificarToken(req, res, () => {
        if (req.usuario.perfil === 'admin' || req.usuario.perfil === 'gestor') {
            next();
        } else {
            res.status(403).json({ erro: 'Acesso negado. Requer perfil de gestor ou administrador.' });
        }
    });
}

function verificarAdmin(req, res, next) {
    verificarToken(req, res, () => {
        if (req.usuario.perfil === 'admin') {
            next();
        } else {
            res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
        }
    });
}

// Função Auxiliar de Login Compartilhada
async function processarLogin(req, res) {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }
    try {
        const r = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (r.rows.length === 0) return res.status(401).json({ erro: 'Credenciais inválidas.' });
        const user = r.rows[0];
        
        const senhaValida = await bcrypt.compare(senha, user.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas.' });
        
        const token = jwt.sign({ id: user.id, email: user.email, perfil: user.perfil }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, usuario: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil } });
    } catch (err) {
        console.error('ERRO NO LOGIN:', err.message);
        res.status(500).json({ erro: 'Erro interno no servidor ao processar o login.' });
    }
}

// Rotas de Login (Atendendo tanto /api/auth/login quanto /api/login)
app.post('/api/auth/login', processarLogin);
app.post('/api/login', processarLogin);

// ================= ROTAS DE CONFIGURAÇÕES =================
app.get('/api/configuracoes', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM configuracoes LIMIT 1');
        res.json(r.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar configurações.' });
    }
});

app.post('/api/configuracoes', verificarAdmin, async (req, res) => {
    const { nome_clube, subtitulo_clube, logo_url, partida_data, partida_local, partida_horario, partida_custo } = req.body;
    try {
        await pool.query('DELETE FROM configuracoes');
        const q = `INSERT INTO configuracoes (nome_clube, subtitulo_clube, logo_url, partida_data, partida_local, partida_horario, partida_custo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
        const r = await pool.query(q, [nome_clube, subtitulo_clube, logo_url, partida_data, partida_local, partida_horario, partida_custo]);
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar configurações.' });
    }
});

// ================= ROTAS DE JOGADORES =================
app.get('/api/jogadores', async (req, res) => {
    try {
        const q = `
            SELECT j.*, 
            (SELECT COUNT(*) FROM presencas p WHERE p.jogador_id = j.id) as total_participacoes 
            FROM jogadores j ORDER BY j.nome ASC;
        `;
        const r = await pool.query(q);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar jogadores.' });
    }
});

app.post('/api/jogadores', verificarGestorOuAdmin, async (req, res) => {
    const { nome, data_nascimento, telefone, funcao_grupo, status_aptidao, posicao, status_mensalidade, gols } = req.body;
    try {
        const q = `INSERT INTO jogadores (nome, data_nascimento, telefone, funcao_grupo, status_aptidao, posicao, status_mensalidade, gols) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`;
        const r = await pool.query(q, [nome, data_nascimento, telefone, funcao_grupo || 'Atleta', status_aptidao || 'Ativo', posicao, status_mensalidade || 'Pendente', gols || 0]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' });
    }
});

app.put('/api/jogadores/:id', verificarGestorOuAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, data_nascimento, telefone, funcao_grupo, status_aptidao, posicao, status_mensalidade, gols } = req.body;
    try {
        const q = `UPDATE jogadores SET nome=$1, data_nascimento=$2, telefone=$3, funcao_grupo=$4, status_aptidao=$5, posicao=$6, status_mensalidade=$7, gols=$8 WHERE id=$9 RETURNING *;`;
        const r = await pool.query(q, [nome, data_nascimento, telefone, funcao_grupo, status_aptidao, posicao, status_mensalidade, gols, id]);
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar atleta.' });
    }
});

app.delete('/api/jogadores/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM presencas WHERE jogador_id = $1', [id]);
        await pool.query('DELETE FROM jogadores WHERE id = $1', [id]);
        res.json({ mensagem: 'Atleta excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao excluir atleta.' });
    }
});

// ================= ROTAS DE PRESENÇAS =================
app.post('/api/presencas', verificarGestorOuAdmin, async (req, res) => {
    const { data_partida, jogador_ids } = req.body;
    if (!data_partida || !Array.isArray(jogador_ids)) {
        return res.status(400).json({ erro: 'Data da partida e IDs dos jogadores são obrigatórios.' });
    }
    try {
        for (const jId of jogador_ids) {
            const check = await pool.query('SELECT id FROM presencas WHERE jogador_id = $1 AND data_partida = $2', [jId, data_partida]);
            if (check.rows.length === 0) {
                await pool.query('INSERT INTO presencas (jogador_id, data_partida) VALUES ($1, $2)', [jId, data_partida]);
            }
        }
        res.json({ mensagem: 'Presenças registradas com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao registrar presenças.' });
    }
});

app.delete('/api/presencas', verificarGestorOuAdmin, async (req, res) => {
    const { jogador_id, data_partida } = req.body;
    try {
        await pool.query('DELETE FROM presencas WHERE jogador_id = $1 AND data_partida = $2', [jogador_id, data_partida]);
        res.json({ mensagem: 'Presença removida com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao remover presença.' });
    }
});

// ================= ROTAS DE SORTEIOS (Com Trava de Data Única) =================
app.get('/api/sorteios', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM historico_sorteios ORDER BY data_partida DESC, id DESC;');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar histórico de sorteios.' });
    }
});

app.post('/api/sorteios', verificarGestorOuAdmin, async (req, res) => {
    const { data_partida, num_times, dados_times, local_partida } = req.body;
    if (!data_partida || !dados_times) {
        return res.status(400).json({ erro: 'Dados obrigatórios ausentes.' });
    }
    try {
        const check = await pool.query('SELECT id FROM historico_sorteios WHERE data_partida = $1', [data_partida]);
        if (check.rows.length > 0) {
            return res.status(400).json({ erro: 'Já existe um sorteio confirmado e travado para esta data. Só é permitido um sorteio por rodada.' });
        }

        const q = `INSERT INTO historico_sorteios (data_partida, num_times, dados_times, local_partida) VALUES ($1, $2, $3, $4) RETURNING *;`;
        const r = await pool.query(q, [data_partida, num_times, JSON.stringify(dados_times), local_partida]);
        res.status(201).json({ mensagem: 'Sorteio confirmado e salvo no histórico!', registro: r.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar histórico do sorteio.' });
    }
});

// ================= ROTAS FINANCEIRAS =================
app.get('/api/financeiro', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM livro_caixa ORDER BY data_lancamento DESC, id DESC;');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar dados financeiros.' });
    }
});

app.post('/api/financeiro', verificarGestorOuAdmin, async (req, res) => {
    const { descricao, tipo, valor, data_lancamento } = req.body;
    try {
        const q = `INSERT INTO livro_caixa (descricao, tipo, valor, data_lancamento) VALUES ($1, $2, $3, $4) RETURNING *;`;
        const r = await pool.query(q, [descricao, tipo, valor, data_lancamento || new Date()]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao registrar lançamento.' });
    }
});

app.delete('/api/financeiro/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM livro_caixa WHERE id = $1', [id]);
        res.json({ mensagem: 'Lançamento excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao excluir lançamento.' });
    }
});

// ================= ROTAS DE USUÁRIOS =================
app.get('/api/usuarios', verificarAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nome, email, perfil FROM usuarios ORDER BY nome ASC;');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar usuários.' });
    }
});

app.post('/api/usuarios', verificarAdmin, async (req, res) => {
    const { nome, email, senha, perfil } = req.body;
    try {
        const hash = await bcrypt.hash(senha, 10);
        const q = `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, perfil;`;
        const r = await pool.query(q, [nome, email, hash, perfil || 'usuario']);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao criar usuário.' });
    }
});

app.delete('/api/usuarios/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ mensagem: 'Usuário excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao excluir usuário.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));