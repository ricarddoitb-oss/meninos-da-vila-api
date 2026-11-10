const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Conexão segura com o PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('🟢 Conectado ao PostgreSQL com segurança!'))
    .catch(err => console.error('🔴 Erro na conexão com o banco:', err));

// Rota de Status
app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', sistema: 'Clube Meninos da Vila' });
});

// Listar jogadores ativos
app.get('/api/jogadores', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM jogadores WHERE ativo = TRUE ORDER BY nome ASC');
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar jogadores.' });
    }
});

// Cadastrar novo jogador
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
        res.status(500).json({ erro: 'Erro ao cadastrar atleta.' });
    }
});

// Inicialização obrigatória do servidor no final
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});