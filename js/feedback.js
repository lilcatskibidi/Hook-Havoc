// ============================================================
//  FEEDBACK — player bug reports via Discord webhook.
//
//  The MP log (see Multiplayer.mpLog) records every connection / sync /
//  id problem with a short code. This panel bundles the player's words
//  + that log + version/role/room into ONE Discord message so a report
//  is actionable instead of "multiplayer broken pls fix".
//
//  Webhook setup (do NOT commit a webhook URL to the repo):
//    1. Discord channel Settings -> Integrations -> Webhooks -> New.
//    2. Copy the URL, paste it in the Feedback panel once per browser
//       (stored in localStorage `ah_discord_webhook`).
//    Optional deploy-wide default without touching code:
//      <script>window.FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/...";</script>
//  Without any webhook the panel still works: it copies a formatted
//  report to the clipboard for pasting into Discord manually.
// ============================================================
const Feedback = {
    WEBHOOK_KEY: 'ah_discord_webhook',
    DEFAULT_URL: '',

    getWebhook() {
        try {
            if (typeof window !== 'undefined' && window.FEEDBACK_WEBHOOK_URL) {
                return String(window.FEEDBACK_WEBHOOK_URL);
            }
        } catch (e) {}
        try {
            return localStorage.getItem(this.WEBHOOK_KEY) || this.DEFAULT_URL || '';
        } catch (e) {
            return this.DEFAULT_URL || '';
        }
    },

    setWebhook(url) {
        const u = String(url || '').trim();
        // NOTE: no regex literal here — the repo's load-order checker
        // mistakes `//` inside /.../  for a comment and misparses braces.
        const ok = !u
            || u.indexOf('https://discord.com/api/webhooks/') === 0
            || u.indexOf('https://discordapp.com/api/webhooks/') === 0;
        if (!ok) {
            throw new Error('Not a Discord webhook URL (must start with https://discord.com/api/webhooks/…).');
        }
        try { localStorage.setItem(this.WEBHOOK_KEY, u); } catch (e) {}
        return u;
    },

    hasWebhook() {
        return !!this.getWebhook();
    },

    KINDS: {
        'bug-mp': 'Multiplayer bug',
        'bug-data': 'Data bug',
        'bug-other': 'Other bug',
        'request': 'Feature request',
        'other': 'Other',
    },

    COOLDOWN_MS: 60000, // 1 report / minute / browser (anti-spam)
    LAST_KEY: 'ah_feedback_last',

    getKind() {
        try {
            const el = document.getElementById('feedback-kind');
            const v = el ? el.value : 'bug-mp';
            return this.KINDS[v] ? v : 'bug-mp';
        } catch (e) { return 'bug-mp'; }
    },

    kindLabel(kind) {
        return this.KINDS[kind] || this.KINDS.other;
    },

    cooldownLeft() {
        try {
            const last = parseInt(localStorage.getItem(this.LAST_KEY) || '0', 10) || 0;
            const left = this.COOLDOWN_MS - (Date.now() - last);
            return left > 0 ? Math.ceil(left / 1000) : 0;
        } catch (e) { return 0; }
    },

    markSent() {
        try { localStorage.setItem(this.LAST_KEY, String(Date.now())); } catch (e) {}
    },

    gameVersion() {
        try {
            const v = (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : '1.2.5';
            const s = (typeof GAME_SNAPSHOT === 'string' && GAME_SNAPSHOT) ? GAME_SNAPSHOT : '';
            return s && s !== v ? v + '+' + s : v;
        } catch (e) { return '1.2.5'; }
    },

    roleInfo() {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) {
                return { role: 'solo', room: '-', netId: '-' };
            }
            return {
                role: Multiplayer.isHost ? 'host' : 'client',
                room: Multiplayer.roomCode || '-',
                netId: (Multiplayer.shortId
                    ? Multiplayer.shortId(Multiplayer.localClientId)
                    : String(Multiplayer.localClientId || '-')),
            };
        } catch (e) {
            return { role: '?', room: '-', netId: '-' };
        }
    },

    pilotName() {
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.playerName) {
                return Multiplayer.playerName() || '-';
            }
        } catch (e) {}
        return '-';
    },

    collect(desc) {
        const r = this.roleInfo();
        let mpLog = '';
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLogText) {
                mpLog = Multiplayer.mpLogText(15);
            }
        } catch (e) {}
        let ua = '';
        try { ua = String(navigator.userAgent || '').slice(0, 140); } catch (e) {}
        // Sync counters: prove/deny the host->client direction at a glance
        // (host: snapshots sent · client: snapshots received + last age).
        let sync = '-';
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.mpStats) {
                const st = Multiplayer.mpStats();
                sync = (r.role === 'host')
                    ? `sent ${st.sent} snapshots`
                    : `recv ${st.recv} snapshots · last ${st.lastSyncAgo < 0 ? 'never' : st.lastSyncAgo + 's ago'}`;
            }
        } catch (e) {}
        return {
            v: this.gameVersion(),
            at: new Date().toISOString(),
            kind: this.getKind(),
            role: r.role,
            room: r.room,
            netId: r.netId,
            pilot: this.pilotName(),
            sync,
            desc: String(desc || '').slice(0, 1000),
            mpLog: mpLog || '(mp log empty)',
            ua,
        };
    },

    // Discord caps: content 2000 chars, embed description 4096,
    // field value 1024. Keep everything well under.
    buildPayload(rep) {
        const logBlock = '```\n' + String(rep.mpLog).slice(0, 900) + '\n```';
        return {
            username: 'Aquatic Havoc Feedback',
            embeds: [{
                title: `🐟 ${this.kindLabel(rep.kind)} — v${rep.v} · ${rep.role}${rep.room !== '-' ? ' · room ' + rep.room : ''}`,
                description: rep.desc || '(no description)',
                color: rep.kind === 'request' ? 0xfbbf24 : (rep.role === 'host' ? 0x10b981 : 0x0ea5e9),
                fields: [
                    { name: 'Pilot', value: String(rep.pilot).slice(0, 64), inline: true },
                    { name: 'Net id', value: String(rep.netId).slice(0, 64), inline: true },
                    { name: 'Sync (host→client proof)', value: String(rep.sync || '-').slice(0, 128), inline: false },
                    { name: 'When (UTC)', value: String(rep.at).slice(0, 64), inline: false },
                    { name: 'MP log (last events)', value: logBlock.slice(0, 1000), inline: false },
                    { name: 'Browser', value: String(rep.ua || '-').slice(0, 200), inline: false },
                ],
                footer: { text: 'Aquatic Havoc · in-game feedback' },
            }],
        };
    },

    // Plain-text twin for the clipboard fallback (no webhook configured).
    buildText(rep) {
        return [
            `AQUATIC HAVOC FEEDBACK [${this.kindLabel(rep.kind)}] v${rep.v} [${rep.role}${rep.room !== '-' ? '/' + rep.room : ''}]`,
            `Pilot: ${rep.pilot} · Net: ${rep.netId} · ${rep.at}`,
            `Sync: ${rep.sync || '-'}`,
            `What happened: ${rep.desc || '(no description)'}`,
            `--- MP log ---`,
            rep.mpLog,
            `--- Browser ---`,
            rep.ua || '-',
        ].join('\n');
    },

    async send(desc) {
        const url = this.getWebhook();
        if (!url) {
            const err = new Error('NO_WEBHOOK');
            err.fallback = true;
            throw err;
        }
        const rep = this.collect(desc);
        // Timeout: on itch.io a hanging Discord request used to stick on
        // "Sending…" forever with no feedback.
        const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const t = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 15000) : null;
        let res = null;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.buildPayload(rep)),
                signal: ctl ? ctl.signal : undefined,
            });
        } catch (e) {
            // Network-level failure (offline, adblock, iframe CSP): fall
            // back to clipboard instead of a dead error line.
            const err = new Error('Network blocked — report COPIED, paste it into Discord manually.');
            err.fallback = true;
            err.causeText = String((e && e.message) || e);
            throw err;
        } finally {
            if (t) clearTimeout(t);
        }
        if (!res.ok) {
            throw new Error(`Discord rejected the report (HTTP ${res.status}). Check the webhook URL.`);
        }
        return rep;
    },

    async copyToClipboard(desc) {
        const text = this.buildText(this.collect(desc));
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        // Legacy fallback: temp textarea + execCommand.
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch (e) {
            return false;
        }
    },

    // ---- Panel UI (bound once at boot) ----
    _bound: false,

    open() {
        try {
            const modal = document.getElementById('feedback-modal');
            if (!modal) return;
            this.refreshLogPreview();
            const st = document.getElementById('feedback-status');
            if (st) {
                const left = this.cooldownLeft();
                if (left > 0) {
                    st.innerText = `Slow down — next report in ${left}s (anti-spam).`;
                    st.className = 'text-[11px] font-bold text-amber-300';
                } else {
                    st.innerText = this.hasWebhook()
                        ? 'Reports go straight to Discord (1/minute).'
                        : 'No webhook configured — Send will copy the report for manual pasting.';
                    st.className = 'text-[11px] font-bold ' + (this.hasWebhook() ? 'text-emerald-300' : 'text-amber-300');
                }
            }
            modal.classList.remove('hidden');
        } catch (e) {}
    },

    close() {
        try {
            const modal = document.getElementById('feedback-modal');
            if (modal) modal.classList.add('hidden');
        } catch (e) {}
    },

    refreshLogPreview() {
        try {
            const el = document.getElementById('feedback-log');
            if (!el) return;
            let txt = '';
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLogText) {
                    txt = Multiplayer.mpLogText(12);
                }
            } catch (e) {}
            el.value = txt || '(no multiplayer events recorded yet — join/host a room first)';
        } catch (e) {}
    },

    init() {
        if (this._bound) return;
        this._bound = true;
        // Local secret (js/secret.js, gitignored): loads silently when
        // present so window.FEEDBACK_WEBHOOK_URL is set before Send.
        // Local-dev only (localhost/file): it NEVER ships to itch.io or
        // GitHub Pages, so don't even request it there (avoids a 404).
        // Missing file = nothing breaks.
        try {
            let local = false;
            try {
                const h = (typeof location !== 'undefined' && location.hostname) || '';
                const p = (typeof location !== 'undefined' && location.protocol) || '';
                local = !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || p === 'file:';
            } catch (e) {}
            if (local) {
                const s = document.createElement('script');
                s.src = 'js/secret.js?v=125';
                s.async = true;
                s.onerror = () => { try { s.remove(); } catch (e) {} };
                document.head.appendChild(s);
            }
        } catch (e) {}
        const on = (id, fn) => {
            try {
                const el = document.getElementById(id);
                if (el) el.onclick = fn;
            } catch (e) {}
        };
        on('btn-feedback', () => this.open());
        on('btn-feedback-lobby', () => this.open());
        on('btn-feedback-hud', () => this.open());
        on('feedback-close', () => this.close());
        on('btn-feedback-copy', async () => {
            const st = document.getElementById('feedback-status');
            const tx = document.getElementById('feedback-text');
            const ok = await this.copyToClipboard(tx ? tx.value : '');
            if (st) {
                st.innerText = ok ? 'Report copied — paste it into Discord.' : 'Copy failed — select the log manually.';
                st.className = 'text-[11px] font-bold ' + (ok ? 'text-emerald-300' : 'text-rose-300');
            }
        });
        on('btn-feedback-send', async () => {
            const st = document.getElementById('feedback-status');
            const tx = document.getElementById('feedback-text');
            const say = (msg, cls) => {
                if (st) {
                    st.innerText = msg;
                    st.className = 'text-[11px] font-bold ' + cls;
                }
            };
            if (this._sending) return; // double-click guard
            const left = this.cooldownLeft();
            if (left > 0) {
                say(`Slow down — next report in ${left}s (anti-spam, 1/minute).`, 'text-amber-300');
                return;
            }
            const desc = tx ? tx.value.trim() : '';
            if (!desc) {
                say('Describe what happened first (1 line is enough).', 'text-amber-300');
                if (tx) tx.focus();
                return;
            }
            this._sending = true;
            say('Sending…', 'text-sky-300');
            try {
                await this.send(desc);
                this.markSent();
                say('Sent to Discord — thank you!', 'text-emerald-300');
                try {
                    if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLog) {
                        Multiplayer.mpLog('info', 'feedback report sent');
                    }
                } catch (e) {}
                if (tx) tx.value = '';
            } catch (e) {
                if (e && e.fallback) {
                    const ok = await this.copyToClipboard(desc);
                    say(ok
                        ? 'No webhook configured — report COPIED, paste it into Discord manually.'
                        : 'No webhook configured and copy failed — screenshot this panel instead.',
                        'text-amber-300');
                } else {
                    say((e && e.message) || 'Send failed.', 'text-rose-300');
                }
            } finally {
                this._sending = false;
            }
        });
    },
};

window.Feedback = Feedback;
