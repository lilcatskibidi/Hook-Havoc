// ============================================================
//  LANG — English / Vietnamese UI localization.
//  Static HTML uses data-lang="key" (text) or data-lang-html="key"
//  (innerHTML, for labels with icons). Dynamic JS strings use T('key')
//  or T('key', {name}) for {placeholders}.
//  Item/fish/gun names + descriptions stay English (content catalog,
//  translated later). Persisted in Settings (ah_settings.lang).
// ============================================================
const Lang = {
    cur: 'en',

    get() {
        try {
            if (typeof Settings !== 'undefined' && Settings.data && Settings.data.lang) {
                return Settings.data.lang;
            }
        } catch (e) {}
        return this.cur || 'en';
    },

    // params: {name} style tokens, e.g. T('sold_kept', {total: 5})
    T(key, params) {
        const lang = this.get();
        const dict = (this.data && (this.data[lang] || this.data.en)) || {};
        const fallback = (this.data && this.data.en) || {};
        let s = dict[key];
        if (typeof s !== 'string') s = fallback[key];
        if (typeof s !== 'string') return key;
        if (params && typeof params === 'object') {
            for (const k of Object.keys(params)) {
                s = s.split('{' + k + '}').join(String(params[k]));
            }
        }
        return s;
    },

    setLang(lang) {
        if (lang !== 'en' && lang !== 'vi') return 'en';
        this.cur = lang;
        try {
            if (typeof Settings !== 'undefined' && Settings.data) {
                Settings.data.lang = lang;
                if (Settings.save) Settings.save();
            }
        } catch (e) {}
        try { document.documentElement.lang = (lang === 'vi') ? 'vi' : 'en'; } catch (e) {}
        this.apply();
        // Dynamic chrome that mirrors the language (menu buttons, HUD)
        try { if (typeof MainMenu !== 'undefined' && MainMenu.refreshContinueBtn) MainMenu.refreshContinueBtn(); } catch (e) {}
        try { if (typeof Settings !== 'undefined' && Settings.render) Settings.render(); } catch (e) {}
        try {
            if (typeof MultiplayerUI !== 'undefined') {
                if (MultiplayerUI.refreshSlotRow) MultiplayerUI.refreshSlotRow();
                if (MultiplayerUI.refreshMPSlotRow) MultiplayerUI.refreshMPSlotRow();
            }
        } catch (e) {}
        try {
            if (typeof Shop !== 'undefined' && Shop._tab && typeof state !== 'undefined') {
                const modal = document.getElementById('shop-modal');
                if (modal && !modal.classList.contains('hidden')) Shop.renderTab(state, Shop._tab);
            }
        } catch (e) {}
        try {
            if (typeof TouchControls !== 'undefined' && typeof state !== 'undefined' && TouchControls.applyUiTier) {
                TouchControls.applyUiTier();
            }
        } catch (e) {}
        return lang;
    },

    apply() {
        try {
            const els = document.querySelectorAll('[data-lang]');
            els.forEach(el => {
                const v = this.T(el.getAttribute('data-lang'));
                if (typeof v === 'string' && v !== el.getAttribute('data-lang')) el.textContent = v;
                else if (typeof v === 'string') el.textContent = v;
            });
            const htmlEls = document.querySelectorAll('[data-lang-html]');
            htmlEls.forEach(el => {
                el.innerHTML = this.T(el.getAttribute('data-lang-html'));
            });
        } catch (e) {}
    },

    data: {
        en: {
            // Boot / loading
            'boot_tip': 'Casting the line…',
            'fight_ready': 'READY?',
            'fight_go': 'FIGHT!',
            'teleport_title': 'DESCENDING…',
            'teleport_sub': 'The void pulls you through.',
            'mp_loading': 'LOADING...',
            'mp_loading_sub': 'Syncing players',
            // HUD
            'hud_vitals': 'VITALS',
            'hud_no_bait': 'No bait',
            'hud_index': 'Index',
            'hud_casino': 'Casino',
            'hud_shop': 'Shop',
            'zoom': 'ZOOM',
            'fight_list': '⚔ IN COMBAT',
            'line_tension': 'LINE TENSION',
            'tension_safe': 'Safe',
            'tension_warn': 'Warning',
            'tension_snap': 'Snap!',
            'drag_title': 'DRAGGING TO SHORE',
            // Status / tutorial steps
            'step1_html': '<span class="text-amber-400 font-extrabold uppercase">Step 1:</span> Stand near water & Hold <span class="key">SPACE</span> to Cast!',
            'step1_tag': 'Step 1',
            'step2_html': 'Waiting for a bite... (tap <span class="key">SPACE</span> to pull back, keeps bait)',
            'step2_tag': 'Step 2',
            't_near_water': 'Move closer to the shore!',
            't_bucket_full': 'Bucket Full! Sell in shop.',
            't_bobber_back': 'Bobber back — bait kept!',
            't_no_water': 'No water that way — aim at the sea!',
            't_hooked_tag': 'Step 3',
            't_beached': 'BEACHED!',
            't_beached_tag': 'Step 4',
            't_keep_reeling': "It's on the sand! Keep reeling to finish dragging it in!",
            't_done': 'Done',
            't_tutorial_done': 'Tutorial complete! Talk to <b>OLD MARLIN</b> (E) on the beach for quests.',
            // Touch
            'touch_fire': 'FIRE',
            'touch_cast': 'CAST',
            'touch_reel': 'REEL',
            'touch_release': 'THROW',
            // Pause
            'pause_title': 'PAUSED',
            'pause_sub': 'GAME MENU',
            'pause_resume': 'Resume',
            'pause_save': 'Save Game',
            'pause_quit': 'Leave to Main Menu',
            'pause_saved': 'Progress saved!',
            'pause_save_fail': 'Save failed.',
            // Death
            'death_title': 'YOU DIED!',
            'death_burned': 'Burned alive!',
            'death_slain': 'Slain in the deep!',
            'death_beach': 'Respawn — Beach',
            'death_camp': "Respawn — Marlin's Camp",
            'death_isle': 'Respawn — Island Dock',
            'death_menu': 'Back to Menu',
            'death_note': 'YOUR CATCH AND GEAR ARE SAFE · WORLD FROZEN WHILE DEAD',
            // Shop
            'shop_title': 'Harbor Outfitter & Armory',
            'shop_sub': 'Upgrade equipment, sell catches, dominate the deep',
            'tab_sell': 'Sell',
            'tab_guns': 'Guns',
            'tab_rods': 'Rods',
            'tab_armor': 'Armor',
            'tab_ammo': 'Ammo',
            'tab_bucket': 'Bucket',
            'tab_bait': 'Bait',
            'tab_items': 'Items',
            'tab_casino': 'Casino',
            'shop_loot_value': 'Bucket Loot Value',
            'sell_all': 'SELL ALL',
            'coins_fmt': '{n} Coins',
            // Menu
            'menu_play': 'Start New Game',
            'menu_continue': 'Continue',
            'menu_continue_slot': 'Continue (Slot {n})',
            'menu_slot_empty': 'Slot {n} Empty — Pick a Save',
            'menu_new_slot': 'Start New Game (Slot {n})',
            'menu_save_slot': 'Save Game (Slot {n})',
            'menu_save_file': 'SAVE FILE (SINGLE PLAYER)',
            'menu_no_save': 'No save in this slot yet',
            'menu_explore': 'EXPLORE',
            'menu_index': 'Fish Index',
            'menu_how': 'How To Play',
            'menu_ach': 'Achievements',
            'menu_mp': 'Multiplayer',
            'menu_settings': 'Settings',
            'menu_about': 'About',
            'menu_updates': 'Updates',
            'menu_feedback': 'Feedback',
            'menu_lang': 'Language',
            // Settings
            'set_title': 'SETTINGS',
            'set_back': 'Back',
            'set_sound': 'Sound',
            'set_mixer': 'VOLUME MIXER',
            'set_master': 'Master',
            'set_music': 'Music',
            'set_sfx': 'SFX',
            'set_fx': 'Particles',
            'set_shake': 'Screen Shake',
            'set_daynight': 'Day/Night FX',
            'set_touch': 'Touch UI',
            'set_uiscale': 'UI SIZE',
            'set_lang': 'Language',
            'set_tutorial': 'Replay Tutorial',
            'set_on': 'ON',
            'set_off': 'OFF',
            // Generic
            'back': 'Back',
            'close_hint': 'PRESS {k} OR {k2} TO CLOSE',
            'index_close_tail': 'TO CLOSE',
            'discovered': 'discovered',
            // Intro
            'intro_next': 'Next →',
            'intro_back': '← Back',
            'intro_skip': 'Skip',
            'intro_sail': 'Sail! ⛵',
            'intro_begin': 'Begin the Hunt',
            // Casino tabs
            'casino_roulette': 'Roulette',
            'casino_slots': 'Slots',
            'casino_fishbet': 'Fish Betting',
            'casino_highlow': 'High-Low',
        },
        vi: {
            // Boot / loading
            'boot_tip': 'Đang thả câu…',
            'fight_ready': 'SẴN SÀNG?',
            'fight_go': 'CHIẾN!',
            'teleport_title': 'ĐANG LẶN XUỐNG…',
            'teleport_sub': 'Vực thẳm cuốn bạn đi.',
            'mp_loading': 'ĐANG TẢI...',
            'mp_loading_sub': 'Đang đồng bộ người chơi',
            // HUD
            'hud_vitals': 'MÁU',
            'hud_no_bait': 'Trống',
            'hud_index': 'Bách khoa',
            'hud_casino': 'Casino',
            'hud_shop': 'Cửa hàng',
            'zoom': 'THU PHÓNG',
            'fight_list': '⚔ ĐANG CHIẾN ĐẤU',
            'line_tension': 'ĐỘ CĂNG DÂY',
            'tension_safe': 'An toàn',
            'tension_warn': 'Cảnh báo',
            'tension_snap': 'Đứt!',
            'drag_title': 'ĐANG KÉO VÀO BỜ',
            // Status / tutorial steps
            'step1_html': '<span class="text-amber-400 font-extrabold uppercase">Bước 1:</span> Đứng gần mặt nước & giữ <span class="key">SPACE</span> để quăng câu!',
            'step1_tag': 'Bước 1',
            'step2_html': 'Đang chờ cá cắn... (nhấn <span class="key">SPACE</span> để thu lại, không mất mồi)',
            'step2_tag': 'Bước 2',
            't_near_water': 'Lại gần bờ nước hơn!',
            't_bucket_full': 'Xô đầy rồi! Vào cửa hàng bán đi.',
            't_bobber_back': 'Đã thu phao — giữ nguyên mồi!',
            't_no_water': 'Hướng đó không có nước — nhắm ra biển!',
            't_hooked_tag': 'Bước 3',
            't_beached': 'LÊN BỜ!',
            't_beached_tag': 'Bước 4',
            't_keep_reeling': 'Nó lên cát rồi! Giữ quay để kéo vào hẳn!',
            't_done': 'Xong',
            't_tutorial_done': 'Xong hướng dẫn! Gặp <b>MARLIN GIÀ</b> (E) trên bãi biển để nhận nhiệm vụ.',
            // Touch
            'touch_fire': 'BẮN',
            'touch_cast': 'CÂU',
            'touch_reel': 'QUAY',
            'touch_release': 'NÉM',
            // Pause
            'pause_title': 'TẠM DỪNG',
            'pause_sub': 'MENU GAME',
            'pause_resume': 'Tiếp tục',
            'pause_save': 'Lưu game',
            'pause_quit': 'Về menu chính',
            'pause_saved': 'Đã lưu!',
            'pause_save_fail': 'Lưu thất bại.',
            // Death
            'death_title': 'BẠN ĐÃ CHẾT!',
            'death_burned': 'Bị thiêu sống!',
            'death_slain': 'Bỏ mạng giữa biển sâu!',
            'death_beach': 'Hồi sinh — Bãi biển',
            'death_camp': 'Hồi sinh — Trại Marlin',
            'death_isle': 'Hồi sinh — Bến đảo',
            'death_menu': 'Về menu',
            'death_note': 'CÁ VÀ ĐỒ ĐẠC AN TOÀN · THẾ GIỚI ĐÓNG BĂNG KHI CHẾT',
            // Shop
            'shop_title': 'Tiệm Đồ Nghề & Vũ Khí',
            'shop_sub': 'Nâng cấp trang bị, bán cá, làm chủ biển sâu',
            'tab_sell': 'Bán',
            'tab_guns': 'Súng',
            'tab_rods': 'Cần câu',
            'tab_armor': 'Giáp',
            'tab_ammo': 'Đạn',
            'tab_bucket': 'Xô',
            'tab_bait': 'Mồi',
            'tab_items': 'Vật phẩm',
            'tab_casino': 'Casino',
            'shop_loot_value': 'Giá trị xô cá',
            'sell_all': 'BÁN HẾT',
            'coins_fmt': '{n} Xu',
            // Menu
            'menu_play': 'Chơi mới',
            'menu_continue': 'Chơi tiếp',
            'menu_continue_slot': 'Chơi tiếp (Ô {n})',
            'menu_slot_empty': 'Ô {n} trống — chọn ô có save',
            'menu_new_slot': 'Chơi mới (Ô {n})',
            'menu_save_slot': 'Lưu game (Ô {n})',
            'menu_save_file': 'FILE LƯU (CHƠI ĐƠN)',
            'menu_no_save': 'Ô này chưa có save',
            'menu_explore': 'KHÁM PHÁ',
            'menu_index': 'Bách khoa cá',
            'menu_how': 'Cách chơi',
            'menu_ach': 'Thành tựu',
            'menu_mp': 'Chơi mạng',
            'menu_settings': 'Cài đặt',
            'menu_about': 'Giới thiệu',
            'menu_updates': 'Cập nhật',
            'menu_feedback': 'Góp ý',
            'menu_lang': 'Ngôn ngữ',
            // Settings
            'set_title': 'CÀI ĐẶT',
            'set_back': 'Quay lại',
            'set_sound': 'Âm thanh',
            'set_mixer': 'CHỈNH ÂM LƯỢNG',
            'set_master': 'Tổng',
            'set_music': 'Nhạc',
            'set_sfx': 'Hiệu ứng',
            'set_fx': 'Hạt hiệu ứng',
            'set_shake': 'Rung màn hình',
            'set_daynight': 'Hiệu ứng ngày/đêm',
            'set_touch': 'Nút cảm ứng',
            'set_uiscale': 'CỠ CHỮ/UI',
            'set_lang': 'Ngôn ngữ',
            'set_tutorial': 'Chơi lại hướng dẫn',
            'set_on': 'BẬT',
            'set_off': 'TẮT',
            // Generic
            'back': 'Quay lại',
            'close_hint': 'NHẤN {k} HOẶC {k2} ĐỂ ĐÓNG',
            'index_close_tail': 'ĐỂ ĐÓNG',
            'discovered': 'đã khám phá',
            // Intro
            'intro_next': 'Tiếp →',
            'intro_back': '← Quay lại',
            'intro_skip': 'Bỏ qua',
            'intro_sail': 'Ra khơi! ⛵',
            'intro_begin': 'Bắt đầu săn',
            // Casino tabs
            'casino_roulette': 'Roulette',
            'casino_slots': 'Máy xèng',
            'casino_fishbet': 'Cá cược cá',
            'casino_highlow': 'Cao-Thấp',
        }
    }
};

function T(key, params) {
    try { return Lang.T(key, params); } catch (e) { return key; }
}

window.Lang = Lang;
