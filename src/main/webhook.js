// Discord webhook delivery (main process). Sends real rich embeds via the
// Discord webhook REST API using Node's built-in fetch (Node 18+/Electron).
//
// Each report type builds a styled embed. All sends are best-effort and never
// throw to the caller (failures are logged).

function fmtDuration(ms = 0) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function runsPerHour(elapsedMs, loops) {
  if (!elapsedMs || !loops) return 0;
  return loops / (elapsedMs / 3600000);
}

const COLORS = {
  purple: 0x7c5cff,
  blue: 0x5cc8ff,
  green: 0x4ad991,
  amber: 0xffb648,
  red: 0xff5c6c,
};

async function post(url, payload) {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, reason: 'no-url' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error('[webhook] send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

function baseEnvelope(profile, embed) {
  const wh = profile.webhook || {};
  const payload = { embeds: [embed] };
  if (wh.username) payload.username = wh.username;
  if (wh.avatarUrl) payload.avatar_url = wh.avatarUrl;
  return payload;
}

function footer() {
  return { text: 'Shadow Macro · TDS Suite' };
}

export const webhook = {
  async test(profile) {
    const wh = profile.webhook || {};
    const embed = {
      title: '🛡️ Shadow Macro — Webhook Connected',
      description: `Webhook for **${profile.name}** is working correctly.`,
      color: COLORS.purple,
      footer: footer(),
      timestamp: new Date().toISOString(),
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },

  async sendSessionSummary(profile, record) {
    const wh = profile.webhook || {};
    const rph = runsPerHour(record.durationMs, record.loops);
    const statusEmoji = record.status === 'success' ? '✅' : record.status === 'failure' ? '❌' : '⏹️';
    const embed = {
      title: `📊 Session Summary · ${profile.name}`,
      color: record.status === 'failure' ? COLORS.red : COLORS.green,
      fields: [
        { name: 'Macro', value: record.macro || '—', inline: true },
        { name: 'Status', value: `${statusEmoji} ${record.status}`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: 'Runtime', value: fmtDuration(record.durationMs), inline: true },
        { name: 'Loops', value: String(record.loops || 0), inline: true },
        { name: 'Runs / Hour', value: rph ? rph.toFixed(1) : '—', inline: true },
      ],
      footer: footer(),
      timestamp: new Date().toISOString(),
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },

  async sendRuntimeReport(profile, state) {
    const wh = profile.webhook || {};
    const rph = runsPerHour(state.elapsedMs, state.loopsCompleted);
    const embed = {
      title: `⏱️ Runtime Report · ${profile.name}`,
      color: COLORS.blue,
      fields: [
        { name: 'Elapsed', value: fmtDuration(state.elapsedMs), inline: true },
        { name: 'Loops', value: String(state.loopsCompleted || 0), inline: true },
        { name: 'Runs / Hour', value: rph ? rph.toFixed(1) : '—', inline: true },
      ],
      footer: footer(),
      timestamp: new Date().toISOString(),
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },

  async sendCompletion(profile, state) {
    const wh = profile.webhook || {};
    const embed = {
      title: `🏁 Loop Completed · ${profile.name}`,
      description: `Loop **#${state.loopsCompleted}** finished.`,
      color: COLORS.amber,
      fields: [
        { name: 'Total Loops', value: String(state.loopsCompleted || 0), inline: true },
        { name: 'Elapsed', value: fmtDuration(state.elapsedMs), inline: true },
      ],
      footer: footer(),
      timestamp: new Date().toISOString(),
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },

  async sendError(profile, { error, state }) {
    const wh = profile.webhook || {};
    const embed = {
      title: `⚠️ Error · ${profile.name}`,
      description: `\`\`\`${String(error).slice(0, 500)}\`\`\``,
      color: COLORS.red,
      fields: [
        { name: 'Elapsed', value: fmtDuration(state?.elapsedMs || 0), inline: true },
        { name: 'Loops', value: String(state?.loopsCompleted || 0), inline: true },
      ],
      footer: footer(),
      timestamp: new Date().toISOString(),
    };
    return post(wh.url, baseEnvelope(profile, embed));
  },
};
