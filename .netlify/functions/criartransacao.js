// /.netlify/functions/criarTransacao.js
import fetch from 'node-fetch';
import { getBlob, putBlob } from '@netlify/blob';

const BLOBS_KEY = 'fila-pedidos';

async function lerFila() {
  try {
    const blob = await getBlob(BLOBS_KEY);
    if (!blob) return [];
    return JSON.parse(await blob.text());
  } catch {
    return [];
  }
}

async function escreverFila(fila) {
  await putBlob(BLOBS_KEY, JSON.stringify(fila, null, 2), { contentType: 'application/json' });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método não permitido' };

  try {
    const pedido = JSON.parse(event.body);

    if (!pedido.formaPagamento || !pedido.total) {
      return { statusCode: 400, body: 'Total e formaPagamento obrigatórios' };
    }

    // 1️⃣ Adiciona pedido na fila
    const fila = await lerFila();
    fila.push({ id: Date.now().toString(), ...pedido });
    await escreverFila(fila);

    // 2️⃣ Dispara processamento da fila até zerar
    await fetch(`${process.env.URL_BASE}/.netlify/functions/processarFila`, { method: 'POST' });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, msg: 'Pedido adicionado e será processado automaticamente' }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: err.message }) };
  }
}
