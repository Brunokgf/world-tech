// /.netlify/functions/criartransacao.js
import fetch from 'node-fetch';
import { getBlob, putBlob } from '@netlify/blob';

const BLOBS_KEY = 'fila-pedidos';

// Função para ler a fila de pedidos
async function lerFila() {
  try {
    const blob = await getBlob(BLOBS_KEY);
    if (!blob) return [];
    return JSON.parse(await blob.text());
  } catch (err) {
    console.error('Erro ao ler fila:', err);
    return [];
  }
}

// Função para escrever a fila de pedidos
async function escreverFila(fila) {
  try {
    await putBlob(BLOBS_KEY, JSON.stringify(fila, null, 2), { contentType: 'application/json' });
  } catch (err) {
    console.error('Erro ao escrever fila:', err);
  }
}

// Função principal da Lambda
export async function handler(event) {
  try {
    // Aceita apenas POST
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, erro: 'Método não permitido' }),
      };
    }

    // Parse do body
    let pedido;
    try {
      pedido = JSON.parse(event.body);
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, erro: 'Body inválido' }),
      };
    }

    // Valida campos obrigatórios
    if (!pedido.formaPagamento || !pedido.total) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, erro: 'Total e formaPagamento obrigatórios' }),
      };
    }

    // Adiciona pedido na fila
    const fila = await lerFila();
    fila.push({ id: Date.now().toString(), ...pedido });
    await escreverFila(fila);

    // Dispara processamento da fila
    if (process.env.URL_BASE) {
      try {
        await fetch(`${process.env.URL_BASE}/.netlify/functions/processarFila`, { method: 'POST' });
      } catch (err) {
        console.error('Erro ao chamar processarFila:', err);
        // Não interrompe, apenas log
      }
    }

    // Retorno OK
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, msg: 'Pedido adicionado e será processado automaticamente' }),
    };
  } catch (err) {
    console.error('Erro geral criarTransacao:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, erro: err.message || 'Erro desconhecido' }),
    };
  }
}
