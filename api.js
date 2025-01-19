import express from 'express';
import cors from 'cors';
import { downloadAndExtractData } from './scraper.js';

const app = express();

// Configuração básica
app.use(express.json());
app.use(cors());

// Middleware para validação de URL
const validateUrl = (req, res, next) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
        new URL(url);
        if (!url.includes('cnetmobile.estaleiro.serpro.gov.br')) {
            return res.status(400).json({ error: 'URL inválida. Deve ser uma URL do ComprasNet' });
        }
        next();
    } catch (err) {
        return res.status(400).json({ error: 'URL inválida' });
    }
};

app.get('/', (req, res) => {
    res.json({
        status: 'API está online',
        endpoints: {
            health: {
                method: 'GET',
                path: '/health',
                description: 'Verifica o status da API'
            },
            extract: {
                method: 'POST',
                path: '/extract',
                description: 'Extrai dados do ComprasNet',
                body: {
                    url: 'string (URL do ComprasNet)'
                }
            }
        },
        exemplo: {
            request: {
                method: 'POST',
                url: '/extract',
                body: {
                    url: 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/...'
                }
            }
        }
    });
});

// Rota principal
app.post('/extract', validateUrl, async (req, res) => {
    try {
        const { url } = req.body;
        const result = await downloadAndExtractData(url);
        
        if (!result.success) {
            return res.status(500).json({
                error: 'Falha ao extrair dados',
                details: result.error
            });
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'Erro interno do servidor',
            details: error.message
        });
    }
});

// Rota de verificação de saúde
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
