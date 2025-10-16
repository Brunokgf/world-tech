// /.netlify/functions/criartransacao.js
import fetch from 'node-fetch';

const TITAN_API = 'https://api.titanshub.io/v1/transactions'; // Endpoint TitansHub
const TITAN_API_KEY = process.env.TITAN_API_KEY || 'sk_QkOalDBuWQsGrHKkCYuoh4EbSfqHbYn51rJxnUz4C2wd0Fe1';
const authValue = Buffer.from(`${TITAN_API_KEY}:x`).toString('base64');

export async function handler(event, context) {
  if(event.httpMethod !== 'POST'){
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, erro: 'Método não permitido' }) 
    };
  }

  try {
    const pedido = JSON.parse(event.body);

    // Validações básicas
    if (!pedido.formaPagamento) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, erro: 'Total e formaPagamento obrigatórios' }) 
      };
    }

    let transacaoId, qr_code, qrcodeBase64 = null; // Inicializa base64

    if(pedido.formaPagamento === 'cartao'){
      const txResponse = await fetch(`${TITAN_API}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authValue}`,
          'accept': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(pedido.total * 100),
          paymentMethod: "credit_card",
          card: {
            hash: pedido.token 
          },
          customer: {
            name: pedido.nome || 'nome do cliente',
            email: pedido.email || 'emailcliente@gmail.com',
            document: {
              type: "cpf",
              number: "12780656794"
            }
          },
          "items": [
            {
              "title": "nome do produto",
              "unitPrice": Math.round(pedido.total * 100),
              "quantity": 1,
              "tangible": false
            }
          ]
        })
      });


      const apiResponse = await txResponse.json();

      if(apiResponse.status !== 'waiting_payment') {
        return { 
          statusCode: 404, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, erro: apiResponse.erro || apiResponse.refusedReason || 'Transação recusada' }) 
        };
      }

      transacaoId = apiResponse.id;

      // Retorna 200 para sucesso no cartão
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ok: true, 
          transacaoId
        })
      };

    } else if(pedido.formaPagamento === 'pix'){
      // Gera QR code Pix real
      const pixResponse = await fetch(`${TITAN_API}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authValue}`,
          'accept': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(pedido.total * 100),
          paymentMethod: 'pix',
          customer: {
            name: pedido.nome || 'nome do cliente',
            email: pedido.email || 'emailcliente@gmail.com',
            document: {
              type: "cpf",
              number: "12780656794"
            }
          },
          "items": [
            {
              "title": "nome do produto",
              "unitPrice": Math.round(pedido.total * 100),
              "quantity": 1,
              "tangible": false
            }
          ]
        })
      });

      const apiResponse = await pixResponse.json();

      if(apiResponse.status !== 'waiting_payment') {  // Corrigido: sucesso se status === 'waiting_payment'
        return { 
          statusCode: 400, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, erro: apiResponse.erro || apiResponse.refusedReason || 'PIX recusado' }) 
        };
      }

      qr_code = apiResponse.pix ? apiResponse.pix.qrcode : null;  // Corrigido: extrai qrcode do pix
      transacaoId = apiResponse.id;

      // Gera QR code image via QRServer
      if (qr_code) {
        const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qr_code)}`;
        const qrcodeResponse = await fetch(qrcodeUrl);
        const qrcodeArrayBuffer = await qrcodeResponse.arrayBuffer();
        qrcodeBase64 = Buffer.from(qrcodeArrayBuffer).toString('base64');
      }

      // Retorna 200 para PIX com QR, ID, QR normal e base64
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ok: true, 
          transacaoId, 
          qr_code: qr_code || null,
          qrcodeBase64: qrcodeBase64 || null
        })
      };

    } else {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, erro: 'Forma de pagamento inválida' }) 
      };
    }

  } catch(err){
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, erro: 'Erro no servidor: ' + err.message }) 
    };
  }
}