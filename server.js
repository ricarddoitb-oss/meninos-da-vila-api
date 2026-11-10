const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Configuração do CORS para aceitar requisições de qualquer origem (GitHub Pages)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_meninos_da_vila';

// Conexão segura com o PostgreSQL (usando a porta do Pooler 6543)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('🟢 Conectado ao PostgreSQL com segurança!'))
    .catch(err => console.error('🔴 Erro na conexão com o banco:', err));

// --- ROTA DE STATUS ---
app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', sistema: 'Clube Meninos da Vila' });
});

// --- ROTA DE LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (resultado.rows.length === 0) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
        }

        const usuario = resultado.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
        }

        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            mensagem: 'Login realizado com sucesso!',
            token,
            usuario: { nome: usuario.nome, email: usuario.email, perfil: usuario.perfil }
        });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ erro: 'Erro interno ao realizar login.' });
    }
});

// --- ROTA DE JOGADORES (GET) ---
app.get('/api/jogadores', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM jogadores ORDER BY id ASC');
        res.json(resultado.rows);
    } catch (err) {
        console.error('Erro ao buscar jogadores:', err);
        res.status(500).json({ erro: 'Erro ao buscar jogadores' });
    }
});

// --- ROTA DE JOGADORES (POST - Com proteção básica) ---
app.post('/api/jogadores', async (req, res) => {
    const { nome, apelido, telefone, posicao, nivel } = req.body;
    if (!nome || !posicao) return res.status(400).json({ erro: 'Nome e posição são obrigatórios.' });

    try {
        const query = `
            INSERT INTO jogadores (nome, apelido, telefone, posicao, nivel, gols, status_mensalidade, ativo)
            VALUES ($1, $2, $3, $4, $5, 0, 'Pendente', TRUE)
            RETURNING *;
        `;
        const valores = [nome, apelido || '', telefone || '', posicao, nivel || 3];
        const novoJogador = await pool.query(query, valores);
        res.status(201).json(novoJogador.rows[0]);
    } catch (err) {
        console.error('Erro ao cadastrar atleta:', err);
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' });
    }
});

// --- CONFIGURAÇÕES DO CLUBE (GET) ---
app.get('/api/configuracoes', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM configuracoes_clube');
        const configs = {};
        resultado.rows.forEach(row => {
            configs[row.chave] = row.valor;
        });
        res.json(configs);
    } catch (err) {
        console.error('Erro ao buscar configurações:', err);
        res.status(500).json({ erro: 'Erro ao buscar configurações' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});