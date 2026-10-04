// ============================================================
// Protect — casual anti-tamper deterrent (NOT real security).
// Real security = server-authoritative RNG/shop (server/authority.js).
// Raises the bar for curious F12 users: blocks common shortcuts,
// right-click, warns on DevTools. Bypass: ?debug=1 or localhost.
// Never freezes the game. No init-before-declare (CI check clean).
// ============================================================
var __AH_warnCount = 0;
var __AH_lastWarnAt = 0;

function __AH_debugAllowed() {
    try {
        if (/[?&]debug=1/.test(location.search)) return true;
        if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|0\.0\.0\.0)/.test(location.hostname)) return true;
        if (location.protocol === 'file:') return true;
    } catch (e) {}
    return false;
}

function __AH_warn(msg) {
    // Nhẹ nhàng: chỉ hiện chữ cảnh báo, throttle 10s, không phạt,
    // không chạm AntiCheat để tránh cộng dồn violation oan.
    var now = 0;
    try { now = Date.now(); } catch (e) {}
    if (now - __AH_lastWarnAt < 10000) return;
    __AH_lastWarnAt = now;
    __AH_warnCount++;
    try {
        if (typeof Particles !== 'undefined' && typeof state !== 'undefined' && state.player) {
            Particles.showFloatingText(state, msg, state.player.x, state.player.y - 60, '#f87171');
        }
    } catch (e) {}
}

function __AH_onKey(e) {
    try {
        var k = (e.key || '').toUpperCase();
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault(); e.stopPropagation();
            __AH_warn('DEVTOOLS BLOCKED');
            return false;
        }
        if (e.ctrlKey && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) {
            e.preventDefault(); e.stopPropagation();
            __AH_warn('DEVTOOLS BLOCKED');
            return false;
        }
        if (e.ctrlKey && (k === 'U' || k === 'S')) {
            e.preventDefault(); e.stopPropagation();
            __AH_warn('SOURCE PROTECTED');
            return false;
        }
    } catch (err) {}
}

function __AH_onContext(e) {
    try {
        var t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    } catch (err) {}
    e.preventDefault();
}

var __AH_devtoolsOpen = false;
function __AH_pollDevtools() {
    try {
        var wide = Math.abs(window.outerWidth - window.innerWidth) > 160;
        var tall = Math.abs(window.outerHeight - window.innerHeight) > 160;
        var open = wide || tall;
        if (open && !__AH_devtoolsOpen) {
            __AH_devtoolsOpen = true;
            __AH_warn('DEVTOOLS DETECTED — PROGRESS IS MONITORED');
            try { console.warn('[Protect] DevTools open detected (heuristic).'); } catch (e2) {}
        } else if (!open) {
            __AH_devtoolsOpen = false;
        }
    } catch (e) {}
}

function __AH_init() {
    if (__AH_debugAllowed()) {
        try { window.__AH_PROTECT = { mode: 'off-debug' }; } catch (e) {}
        return;
    }
    document.addEventListener('keydown', __AH_onKey, true);
    document.addEventListener('contextmenu', __AH_onContext, true);
    setInterval(__AH_pollDevtools, 2000);
    try {
        Object.defineProperty(window, '__AH_PROTECT', {
            value: { mode: 'on' },
            writable: false, configurable: false, enumerable: false,
        });
    } catch (e) {}
    try {
        document.addEventListener('dragstart', function (e) {
            if (e.target && e.target.tagName === 'CANVAS') e.preventDefault();
        }, true);
    } catch (e) {}
}

__AH_init();
