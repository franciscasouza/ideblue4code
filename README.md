# Carrinos IDE

Plataforma web para programar Arduino com blocos ou código, gravando direto pela USB do navegador.

- **Blocos** (Blockly, em português) geram o código C++ ao vivo, lado a lado com o editor de código (Monaco).
- **Placas:** Arduino Uno, Mega 2560 e Nano, oficiais ou genéricas (CH340, FTDI).
- **USB:** Web Serial API. Funciona no Chrome e no Edge para computador.
- **Compilação:** no servidor, com `arduino-cli` dentro do container Docker.
- **Gravação:** feita no navegador (STK500v1 para Uno/Nano, STK500v2 para Mega).

## Rodar na VPS

```bash
docker compose up -d --build
```

O site fica na porta 8080. A Web Serial só funciona em página **HTTPS** (ou `localhost`),
então na VPS coloque um proxy com certificado na frente (Caddy, Nginx + Let's Encrypt, Traefik).

Exemplo com Caddy:

```
ide.seudominio.com.br {
  reverse_proxy localhost:8080
}
```

## Desenvolvimento

```bash
npm install
npm run dev        # site em http://localhost:5173
npm run build && npm start   # servidor em http://localhost:8080 (precisa do arduino-cli instalado)
```

## Estrutura

| Arquivo | O que faz |
|---|---|
| `src/blocks.js` | Blocos e categorias da caixa de ferramentas |
| `src/generator.js` | Converte blocos em C++ do Arduino |
| `src/serial.js` | Detecção da placa, monitor serial e gravação |
| `src/main.js` | Interface: editores, botões, salvar/abrir |
| `server/index.js` | Entrega o site e compila em `/api/compile` |

## Blocos do carrinho

O bloco de motor assume ponte H tipo L298N: motor esquerdo no EN 5 e IN 7/8, direito no EN 6 e IN 9/10.
O sensor de distância é o ultrassônico HC-SR04.
