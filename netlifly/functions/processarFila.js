// /.netlify/functions/processarFila.js
import fetch from 'node-fetch';
import { getBlob, putBlob } from '@netlify/blob';

const TITAN_API = 'https://api.titanshub.io/v1/transactions';
const TITAN_API_KEY = process.env.TITAN_API_KEY;
const authValue = Buffer.from(`${TITAN_API_KEY}:x`).toString('base64');
const BLOBS_KEY = 'fila-pedidos';
const LOTE = 2; // quantidade máxima de pedidos processados por execução

async function lerFila() {
  const blob = await getBlob(BLOBS_KEY);
  if (!blob) return [];
  return JSON.parse(await blob.text());
}

async function escreverFila(fila) {
  await putBlob(BLOBS_KEY, JSON.stringify(fila, null, 2), { contentType: 'application/json' });
}

export async function handler() {
  try {
    const fila = await lerFila();
    if (!fila.length) return { statusCode: 200, body: JSON.stringify({ ok: true, msg: 'Fila vazia' }) };

    const pedidosParaProcessar = fila.slice(0, LOTE);
    const pedidosRestantes = fila.slice(LOTE);
    const resultados = [];

    for (const pedido of pedidosParaProcessar) {
      let resultado = { id: pedido.id, ok: false };

      try {
        const bodyPayload = {
          amount: Math.round(pedido.total * 100),
          customer: {
            name: pedido.nome,
            email: pedido.email,
            document: { type: 'cpf', number: pedido.cpf.replace(/\D/g, '') }
          },
          items: [{ title: 'Produto', unitPrice: Math.round(pedido.total * 100), quantity: 1, tangible: false }]
        };

        if (pedido.formaPagamento === 'pix') {
          bodyPayload.paymentMethod = 'pix';
        } else if (pedido.formaPagamento === 'cartao') {
          bodyPayload.paymentMethod = 'credit_card';
          bodyPayload.card = { hash: pedido.token };
        }

        const res = await fetch(TITAN_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authValue}`,
            accept: 'application/json'
          },
          body: JSON.stringify(bodyPayload)
        });

        const data = await res.json();

        if (data.status === 'waiting_payment') {
          resultado.ok = true;
          resultado.transacaoId = data.id;
          if (pedido.formaPagamento === 'pix') resultado.qr_code = data.pix?.qrcode || null;
        } else {
          resultado.erro = data.erro || data.refusedReason || 'Pagamento recusado';
        }

      } catch (err) {
        resultado.erro = 'Erro na requisição: ' + err.message;
      }

      resultados.push(resultado);
    }

    // Atualiza a fila com os pedidos restantes
    await escreverFila(pedidosRestantes);

    return { statusCode: 200, body: JSON.stringify({ ok: true, processados: resultados, restantes: pedidosRestantes.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, erro: err.message }) };
  }
}
