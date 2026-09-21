// Math and general helpers
const Utils = {
    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    rand(min, max) { return Math.random() * (max - min) + min; },
    randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    now() { return performance.now() / 1000; },
    smooth(current, target, speed, dt) {
        const t = 1 - Math.pow(1 - speed, dt * 60);
        return current + (target - current) * t;
    }
};