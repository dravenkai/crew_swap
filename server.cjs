const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'dist');
const port = Number(process.env.CREW_SWAP_PORT || 43730);
const openaiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const SYSTEM_PROMPT = `You are the Mission Assistant for Crew Swap, a Mars-transit mission-readiness console (Ares expedition, Transit Day 187).

Help operators with:
1. Sleep/fatigue check-ins and stand-down decisions
2. Mission plan, coverage, and qualifications questions
3. Navigating the Crew Swap UI (Medical officer vs Commander workflows)

Domain facts:
- Flow: Gather (sleep + fatigue) → Evaluate (medical officer stand-down) → Act (replan coverage + Earth handoff packet).
- Sample crew: Aung Min (Commander, EVA command), Thiri Htet (Systems specialist, Cooling systems + EVA systems — check-in needs review by default), Kaung Htet (Flight engineer, Cooling systems + EVA systems), May Thazin (Crew medical officer, Medical operations).
- Thiri Htet’s sleep trend uses measured replay from PhysioNet BIDSleep (participant Bidslab00). Other sleep/fatigue values are fictional scenario data.
- Cooling loop inspection (09:30–11:00 UTC) needs a cooling-systems specialist plus an EVA commander. Standing someone down flags coverage gaps.
- Operator roles: Medical officer focuses on Crew health / duty clearance; Commander focuses on Mission plan / coverage.
- Views: Overview, Crew health, Mission plan, Decision log. Actions include Add check-in, Review duty status, Review coverage, Earth packet, Reset demo.

Tone: concise, calm, operational. Prefer short paragraphs and concrete next steps in the UI. Do not invent real medical diagnoses; remind the operator that duty decisions stay with the medical officer. If asked about live crew state, use any context snapshot the client sends.`;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error('Payload too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function normalize(text) {
  return String(text || '').toLowerCase().trim();
}

function crewSnippet(context) {
  if (!context || !Array.isArray(context.crew) || !context.crew.length) {
    return 'Default demo: Thiri Htet is in “check-in needs review” with low sleep (~4.8 h) and fatigue 7/10. Others start available.';
  }
  return context.crew.map((c) => {
    const bits = [c.name || c.id, c.role, c.state];
    if (c.sleep != null) bits.push(`sleep ${Number(c.sleep).toFixed(1)} h`);
    if (c.fatigue != null) bits.push(`fatigue ${c.fatigue}/10`);
    if (Array.isArray(c.skills) && c.skills.length) bits.push(c.skills.join(', '));
    return bits.filter(Boolean).join(' · ');
  }).join('\n');
}

function fallbackReply(message, context) {
  const q = normalize(message);
  const crew = crewSnippet(context);

  if (!q) {
    return {
      reply: 'Ask about sleep check-ins, stand-down, coverage, qualifications, or how to move through the console.',
      mode: 'fallback'
    };
  }

  if (/(hello|hi\b|hey|help|what can you)/.test(q)) {
    return {
      reply:
        'I’m the Crew Swap mission assistant. I can walk you through sleep/fatigue reviews, stand-down decisions, coverage replanning, and where each control lives.\n\n' +
        'Try: “Who needs review?”, “How do I stand someone down?”, or “How does coverage work?”\n\n' +
        'Current crew snapshot:\n' + crew,
      mode: 'fallback'
    };
  }

  if (/(who.*(review|attention|down)|status|crew status|fatigue|sleep|bidsleep|check-?in)/.test(q)) {
    return {
      reply:
        'Gather starts on **Crew health**.\n\n' +
        '• Open a crew card → read latest sleep, personal reference, fatigue (0–10), and the check-in note.\n' +
        '• Thiri Htet’s trend can load measured BIDSleep replay (Earth-study labels → total sleep time).\n' +
        '• Use **Add check-in** / **Update check-in** to record sleep + fatigue; that queues duty review.\n\n' +
        'Live snapshot:\n' + crew + '\n\n' +
        'Next: if someone shows “Check-in needs review”, open **Review duty status** as the medical officer.',
      mode: 'fallback'
    };
  }

  if (/(stand[\s-]?(someone |them |crew |a crew member )?down|stood down|duty status|return to duty|medical officer|clearance)/.test(q)) {
    return {
      reply:
        'Evaluate is a medical-officer step.\n\n' +
        '1. Go to **Crew health** and select the crew member.\n' +
        '2. Choose **Review duty status**.\n' +
        '3. Confirm **available** or **Confirm stand-down**.\n\n' +
        'Stand-down removes them from available coverage and flags assigned tasks for replanning. Return-to-duty uses the same review when they are already stood down. May Thazin (crew medical officer) is the operator voice for these confirmations in the demo.',
      mode: 'fallback'
    };
  }

  if (/(coverage|mission plan|replan|inspection|cooling|qualif|skill|assign|defer|commander)/.test(q)) {
    return {
      reply:
        'Act happens on **Mission plan**.\n\n' +
        '• Cooling loop inspection (09:30–11:00 UTC) needs **Cooling systems** + an **EVA commander**.\n' +
        '• After a stand-down, open **Review coverage** to assign a qualified replacement or defer.\n' +
        '• Kaung Htet is the usual alternate specialist; assigning him can shift plant growth to 13:00.\n' +
        '• Confirming a plan bumps the plan version and writes the **Decision log**. Finish with **Review Earth packet** for the handoff summary.\n\n' +
        'Commander-facing work lives on Mission plan; medical clearance still gates who is eligible.',
      mode: 'fallback'
    };
  }

  if (/(nav|where|ui|interface|overview|decision log|role|operator|sidebar|how (do|to) (i |we )?(open|find|use|get|navigate))/.test(q)) {
    return {
      reply:
        'Console map:\n\n' +
        '• **Overview** — crew strip + next operation + alert banner.\n' +
        '• **Crew health** — medical officer workspace (check-ins, duty).\n' +
        '• **Mission plan** — schedule, coverage review, plan version.\n' +
        '• **Decision log** — recorded duty/plan choices; export available.\n' +
        '• Sidebar: **Data & references**, **Reset demo**, operator card.\n\n' +
        'Medical officer path: alert → Crew health → Review duty status → Mission plan if coverage breaks.\n' +
        'Commander path: Mission plan → Review coverage → confirm plan → Earth packet.',
      mode: 'fallback'
    };
  }

  if (/(earth|packet|handoff|export|log)/.test(q)) {
    return {
      reply:
        'The **Earth packet** summarizes duty status, sleep evidence for Thiri Htet, today’s tasks, and the latest decision. Open it from the footer (**Review Earth packet**) or after confirming a plan. **Decision log** keeps the audit trail; use **Export log** to download JSON.',
      mode: 'fallback'
    };
  }

  return {
    reply:
      'I can help with sleep/fatigue check-ins, stand-down clearance, coverage/qualifications, and console navigation.\n\n' +
      'Current crew snapshot:\n' + crew + '\n\n' +
      'Ask a more specific question, or use a chip below the composer.',
    mode: 'fallback'
  };
}

async function openaiReply(message, history, context) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: 'Operator context snapshot:\n' + crewSnippet(context) +
        (context?.view ? `\nCurrent view: ${context.view}` : '') +
        (context?.selected ? `\nSelected crew id: ${context.selected}` : '')
    }
  ];

  if (Array.isArray(history)) {
    for (const turn of history.slice(-8)) {
      if (!turn || !turn.content) continue;
      const role = turn.role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role, content: String(turn.content).slice(0, 4000) });
    }
  }

  messages.push({ role: 'user', content: String(message).slice(0, 4000) });

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.4,
      max_tokens: 700,
      messages
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    const error = new Error(`OpenAI error ${upstream.status}`);
    error.detail = detail.slice(0, 300);
    throw error;
  }

  const data = await upstream.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Empty model response');
  return { reply, mode: 'live' };
}

async function handleChat(request, response) {
  if (request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      mode: openaiKey ? 'live' : 'fallback',
      model: openaiKey ? openaiModel : null
    });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(request) || '{}');
  } catch {
    sendJson(response, 400, { error: 'Invalid JSON body' });
    return;
  }

  const message = String(payload.message || '').trim();
  if (!message) {
    sendJson(response, 400, { error: 'message is required' });
    return;
  }

  const history = Array.isArray(payload.history) ? payload.history : [];
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};

  if (!openaiKey) {
    sendJson(response, 200, fallbackReply(message, context));
    return;
  }

  try {
    const result = await openaiReply(message, history, context);
    sendJson(response, 200, result);
  } catch (error) {
    const fallback = fallbackReply(message, context);
    sendJson(response, 200, {
      ...fallback,
      mode: 'fallback',
      notice: 'Live AI unavailable; using offline mission guidance. ' + (error.message || '')
    });
  }
}

function serveStatic(url, response) {
  const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(404).end('Page not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (!/^127\.0\.0\.1:\d+$/.test(request.headers.host || '')) {
    response.writeHead(403).end();
    return;
  }

  let url;
  try {
    url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  if (url === '/api/chat' || url === '/api/chat/') {
    try {
      await handleChat(request, response);
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Chat failed' });
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }

  serveStatic(url, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Crew Swap server ready on http://127.0.0.1:${port}`);
  console.log(openaiKey
    ? `Mission assistant: live AI (${openaiModel})`
    : 'Mission assistant: offline demo fallback (set OPENAI_API_KEY for live AI)');
});
