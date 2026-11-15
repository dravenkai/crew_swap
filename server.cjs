const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

loadEnvFile(path.join(__dirname, '.env'));

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

You are in a live chat with the operator. Hold a real conversation:
- Remember earlier turns in this thread and resolve follow-ups (“her”, “that task”, “yes”, “what next?”).
- Ask a short clarifying question when the request is ambiguous.
- Keep replies concise (usually 2–5 short sentences or a tight bullet list). Prefer concrete UI next steps.
- Do not invent medical diagnoses. Duty decisions stay with the medical officer.
- Use the live crew/context snapshot when answering about current status.

Domain:
- Flow: Gather (sleep + fatigue) → Evaluate (stand-down / available) → Act (replan coverage + Earth packet).
- Default crew: Aung Min (Commander), Thiri Htet (Systems specialist — often flagged first), Kaung Htet (Flight engineer), May Thazin (Crew medical officer).
- Skills and cooling-loop / commander requirements are editable (Crew health → Edit skills).
- Cooling loop inspection needs configured specialist + commander skills. Stand-down opens coverage gaps.
- Views: Overview, Crew health, Mission plan, Decision log.`;

function loadEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* optional .env */
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 200_000) {
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

function beginSse(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive'
  });
}

function sse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalize(text) {
  return String(text || '').toLowerCase().trim();
}

function crewList(context) {
  return Array.isArray(context?.crew) ? context.crew : [];
}

function findCrew(context, hint) {
  const q = normalize(hint);
  const crew = crewList(context);
  if (!crew.length) return null;
  if (!q) {
    return crew.find((c) => c.state === 'review' || c.state === 'down') || crew[0];
  }
  return (
    crew.find((c) => normalize(c.name).includes(q) || normalize(c.id).includes(q) || normalize(c.role).includes(q)) ||
    null
  );
}

function resolveSubject(message, history, context) {
  const named = findCrew(context, message);
  if (named) return named;
  const blob = [...(history || []).map((t) => t.content), message].join(' ');
  for (const person of crewList(context)) {
    if (person?.name && blob.toLowerCase().includes(String(person.name).toLowerCase())) return person;
  }
  const selected = context?.selected && crewList(context).find((c) => c.id === context.selected);
  if (selected) return selected;
  return crewList(context).find((c) => c.state === 'review' || c.state === 'down') || null;
}

function crewLine(c) {
  if (!c) return '';
  const bits = [c.name || c.id, c.role, c.state];
  if (c.sleep != null) bits.push(`sleep ${Number(c.sleep).toFixed(1)} h`);
  if (c.fatigue != null) bits.push(`fatigue ${c.fatigue}/10`);
  if (Array.isArray(c.skills) && c.skills.length) bits.push(c.skills.join(', '));
  return bits.filter(Boolean).join(' · ');
}

function crewSnippet(context) {
  const crew = crewList(context);
  if (!crew.length) {
    return 'Default demo: Thiri Htet starts in review with short sleep; others available.';
  }
  return crew.map(crewLine).join('\n');
}

function lastAssistant(history) {
  const turns = Array.isArray(history) ? history : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]?.role === 'assistant' && turns[i].content) return String(turns[i].content);
  }
  return '';
}

function topicFrom(text) {
  const q = normalize(text);
  if (/(stand\b.{0,24}\bdown\b|stood\s+down|duty|clearance|return to duty|\bflag\b)/.test(q)) return 'duty';
  if (/(coverage|mission plan|replan|inspection|cooling|assign|defer|qualif|skill)/.test(q)) return 'coverage';
  if (/(earth|packet|handoff|export|decision log)/.test(q)) return 'packet';
  if (/(sleep|fatigue|check-?in|bidsleep|who.*(review|attention)|status|crew)/.test(q)) return 'health';
  if (/(nav|where|overview|sidebar|how (do|to)|ui|interface)/.test(q)) return 'nav';
  return 'general';
}

function followUpsFor(topic, context) {
  const subject = crewList(context).find((c) => c.state === 'review' || c.state === 'down');
  const name = subject?.name || 'Thiri Htet';
  const map = {
    health: [`How do I update ${name}'s check-in?`, 'Who is flagged right now?', 'What does the fatigue score mean?'],
    duty: [`Walk me through standing ${name} down`, 'What happens after stand-down?', 'How do I return someone to duty?'],
    coverage: ['Who can cover the cooling loop?', 'How do I edit skills?', 'What if I defer the inspection?'],
    packet: ['What is in the Earth packet?', 'Where is the decision log?', 'What should I confirm before download?'],
    nav: ['Open Crew health', 'Where is Mission plan?', 'What does Overview show?'],
    general: ['Who needs review?', 'How does coverage work?', 'What should I do next?']
  };
  return map[topic] || map.general;
}

function buildLocalReply(message, history, context) {
  const q = normalize(message);
  const prior = lastAssistant(history);
  const priorTopic = topicFrom(`${prior}\n${(history || []).map((t) => t.content).join('\n')}`);
  const subject = resolveSubject(message, history, context);
  const view = context?.view || 'overview';
  const crew = crewSnippet(context);
  const shortFollowUp = /^(yes|yeah|yep|y|ok|okay|sure|do it|go ahead|please|thanks|thank you|got it|continue|next|and then\??|what next\??|then what\??)$/.test(q);
  const pronounFollowUp = /\b(her|him|them|she|he|that|this|those)\b/.test(q) || /^(what about|and |then |how\?|why\?|who\?|which\?)/.test(q);

  let topic = topicFrom(message);
  // Only inherit the prior topic for vague follow-ups — not when this turn already names a clear intent.
  if (topic === 'general' && (shortFollowUp || pronounFollowUp) && priorTopic !== 'general') topic = priorTopic;

  let reply = '';

  if (!q) {
    reply = 'Ask me anything about the current crew state, stand-down, coverage, or where a control lives.';
  } else if (/(hello|hi\b|hey|good (morning|afternoon)|what can you)/.test(q)) {
    reply =
      `Hey — I’m your mission chat for this console.\n\n` +
      `You’re on **${view}**. I can use the live crew snapshot and keep this thread going, so follow-ups like “what about her?” work.\n\n` +
      `Right now:\n${crew}`;
  } else if (topic === 'health') {
    const focus = subject ? `\n\nFocusing on **${subject.name}**: ${crewLine(subject)}.` : '';
    reply =
      `On **Crew health**, open a crew card to read sleep, fatigue, and the check-in note.${focus}\n\n` +
      `Use **Update check-in** to change sleep/fatigue (that queues review). Auto-flag ≥4 recommends stand-down; a human still confirms.\n\n` +
      `Full snapshot:\n${crew}`;
  } else if (topic === 'duty') {
    const who = subject?.name || 'the flagged crew member';
    reply =
      `Duty clearance for **${who}**:\n` +
      `1. **Crew health** → select them\n` +
      `2. **Review duty status** / **Confirm flag**\n` +
      `3. Keep **available** or **Stand down**\n\n` +
      `Stand-down removes them from coverage and usually opens **Review coverage** next. Same dialog returns them to duty later.` +
      (subject ? `\n\nCurrent: ${crewLine(subject)}.` : '');
  } else if (topic === 'coverage') {
    reply =
      `Coverage lives on **Mission plan**.\n\n` +
      `• Cooling loop needs the configured specialist skills + commander skills (edit under **Edit skills**).\n` +
      `• After a stand-down, open **Review coverage**, pick a qualified replacement or defer, then **Confirm plan**.\n` +
      `• Assigning Kaung Htet can move plant growth to 13:00.\n\n` +
      `Eligible people depend on saved skills + duty state:\n${crew}`;
  } else if (topic === 'packet') {
    reply =
      `**Earth packet** (footer, or after confirming a plan) summarizes duty, sleep evidence, today’s tasks, and the latest decision. ` +
      `**Decision log** is the audit trail — export JSON there when you want a file.`;
  } else if (topic === 'nav') {
    reply =
      `Quick map (you’re on **${view}**):\n` +
      `• **Overview** — alert + next operation\n` +
      `• **Crew health** — check-ins & duty\n` +
      `• **Mission plan** — schedule & coverage\n` +
      `• **Decision log** — recorded choices\n\n` +
      `Medical path: alert → health → duty → coverage if needed. Commander path: mission plan → coverage → packet.`;
  } else if (shortFollowUp) {
    reply =
      priorTopic === 'duty'
        ? `Alright — select ${subject?.name || 'the crew member'} on **Crew health**, open duty review, then confirm stand-down. I’ll stay on coverage next if you want.`
        : priorTopic === 'coverage'
          ? 'Open **Mission plan → Review coverage**, choose a qualified replacement or defer, then confirm the plan version.'
          : `Got it. From **${view}**, tell me whether you want health review, stand-down, or coverage and I’ll give the exact clicks.`;
  } else {
    reply =
      `I can keep chatting about this mission state — sleep/check-ins, stand-down, coverage/skills, or navigation.\n\n` +
      `Live snapshot:\n${crew}\n\n` +
      `Ask a follow-up in plain language (for example “stand her down” or “who can cover?”).`;
  }

  return {
    reply,
    mode: openaiKey ? 'live' : 'local',
    followUps: followUpsFor(topic, context),
    topic
  };
}

async function openaiReply(message, history, context) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content:
        'Operator context snapshot:\n' +
        crewSnippet(context) +
        (context?.view ? `\nCurrent view: ${context.view}` : '') +
        (context?.selected ? `\nSelected crew id: ${context.selected}` : '') +
        (context?.assigned ? `\nCooling loop assignee id: ${context.assigned}` : '') +
        (context?.requirements ? `\nRequirements: ${JSON.stringify(context.requirements)}` : '')
    }
  ];

  if (Array.isArray(history)) {
    for (const turn of history.slice(-12)) {
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
      temperature: 0.5,
      max_tokens: 700,
      stream: true,
      messages
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    const error = new Error(`OpenAI error ${upstream.status}`);
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return upstream;
}

async function streamOpenAI(upstream, response) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const token = json?.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          sse(response, { type: 'token', text: token });
        }
      } catch {
        /* ignore partial */
      }
    }
  }

  return full.trim();
}

async function streamText(response, text, delayMs = 12) {
  const chunks = String(text).match(/\s+|\S+/g) || [text];
  for (const chunk of chunks) {
    sse(response, { type: 'token', text: chunk });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function handleChat(request, response) {
  if (request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      mode: openaiKey ? 'live' : 'local',
      model: openaiKey ? openaiModel : null,
      chat: true
    });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(request)) || '{}');
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
  const wantStream = payload.stream !== false;

  if (!wantStream) {
    if (openaiKey) {
      try {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: openaiModel,
            temperature: 0.5,
            max_tokens: 700,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'system', content: 'Operator context snapshot:\n' + crewSnippet(context) },
              ...history.slice(-12).map((turn) => ({
                role: turn.role === 'assistant' ? 'assistant' : 'user',
                content: String(turn.content || '').slice(0, 4000)
              })),
              { role: 'user', content: message.slice(0, 4000) }
            ]
          })
        });
        if (!upstream.ok) throw new Error(`OpenAI error ${upstream.status}`);
        const data = await upstream.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('Empty model response');
        sendJson(response, 200, {
          reply,
          mode: 'live',
          followUps: followUpsFor(topicFrom(message + ' ' + reply), context)
        });
        return;
      } catch (error) {
        const local = buildLocalReply(message, history, context);
        sendJson(response, 200, {
          ...local,
          mode: 'local',
          notice: 'Live AI unavailable; continuing in local chat. ' + (error.message || '')
        });
        return;
      }
    }

    sendJson(response, 200, buildLocalReply(message, history, context));
    return;
  }

  beginSse(response);

  if (openaiKey) {
    try {
      sse(response, { type: 'meta', mode: 'live', model: openaiModel });
      const upstream = await openaiReply(message, history, context);
      const full = await streamOpenAI(upstream, response);
      sse(response, {
        type: 'done',
        mode: 'live',
        followUps: followUpsFor(topicFrom(message + ' ' + full), context)
      });
      response.end();
      return;
    } catch (error) {
      const local = buildLocalReply(message, history, context);
      sse(response, {
        type: 'meta',
        mode: 'local',
        notice: 'Live AI unavailable; continuing in local chat. ' + (error.message || '')
      });
      await streamText(response, local.reply, 8);
      sse(response, { type: 'done', mode: 'local', followUps: local.followUps });
      response.end();
      return;
    }
  }

  const local = buildLocalReply(message, history, context);
  sse(response, { type: 'meta', mode: 'local' });
  await streamText(response, local.reply, 10);
  sse(response, { type: 'done', mode: 'local', followUps: local.followUps });
  response.end();
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
      if (!response.headersSent) {
        sendJson(response, 500, { error: error.message || 'Chat failed' });
      } else {
        try {
          sse(response, { type: 'error', error: error.message || 'Chat failed' });
          response.end();
        } catch {
          /* ignore */
        }
      }
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
  console.log(
    openaiKey
      ? `Mission assistant: live chat (${openaiModel})`
      : 'Mission assistant: local conversational chat (set OPENAI_API_KEY or .env for Live AI)'
  );
});
