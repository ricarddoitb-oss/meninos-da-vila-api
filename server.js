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

app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', sistema: 'Clube Meninos da Vila' });
});

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length === 0) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
        const usuario = resultado.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

        const token = jwt.sign({ id: usuario.id, nome: usuario.nome, perfil: usuario.perfil }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ mensagem: 'Login realizado com sucesso!', token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil } });
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno no login.' });
    }
});

// JOGADORES
app.get('/api/jogadores', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM jogadores ORDER BY id ASC');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar jogadores' }); }
});

app.post('/api/jogadores', verificarAdmin, async (req, res) => {
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols } = req.body;
    try {
        const q = `INSERT INTO jogadores (nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
        const r = await pool.query(q, [nome, data_nascimento || null, telefone || '', posicao, nivel || 3, status_mensalidade || 'Pendente', gols || 0]);
        res.status(201).json(r.rows[0]);
    } catch (err) { 
        console.error('Erro ao cadastrar atleta:', err);
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' }); 
    }
});

app.put('/api/jogadores/:id', verificarAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, data_nascimento, telefone, posicao, nivel, status_mensalidade, gols } = req.body;
    try {
        const q = `UPDATE jogadores SET nome=$1, data_nascimento=$2, telefone=$3, posicao=$4, nivel=$5, status_mensalidade=$6, gols=$7 WHERE id=$8 RETURNING *;`;
        const r = await pool.query(q, [nome, data_nascimento || null, telefone || '', posicao, nivel || 3, status_mensalidade || 'Pendente', gols || 0, id]);
        res.json(r.rows[0]);
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

// FINANCEIRO
app.get('/api/financeiro', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM financeiro_lancamentos ORDER BY data_lancamento DESC, id DESC');
        res.json(r.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar financeiro.' }); }
});

app.post('/api/financeiro', verificarAdmin, async (req, res) => {
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));