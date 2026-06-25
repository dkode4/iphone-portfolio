/* ============================================================
   Preloader — reveal the page only once the heavy images
   (ambient background + iPhone wallpaper) have decoded, so the
   phone and its backdrop appear together instead of the phone
   popping in first. A timeout guarantees we never hang.
   ============================================================ */
(function preload(){
    const HEAVY = ['assets/background.png', 'assets/iphone-background.jpg'];
    const load = src => new Promise(res => {
        const img = new Image();
        img.onload = img.onerror = res;
        img.src = src;
        // already-cached images may need an explicit decode kick
        if (img.decode) img.decode().then(res).catch(res);
    });

    let revealed = false;
    const reveal = () => {
        if (revealed) return;
        revealed = true;
        document.body.classList.remove('is-loading');
        const pre = document.getElementById('preloader');
        if (pre) setTimeout(() => pre.classList.add('is-done'), 600);
        runBoot();
    };

    /* #3 — power-on boot, once per browser session. Subsequent reloads in the
       same session (and reduced-motion users) go straight to the lock screen. */
    function runBoot(){
        const screenEl = document.getElementById('screen');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let booted = false;
        try { booted = sessionStorage.getItem('booted') === '1'; } catch (_) {}
        if (!screenEl || booted || reduce) return;
        try { sessionStorage.setItem('booted', '1'); } catch (_) {}
        screenEl.classList.add('booting');
        setTimeout(() => screenEl.classList.remove('booting'), 2300);
    }

    // safety net: never keep the loader up longer than 4s
    const failsafe = setTimeout(reveal, 4000);
    Promise.all(HEAVY.map(load)).then(() => { clearTimeout(failsafe); reveal(); });
})();

/* ============================================================
   iPhone Portfolio interactions
   ============================================================ */
const phone        = document.getElementById('phone');
const screen       = document.getElementById('screen');
const lockscreen   = document.getElementById('lockscreen');
const homescreen   = document.getElementById('homescreen');
const appview      = document.getElementById('appview');
const appTitle     = document.getElementById('appTitle');
const appBody      = document.getElementById('appBody');
const homeIndicator= document.getElementById('homeIndicator');

const isTouch = window.matchMedia('(hover: none)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Live clock on lock screen ---------- */
function tickClock(){
    const now = new Date();
    const time = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false});
    const date = now.toLocaleDateString([], {weekday:'long', day:'numeric', month:'long'});
    document.getElementById('lockTime').textContent = time;
    document.getElementById('lockDate').textContent = date;
    document.querySelector('.sb-time').textContent = time;
}
tickClock();
setInterval(tickClock, 10000);

/* ---------- 3D tilt + "lean in" on hover ---------- */
let raf = null;
if (!isTouch && !reduceMotion){
    const stage = document.querySelector('.phone-stage');
    const glare = document.getElementById('screenGlare');   // #4 specular highlight

    // glare uses an eased follow (it lags behind the cursor) so the light drifts
    // across the glass like a real reflection instead of snapping 1:1. It moves
    // via transform only (translate %, element-relative) — composite, no repaint.
    const GL_BASE_Y = 0;          // resting offset (centered)
    let glTX = 0, glTY = GL_BASE_Y;   // target translate the cursor implies
    let glX  = 0, glY  = GL_BASE_Y;   // current eased translate
    let glRAF = null;
    const GLARE_EASE = 0.07;      // lower = slower, heavier drift
    function glareLoop(){
        glX += (glTX - glX) * GLARE_EASE;
        glY += (glTY - glY) * GLARE_EASE;
        if (glare) glare.style.transform = `translate3d(${glX.toFixed(2)}%,${glY.toFixed(2)}%,0)`;
        if (Math.abs(glTX - glX) > 0.03 || Math.abs(glTY - glY) > 0.03){
            glRAF = requestAnimationFrame(glareLoop);
        } else {
            glRAF = null;            // settled — stop burning frames
        }
    }

    // listeners live on the stable stage (which has padding so the scaled
    // phone stays inside it — no enter/leave flicker)
    stage.addEventListener('mousemove', (e) => {
        const r = phone.getBoundingClientRect();
        const cx = r.left + r.width/2;
        const cy = r.top + r.height/2;
        const dx = (e.clientX - cx) / (r.width/2);   // -1 .. 1
        const dy = (e.clientY - cy) / (r.height/2);
        const cdx = Math.max(-1, Math.min(1, dx));
        const cdy = Math.max(-1, Math.min(1, dy));
        // tilt tracks the cursor directly (stays responsive)
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            phone.style.transform = `rotateX(${-cdy * 6}deg) rotateY(${cdx * 6}deg)`;
        });
        // glare only updates its TARGET; the eased loop drifts toward it.
        // Moves OPPOSITE the cursor, toward the edge tilting back/up into the
        // light, like a real specular reflection responding to the bend.
        glTX = -cdx * 22;
        glTY = GL_BASE_Y - cdy * 16;
        if (glRAF === null) glRAF = requestAnimationFrame(glareLoop);
    });
    stage.addEventListener('mouseenter', () => stage.classList.add('lift'));
    stage.addEventListener('mouseleave', () => {
        stage.classList.remove('lift');
        phone.style.transform = '';
    });
}

/* ---------- Unlock ---------- */
function unlock(){ screen.classList.add('unlocked'); document.body.classList.add('is-open'); }
function lock(){ closeApp(); screen.classList.remove('unlocked'); document.body.classList.remove('is-open'); }

/* Unlock by clicking anywhere on the phone. Listener sits on the stable
   .phone-stage (which never transforms) so the click still fires even while
   the phone is mid-zoom — a click dispatches on the common ancestor of the
   press and release targets, both of which live inside the stage. */
const phoneStage = document.querySelector('.phone-stage');
phoneStage.addEventListener('click', () => {
    if (!screen.classList.contains('unlocked') && !screen.classList.contains('app-open')) unlock();
});
/* quick buttons shouldn't unlock when clicked */
document.querySelectorAll('.quick-btn').forEach(b => b.addEventListener('click', e => e.stopPropagation()));

/* lock-screen notification: swipe (or drag) left to dismiss; a tap shouldn't unlock */
(function initNotif(){
    const notif = document.getElementById('welcomeNotif');
    if (!notif) return;
    const track = notif.querySelector('.notif-track');
    let startX = 0, dx = 0, dragging = false;

    function dismiss(dir){
        const dist = (dir < 0 ? -1 : 1) * 360;
        track.style.transform = `translateX(${dist}px)`;
        track.style.opacity = '0';
        notif.style.maxHeight = notif.offsetHeight + 'px';
        notif.getBoundingClientRect();           // reflow so the collapse animates
        notif.style.transition = 'max-height .3s ease, opacity .3s ease, margin .3s ease';
        notif.style.maxHeight = '0';
        notif.style.opacity = '0';
        notif.style.marginTop = '0';
        setTimeout(() => notif.remove(), 320);
    }

    track.addEventListener('pointerdown', (e) => {
        dragging = true; startX = e.clientX; dx = 0;
        track.classList.add('dragging');
        track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dx = e.clientX - startX;
        if (dx > 0) dx *= 0.3;                    // resist rightward pull
        track.style.transform = `translateX(${dx}px)`;
        track.style.opacity = String(Math.max(.35, 1 - Math.abs(dx) / 240));
    });
    function endDrag(){
        if (!dragging) return;
        dragging = false;
        track.classList.remove('dragging');
        if (dx < -70) { dismiss(-1); return; }    // swiped far enough left -> dismiss
        track.style.transform = '';                // snap back
        track.style.opacity = '';
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    /* a genuine tap (not a swipe) opens Mail to contact — without unlocking */
    track.addEventListener('click', (e) => {
        e.stopPropagation();
        if (Math.abs(dx) < 6) openApp('mail', track);
    });

    /* 3D tilt that follows the cursor across the card (desktop hover only) */
    const MAX_TILT = 9;                                  // degrees
    track.addEventListener('mousemove', (e) => {
        if (dragging) return;
        const r = track.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;       // 0..1
        const py = (e.clientY - r.top) / r.height;       // 0..1
        const ry = (px - 0.5) * 2 * MAX_TILT;            // rotateY: left/right
        const rx = (0.5 - py) * 2 * MAX_TILT;            // rotateX: up/down
        track.classList.add('tilting');
        track.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
        track.style.setProperty('--mx', px * 100 + '%'); // glare position
        track.style.setProperty('--my', py * 100 + '%');
    });
    track.addEventListener('mouseleave', () => {
        track.classList.remove('tilting');
        track.style.transform = '';
    });
})();

/* flashlight toggle: invert the icon + flash a white beam behind the phone */
const flashBtn = document.getElementById('flashBtn');
flashBtn.addEventListener('click', () => {
    const on = flashBtn.classList.toggle('active');
    document.body.classList.toggle('flash-on', on);
});

/* lock-screen camera shortcut: opens the Camera app right over the lock screen
   (no unlock needed) — just like a real iPhone */
const cameraBtn = document.getElementById('cameraBtn');
cameraBtn.addEventListener('click', () => openApp('camera', cameraBtn));

/* swipe up to unlock (touch) */
let touchStartY = null;
screen.addEventListener('touchstart', (e)=>{ touchStartY = e.touches[0].clientY; }, {passive:true});
screen.addEventListener('touchend', (e)=>{
    if (touchStartY === null) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (!screen.classList.contains('unlocked') && !screen.classList.contains('app-open') && dy > 40) unlock();
    touchStartY = null;
}, {passive:true});

/* ---------- App registry ---------- */
const APPS = {
    about:      { title:'About',      tpl:'tpl-about' },
    projects:   { title:'Projects',   tpl:'tpl-projects' },
    experience: { title:'Experience', tpl:'tpl-experience' },
    skills:     { title:'Skills',     tpl:'tpl-skills' },
    phone:      { title:'Phone',      tpl:'tpl-phone' },
    mail:       { title:'Mail',       tpl:'tpl-mail' },
    github:     { title:'GitHub',     link:'https://github.com/dkode4' },
    linkedin:   { title:'LinkedIn',   link:'https://www.linkedin.com/in/dmitrij-kraliks' },
    calculator: { title:'Calculator', tpl:'tpl-calculator', flush:true, init:initCalculator },
    clock:      { title:'Clock',      tpl:'tpl-clock',      flush:true, init:initClock },
    maps:       { title:'Maps',       tpl:'tpl-maps',       flush:true },
    camera:     { title:'Camera',     tpl:'tpl-camera',     flush:true, init:initCamera },
    weather:    { title:'Weather',    tpl:'tpl-weather',    flush:true, init:initWeather },
    music:      { title:'Music',      tpl:'tpl-music',      flush:true, init:initMusic },
    appstore:   { title:'App Store',  tpl:'tpl-appstore',   flush:true, init:initStore },
    notes:      { title:'Notes',      tpl:'tpl-notes',      flush:true, init:initNotes },
    settings:   { title:'Settings',   tpl:'tpl-settings',   flush:true, init:initSettings },
};

/* ---------- Open app with camera-follow (origin = tapped icon) ---------- */
function openApp(key, iconEl){
    const app = APPS[key];
    if (!app) return;

    if (app.link){ window.open(app.link, '_blank', 'noopener'); return; }

    // camera-follow: zoom the app view out of the icon's position
    if (iconEl){
        const sr = screen.getBoundingClientRect();
        const ir = iconEl.getBoundingClientRect();
        const ox = ((ir.left + ir.width/2  - sr.left) / sr.width)  * 100;
        const oy = ((ir.top  + ir.height/2 - sr.top ) / sr.height) * 100;
        appview.style.transformOrigin = `${ox}% ${oy}%`;
    } else {
        appview.style.transformOrigin = '50% 50%';
    }

    appTitle.textContent = app.title;
    if (appCleanup){ appCleanup(); appCleanup = null; }
    appBody.innerHTML = '';
    const tpl = document.getElementById(app.tpl);
    if (tpl) appBody.appendChild(tpl.content.cloneNode(true));
    appBody.scrollTop = 0;

    // edge-to-edge apps (calculator / clock / maps) drop the body padding
    appview.classList.toggle('flush', !!app.flush);
    // wire up interactive apps; keep any returned cleanup for closeApp()
    if (app.init) appCleanup = app.init(appBody) || null;

    screen.classList.add('app-open');
    appview.setAttribute('aria-hidden','false');
}


let appCleanup = null;
function closeApp(){
    if (appCleanup){ appCleanup(); appCleanup = null; }
    screen.classList.remove('app-open');
    appview.setAttribute('aria-hidden','true');
}

/* clicks on any app icon */
document.querySelectorAll('.app').forEach(btn => {
    btn.addEventListener('click', () => {
        openApp(btn.dataset.app, btn.querySelector('.app-icon'));
    });
});

/* home indicator = the only "back" affordance now.
   press OR swipe up: app open -> home; home -> lock; lock -> unlock */
function homeBack(){
    if (screen.classList.contains('spot-open')) closeSpotlight();
    else if (screen.classList.contains('cc-open')) closeCC();
    else if (screen.classList.contains('app-open')) closeApp();
    else if (screen.classList.contains('unlocked')) lock();
    else unlock();
}
homeIndicator.addEventListener('click', homeBack);

/* swipe up on the bar (same gesture as unlocking the lock screen) */
let hiStartY = null, hiMoved = false;
homeIndicator.addEventListener('pointerdown', (e) => {
    hiStartY = e.clientY; hiMoved = false;
    try { homeIndicator.setPointerCapture(e.pointerId); } catch (_) {}
});
homeIndicator.addEventListener('pointerup', (e) => {
    if (hiStartY === null) return;
    const dy = hiStartY - e.clientY;
    hiStartY = null;
    if (dy > 24){                                  // swipe up triggers back
        hiMoved = true;
        homeBack();
        setTimeout(() => { hiMoved = false; }, 0); // never let the flag linger
    }
});
/* a swipe shouldn't ALSO fire the click (which would double-trigger) */
homeIndicator.addEventListener('click', (e) => { if (hiMoved) e.stopImmediatePropagation(); }, true);

/* keyboard: Esc steps back */
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (screen.classList.contains('spot-open')) closeSpotlight();
    else if (screen.classList.contains('cc-open')) closeCC();
    else if (screen.classList.contains('app-open')) closeApp();
    else if (screen.classList.contains('unlocked')) lock();
});

/* ---------- Swipeable home-screen pages (with dots) ---------- */
const pagesViewport = document.getElementById('pagesViewport');
const pagesTrack    = document.getElementById('pagesTrack');
const pageDots      = document.getElementById('pageDots');
const PAGE_COUNT    = 2;
const PAGE_GAP      = 36;   // must match the gap on .pages-track in style.css
let currentPage = 0;

/* one page step in px = page width + the inter-page gap */
function pageStep(){
    const page = pagesTrack.querySelector('.page');
    return (page ? page.getBoundingClientRect().width : pagesViewport.clientWidth) + PAGE_GAP;
}

function goToPage(i){
    currentPage = Math.max(0, Math.min(PAGE_COUNT - 1, i));
    pagesTrack.style.transform = `translate3d(${-currentPage * pageStep()}px,0,0)`;
    pageDots.querySelectorAll('.page-dot').forEach((d, idx) =>
        d.classList.toggle('is-active', idx === currentPage));
}

/* tap a dot to jump to that page */
pageDots.querySelectorAll('.page-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
        e.stopPropagation();
        goToPage(Number(dot.dataset.page));
    });
});

/* drag / flick — unified mouse + touch via pointer events.
   A tap must NOT capture the pointer (that would steal the click from the app
   button), so capture + drag only begin once the finger moves horizontally
   past a small threshold. */
const DRAG_THRESH = 6;
let pointerDown = false, dragging = false, pointerId = null;
let startX = 0, startY = 0, dragDX = 0, step = 0;
let suppressNextClick = false;

function canPage(){
    return screen.classList.contains('unlocked') && !screen.classList.contains('app-open');
}

pagesViewport.addEventListener('pointerdown', (e) => {
    if (!canPage()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerDown = true; dragging = false; pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY; dragDX = 0;
    step = pageStep();
});

window.addEventListener('pointermove', (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragging){
        // require a clearly horizontal intent before hijacking the gesture
        if (Math.abs(dx) < DRAG_THRESH || Math.abs(dx) <= Math.abs(dy)) return;
        dragging = true;
        pagesTrack.classList.add('dragging');
        try { pagesViewport.setPointerCapture(pointerId); } catch (_) {}
    }
    dragDX = dx;
    const base = -currentPage * step;
    let px = base + dragDX;
    // rubber-band resistance past the first / last page
    const minPx = -(PAGE_COUNT - 1) * step, maxPx = 0;
    if (px > maxPx) px = maxPx + (px - maxPx) * 0.35;
    if (px < minPx) px = minPx + (px - minPx) * 0.35;
    pagesTrack.style.transform = `translate3d(${px}px,0,0)`;
});

function endDrag(e){
    if (!pointerDown || (e && e.pointerId !== pointerId)) return;
    pointerDown = false;
    if (!dragging) return;                 // pure tap → let the click through
    dragging = false;
    pagesTrack.classList.remove('dragging');
    // a real drag shouldn't also open an app
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);
    const threshold = step * 0.18;
    if (dragDX < -threshold) goToPage(currentPage + 1);
    else if (dragDX > threshold) goToPage(currentPage - 1);
    else goToPage(currentPage);
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

/* swallow the click that follows a drag (capture phase, before app opens) */
document.addEventListener('click', (e) => {
    if (suppressNextClick){ e.stopPropagation(); e.preventDefault(); suppressNextClick = false; }
}, true);

/* always return to the first page when re-locking */
const _lock = lock;
lock = function(){ goToPage(0); _lock(); };

/* ============================================================
   Spotlight search (#7) — type to jump to any app or content
   ============================================================ */
const spotlight   = document.getElementById('spotlight');
const spotField   = document.getElementById('spotField');
const spotInput   = document.getElementById('spotInput');
const spotResults = document.getElementById('spotResults');
const spotClear   = document.getElementById('spotClear');
const homeSearch  = document.getElementById('homeSearch');

/* searchable index: every app + curated portfolio content (projects, skills,
   experience, links) so a search reaches real content, not just app names */
function buildSpotIndex(){
    const idx = [];
    Object.entries(APPS).forEach(([key, app]) => {
        idx.push({ title: app.title, sub: 'Application', icon: `assets/icons/${key}.png`, open: key });
    });
    const extra = [
        { title:'PeekSkins',  sub:'Project · Next.js · Three.js · Supabase', open:'projects' },
        { title:'SmartThread', sub:'Project · React · Supabase · OpenAI',    open:'projects' },
        { title:'Moodle Metadata Dashboard', sub:'Project · React · Firebase', open:'projects' },
        { title:'Portfolio iPhone UI', sub:'Project · HTML · CSS · JS',       open:'projects' },
        { title:'JavaScript', sub:'Skill', open:'skills' },
        { title:'TypeScript', sub:'Skill', open:'skills' },
        { title:'React',      sub:'Skill', open:'skills' },
        { title:'HTML & CSS', sub:'Skill', open:'skills' },
        { title:'Python',     sub:'Skill', open:'skills' },
        { title:'Azure',      sub:'Skill', open:'skills' },
        { title:'Power Apps', sub:'Skill', open:'skills' },
        { title:'Linux',      sub:'Skill', open:'skills' },
        { title:'IT Support Engineer & Systems Administrator', sub:'Experience · Photo Experience', open:'experience' },
        { title:'IT Intern',  sub:'Experience · Athora',       open:'experience' },
        { title:'Email',      sub:'kraliksdmitrij@gmail.com',  open:'mail' },
        { title:'GitHub',     sub:'github.com/dkode4',          icon:'assets/icons/github.png',   link:'https://github.com/dkode4' },
        { title:'LinkedIn',   sub:'dmitrij-kraliks',            icon:'assets/icons/linkedin.png', link:'https://www.linkedin.com/in/dmitrij-kraliks' },
    ];
    extra.forEach(it => {
        if (!it.icon && it.open) it.icon = `assets/icons/${it.open}.png`;
        idx.push(it);
    });
    return idx;
}
const SPOT_INDEX = buildSpotIndex();

function renderSpot(q){
    const query = q.trim().toLowerCase();
    const matches = query
        ? SPOT_INDEX.filter(it =>
            it.title.toLowerCase().includes(query) || it.sub.toLowerCase().includes(query))
        : SPOT_INDEX.filter(it => it.sub === 'Application');   // empty → just the apps

    spotResults.innerHTML = '';
    if (!matches.length){
        const li = document.createElement('li');
        li.className = 'spot-empty';
        li.textContent = `No results for “${q.trim()}”`;
        spotResults.appendChild(li);
        return;
    }
    matches.forEach(it => {
        const li  = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'spot-row';
        btn.innerHTML =
            `<span class="spot-ico"><img src="${it.icon}" alt=""></span>` +
            `<span class="spot-meta"><span class="spot-title"></span><span class="spot-sub"></span></span>`;
        btn.querySelector('.spot-title').textContent = it.title;
        btn.querySelector('.spot-sub').textContent   = it.sub;
        btn.addEventListener('click', () => activateSpot(it));
        li.appendChild(btn);
        spotResults.appendChild(li);
    });
}

function activateSpot(it){
    closeSpotlight();
    if (it.link){ window.open(it.link, '_blank', 'noopener'); return; }
    if (it.open) openApp(it.open, null);
}

function openSpotlight(){
    if (!screen.classList.contains('unlocked') || screen.classList.contains('app-open')) return;
    screen.classList.add('spot-open');
    spotlight.setAttribute('aria-hidden', 'false');
    spotInput.value = '';
    spotField.classList.remove('has-text');
    renderSpot('');
    setTimeout(() => spotInput.focus(), 60);
}
function closeSpotlight(){
    screen.classList.remove('spot-open');
    spotlight.setAttribute('aria-hidden', 'true');
    spotInput.blur();
}

homeSearch.addEventListener('click', (e) => { e.stopPropagation(); openSpotlight(); });
spotInput.addEventListener('input', () => {
    spotField.classList.toggle('has-text', spotInput.value.length > 0);
    renderSpot(spotInput.value);
});
spotClear.addEventListener('click', () => {
    spotInput.value = '';
    spotField.classList.remove('has-text');
    renderSpot('');
    spotInput.focus();
});
/* tap the blurred backdrop (outside the field / results) to dismiss */
spotlight.addEventListener('click', (e) => { if (e.target === spotlight) closeSpotlight(); });

/* swipe-down on the home grid also opens Spotlight. Independent of the paging
   handler (which only hijacks horizontal drags), so the two never collide. */
let spDownY = null, spDownX = null;
pagesViewport.addEventListener('pointerdown', (e) => {
    if (!canPage()) { spDownY = null; return; }
    spDownY = e.clientY; spDownX = e.clientX;
});
pagesViewport.addEventListener('pointerup', (e) => {
    if (spDownY === null) return;
    const dy = e.clientY - spDownY, dx = e.clientX - spDownX;
    spDownY = null;
    if (dy > 50 && dy > Math.abs(dx) * 1.4 && !screen.classList.contains('spot-open')) openSpotlight();
});

/* ============================================================
   Calculator app (working, immediate-execution like iOS)
   ============================================================ */
function initCalculator(root){
    const exprEl = root.querySelector('#calcExpr');
    const resEl  = root.querySelector('#calcResult');
    const opSym  = {'+':'+','-':'−','*':'×','/':'÷'};
    let cur = '0', acc = null, op = null, fresh = true, justEq = false;

    const fmt = (s) => {
        if (s === '' || s === undefined) return '';
        const neg = s.startsWith('-');
        let [int, dec] = (neg ? s.slice(1) : s).split('.');
        int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-' : '') + (dec !== undefined ? int + '.' + dec : int);
    };
    function highlightOp(){
        root.querySelectorAll('.ckey-op').forEach(k => k.classList.remove('is-active'));
        if (op && fresh){
            const k = root.querySelector(`.ckey-op[data-op="${op}"]`);
            if (k) k.classList.add('is-active');
        }
    }
    function show(){
        resEl.textContent = fmt(cur);
        exprEl.textContent = (op !== null && acc !== null)
            ? fmt(String(acc)) + ' ' + opSym[op] + (fresh ? '' : ' ' + fmt(cur))
            : '';
        highlightOp();
    }
    const calc = (a, b, o) => {
        a = +a; b = +b;
        if (o === '+') return a + b;
        if (o === '-') return a - b;
        if (o === '*') return a * b;
        if (o === '/') return b === 0 ? 0 : a / b;
        return b;
    };
    function digit(d){
        if (justEq){ cur = '0'; acc = null; op = null; justEq = false; fresh = true; }
        if (d === '.'){
            if (fresh){ cur = '0.'; fresh = false; }
            else if (!cur.includes('.')) cur += '.';
        } else if (fresh || cur === '0'){ cur = d; fresh = false; }
        else cur += d;
        show();
    }
    function setOp(next){
        if (op !== null && !fresh){ acc = calc(acc, cur, op); cur = String(acc); }
        else if (op === null){ acc = +cur; }
        op = next; fresh = true; justEq = false;
        show();
    }
    function equals(){
        if (op === null) return;
        if (!fresh){ acc = calc(acc, cur, op); }
        cur = String(+(+acc).toPrecision(12));
        op = null; fresh = true; justEq = true;
        show();
    }
    const clearAll = () => { cur = '0'; acc = null; op = null; fresh = true; justEq = false; show(); };
    function del(){
        if (justEq || fresh) return;
        cur = cur.length > 1 ? cur.slice(0, -1) : '0';
        if (cur === '-' || cur === '0') { cur = '0'; fresh = true; }
        show();
    }
    const percent = () => { cur = String(+cur / 100); justEq = false; show(); };
    const sign    = () => { cur = (+cur === 0) ? cur : (cur.startsWith('-') ? cur.slice(1) : '-' + cur); show(); };

    function onClick(e){
        const b = e.target.closest('.ckey'); if (!b) return;
        if (b.dataset.num !== undefined) digit(b.dataset.num);
        else if (b.dataset.op) { b.dataset.op === '=' ? equals() : setOp(b.dataset.op); }
        else if (b.dataset.act === 'clear')   clearAll();
        else if (b.dataset.act === 'delete')  del();
        else if (b.dataset.act === 'percent') percent();
        else if (b.dataset.act === 'sign')    sign();
    }
    root.addEventListener('click', onClick);
    clearAll();
    return () => root.removeEventListener('click', onClick);
}

/* ============================================================
   Clock app — World Clock · Alarms · Stopwatch · Timers
   ============================================================ */
function initClock(root){
    const intervals = [];
    let swRaf = null, tmInt = null;

    /* ---- tab switching ---- */
    const tabs  = root.querySelectorAll('.clk-tab');
    const views = root.querySelectorAll('.clk-view');
    tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.toggle('is-active', x === t));
        views.forEach(v => v.classList.toggle('is-active', v.dataset.view === t.dataset.tab));
    }));

    /* ---- World Clock ---- */
    const HOME = 'Europe/Dublin';
    const cities = [
        {name:'Dublin',     tz:'Europe/Dublin'},
        {name:'Cupertino',  tz:'America/Los_Angeles'},
        {name:'New York',   tz:'America/New_York'},
        {name:'London',     tz:'Europe/London'},
        {name:'Dubai',      tz:'Asia/Dubai'},
        {name:'Tokyo',      tz:'Asia/Tokyo'},
    ];
    const wcList = root.querySelector('#wcList');
    const tzOffsetMin = (tz, date) => {
        const p = new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
            .formatToParts(date).reduce((a,x)=>{a[x.type]=x.value;return a;},{});
        const asUTC = Date.UTC(+p.year, +p.month-1, +p.day, +p.hour, +p.minute, +p.second);
        return Math.round((asUTC - date.getTime())/60000);
    };
    function renderWorld(){
        const now = new Date();
        const homeOff = tzOffsetMin(HOME, now);
        const homeDay = +new Intl.DateTimeFormat('en-US',{timeZone:HOME,day:'2-digit'}).format(now);
        wcList.innerHTML = cities.map(c => {
            const parts = new Intl.DateTimeFormat('en-US',{timeZone:c.tz,hour:'numeric',minute:'2-digit',hour12:true})
                .formatToParts(now).reduce((a,x)=>{a[x.type]=x.value;return a;},{});
            const diff = tzOffsetMin(c.tz, now) - homeOff;
            const sign = diff < 0 ? '-' : '+';
            const ah = Math.floor(Math.abs(diff)/60), am = Math.abs(diff)%60;
            const offLabel = am === 0 ? `${sign}${ah}HRS` : `${sign}${ah}:${String(am).padStart(2,'0')}`;
            const cDay = +new Intl.DateTimeFormat('en-US',{timeZone:c.tz,day:'2-digit'}).format(now);
            const dayLabel = cDay === homeDay ? 'Today' : (diff > 0 ? 'Tomorrow' : 'Yesterday');
            return `<li class="wc-row">
                <div class="wc-meta"><span class="wc-day">${dayLabel}, ${offLabel}</span><span class="wc-city">${c.name}</span></div>
                <div class="wc-clock"><span class="wc-h">${parts.hour}:${parts.minute}</span><span class="wc-ap">${parts.dayPeriod}</span></div>
            </li>`;
        }).join('');
    }
    renderWorld();
    intervals.push(setInterval(renderWorld, 1000));

    /* ---- Alarms (display + working toggles) ---- */
    const alList = root.querySelector('#alList');
    const alarms = [
        {t:'7:00',  ap:'AM', label:'Wake up',     on:true},
        {t:'8:30',  ap:'AM', label:'Gym',         on:false},
        {t:'1:00',  ap:'PM', label:'Lunch break', on:true},
        {t:'11:30', ap:'PM', label:'Sleep',       on:true},
    ];
    alList.innerHTML = alarms.map(a => `
        <li class="al-row ${a.on ? '' : 'al-off'}">
            <div class="al-meta"><span class="al-time">${a.t}<small>${a.ap}</small></span><span class="al-label">${a.label}</span></div>
            <button class="al-switch ${a.on ? 'on' : ''}" role="switch" aria-checked="${a.on}"><span></span></button>
        </li>`).join('');
    alList.addEventListener('click', (e) => {
        const sw = e.target.closest('.al-switch'); if (!sw) return;
        const on = sw.classList.toggle('on');
        sw.closest('.al-row').classList.toggle('al-off', !on);
        sw.setAttribute('aria-checked', on);
    });

    /* ---- Stopwatch ---- */
    const swTime = root.querySelector('#swTime');
    const swGo   = root.querySelector('#swGo');
    const swLap  = root.querySelector('#swLap');
    const swLaps = root.querySelector('#swLaps');
    let swRunning = false, swStart = 0, swElapsed = 0, lapCount = 0, lastLap = 0;
    const fmtSW = (ms) => {
        const cs = Math.floor(ms/10)%100, s = Math.floor(ms/1000)%60, m = Math.floor(ms/60000);
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    };
    function swTick(){
        const t = swElapsed + (swRunning ? performance.now() - swStart : 0);
        swTime.textContent = fmtSW(t);
        if (swRunning) swRaf = requestAnimationFrame(swTick);
    }
    swGo.addEventListener('click', () => {
        if (swRunning){
            swElapsed += performance.now() - swStart; swRunning = false;
            swGo.textContent = 'Start'; swGo.classList.remove('sw-stop'); swLap.textContent = 'Reset';
        } else {
            swStart = performance.now(); swRunning = true;
            swGo.textContent = 'Stop'; swGo.classList.add('sw-stop');
            swLap.disabled = false; swLap.textContent = 'Lap'; swTick();
        }
    });
    swLap.addEventListener('click', () => {
        if (!swRunning){
            swElapsed = 0; lapCount = 0; lastLap = 0; swLaps.innerHTML = '';
            swTime.textContent = '00:00.00'; swLap.textContent = 'Lap'; swLap.disabled = true; return;
        }
        const t = swElapsed + performance.now() - swStart;
        const lap = t - lastLap; lastLap = t; lapCount++;
        const li = document.createElement('li');
        li.className = 'swlap-row';
        li.innerHTML = `<span>Lap ${lapCount}</span><span>${fmtSW(lap)}</span>`;
        swLaps.prepend(li);
    });

    /* ---- Timer ---- */
    const tmTime = root.querySelector('#tmTime');
    const tmGo   = root.querySelector('#tmGo');
    const tmReset= root.querySelector('#tmReset');
    const tmPresets = root.querySelector('#tmPresets');
    let tmTotal = 0, tmRemain = 0, tmRunning = false, tmEnd = 0;
    const fmtTM = (s) => {
        s = Math.max(0, Math.ceil(s));
        const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sec = s%60;
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
                     : `${m}:${String(sec).padStart(2,'0')}`;
    };
    const tmRender = () => { tmTime.textContent = fmtTM(tmRemain); };
    function tmStop(){
        tmRunning = false; clearInterval(tmInt); tmInt = null;
        tmGo.textContent = 'Start'; tmGo.classList.remove('sw-stop');
    }
    tmPresets.addEventListener('click', (e) => {
        const b = e.target.closest('.tm-preset'); if (!b) return;
        tmStop(); tmTotal = tmRemain = +b.dataset.sec; tmRender();
        tmGo.disabled = false; tmReset.disabled = false;
        tmPresets.querySelectorAll('.tm-preset').forEach(p => p.classList.toggle('is-active', p === b));
    });
    tmGo.addEventListener('click', () => {
        if (tmRemain <= 0) return;
        if (tmRunning){ tmStop(); return; }
        tmRunning = true; tmGo.textContent = 'Pause'; tmGo.classList.add('sw-stop');
        tmEnd = performance.now() + tmRemain * 1000;
        tmInt = setInterval(() => {
            tmRemain = (tmEnd - performance.now()) / 1000;
            if (tmRemain <= 0){
                tmRemain = 0; tmRender(); tmStop();
                tmTime.classList.add('tm-done');
                setTimeout(() => tmTime.classList.remove('tm-done'), 1800);
                return;
            }
            tmRender();
        }, 100);
    });
    tmReset.addEventListener('click', () => { tmStop(); tmRemain = tmTotal; tmRender(); });

    /* ---- cleanup ---- */
    return () => {
        intervals.forEach(clearInterval);
        if (swRaf) cancelAnimationFrame(swRaf);
        if (tmInt) clearInterval(tmInt);
    };
}

/* ============================================================
   Camera app — live preview via the device webcam
   ============================================================ */
function initCamera(root){
    const view    = root.querySelector('.v-camera');
    const video   = root.querySelector('#camVideo');
    const canvas  = root.querySelector('#camCanvas');
    const shot    = root.querySelector('#camShot');
    const errBox  = root.querySelector('#camError');
    const shutter = root.querySelector('#camShutter');
    const flip    = root.querySelector('#camFlip');
    const thumb   = root.querySelector('#camThumb');
    let stream = null, lastShot = null, viewing = false;

    const stopStream = () => { if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; } };
    const showVideo  = () => { errBox.hidden = true;  video.hidden = false; };
    const showError  = () => { video.hidden = true;   errBox.hidden = false; };

    // Open a stream for the given constraints, falling back to ANY camera.
    // Returns the stream, or null if the camera is truly unavailable.
    async function openStream(constraints){
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
        try { return await navigator.mediaDevices.getUserMedia(constraints); }
        catch (_) {
            try { return await navigator.mediaDevices.getUserMedia({ video:true, audio:false }); }
            catch (e) { return null; }
        }
    }

    // Initial open. Plain {video:true} is the most compatible request on desktop
    // (no facingMode quirks). The error overlay only ever shows if this returns
    // nothing — a live stream can never sit behind the error icon.
    async function start(){
        const s = await openStream({ video:true, audio:false });
        if (!s){ showError(); return; }
        stopStream();
        stream = s;
        video.srcObject = s;
        showVideo();
        try { await video.play(); } catch (_) {}
    }

    // Flip = mirror the preview horizontally (like the front-camera selfie view).
    // It's a pure CSS flip of the current stream, so it works on any device
    // without juggling hardware cameras or interrupting the feed.
    function flipView(){ video.classList.toggle('cam-mirror'); }

    function capture(){
        if (!stream || !video.videoWidth) return;
        const w = video.videoWidth, h = video.videoHeight;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        // bake the mirror into the photo so it matches the preview
        if (video.classList.contains('cam-mirror')){ ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, w, h);
        lastShot = canvas.toDataURL('image/jpeg', 0.92);
        thumb.style.backgroundImage = `url(${lastShot})`;
        thumb.classList.add('has-shot');
        view.classList.add('cam-flash');
        setTimeout(() => view.classList.remove('cam-flash'), 200);
    }
    function toggleView(){
        if (!lastShot) return;
        viewing = !viewing;
        shot.src = lastShot;
        shot.hidden = !viewing;
    }

    shutter.addEventListener('click', capture);
    flip.addEventListener('click', flipView);
    thumb.addEventListener('click', toggleView);
    start();

    return () => stopStream();
}

/* ============================================================
   Weather app — live data from Open-Meteo (no API key)
   ============================================================ */
function initWeather(root){
    let cancelled = false;
    // WMO weather codes -> { text, emoji, day/night handled by caller }
    const WMO = {
        0:['Clear','☀️','🌙'], 1:['Mostly Clear','🌤️','🌙'], 2:['Partly Cloudy','⛅','☁️'],
        3:['Cloudy','☁️','☁️'], 45:['Fog','🌫️','🌫️'], 48:['Fog','🌫️','🌫️'],
        51:['Light Drizzle','🌦️','🌧️'], 53:['Drizzle','🌦️','🌧️'], 55:['Drizzle','🌧️','🌧️'],
        61:['Light Rain','🌦️','🌧️'], 63:['Rain','🌧️','🌧️'], 65:['Heavy Rain','🌧️','🌧️'],
        66:['Freezing Rain','🌧️','🌧️'], 67:['Freezing Rain','🌧️','🌧️'],
        71:['Light Snow','🌨️','🌨️'], 73:['Snow','🌨️','🌨️'], 75:['Heavy Snow','❄️','❄️'],
        77:['Snow','🌨️','🌨️'], 80:['Showers','🌦️','🌧️'], 81:['Showers','🌧️','🌧️'],
        82:['Heavy Showers','⛈️','⛈️'], 85:['Snow Showers','🌨️','🌨️'], 86:['Snow Showers','❄️','❄️'],
        95:['Thunderstorm','⛈️','⛈️'], 96:['Thunderstorm','⛈️','⛈️'], 99:['Thunderstorm','⛈️','⛈️'],
    };
    const desc = (code, isDay) => {
        const w = WMO[code] || ['—','🌡️','🌡️'];
        return { text:w[0], icon:isDay ? w[1] : w[2] };
    };
    const $ = (id) => root.querySelector('#' + id);
    const wxRoot = root.querySelector('#wxRoot');

    async function load(){
        const url = 'https://api.open-meteo.com/v1/forecast'
            + '?latitude=53.3498&longitude=-6.2603'   // Dublin City Centre
            + '&current=temperature_2m,weather_code,is_day'
            + '&hourly=temperature_2m,weather_code,is_day'
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
            + '&timezone=auto&forecast_days=10';
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('http');
            const d = await r.json();
            if (cancelled) return;
            render(d);
        } catch (_) {
            if (!cancelled) $('wxCond').textContent = 'Weather unavailable (offline)';
        }
    }

    function render(d){
        const cur = d.current;
        const dnow = desc(cur.weather_code, cur.is_day === 1);
        $('wxTemp').textContent = Math.round(cur.temperature_2m) + '°';
        $('wxCond').textContent = dnow.text;
        $('wxHi').textContent = 'H:' + Math.round(d.daily.temperature_2m_max[0]) + '°';
        $('wxLo').textContent = 'L:' + Math.round(d.daily.temperature_2m_min[0]) + '°';
        wxRoot.dataset.day = (cur.is_day === 1) ? '1' : '0';

        // hourly: next 12 from the current hour
        const now = new Date();
        let startIdx = d.hourly.time.findIndex(t => new Date(t) >= new Date(now.getTime() - 3600000));
        if (startIdx < 0) startIdx = 0;
        let html = '';
        for (let i = startIdx; i < startIdx + 12 && i < d.hourly.time.length; i++){
            const t = new Date(d.hourly.time[i]);
            const label = (i === startIdx) ? 'Now'
                : t.toLocaleTimeString([], {hour:'numeric', hour12:true}).replace(':00','').replace(' ','');
            const hd = desc(d.hourly.weather_code[i], d.hourly.is_day[i] === 1);
            html += `<div class="wx-h"><span class="wx-h-t">${label}</span><span class="wx-h-i">${hd.icon}</span><span class="wx-h-d">${Math.round(d.hourly.temperature_2m[i])}°</span></div>`;
        }
        $('wxHourly').innerHTML = html;

        // daily
        const lo = Math.min(...d.daily.temperature_2m_min);
        const hi = Math.max(...d.daily.temperature_2m_max);
        const span = Math.max(1, hi - lo);
        let drows = '';
        d.daily.time.forEach((iso, i) => {
            const day = (i === 0) ? 'Today'
                : new Date(iso).toLocaleDateString([], {weekday:'short'});
            const dd = desc(d.daily.weather_code[i], true);
            const dmin = d.daily.temperature_2m_min[i], dmax = d.daily.temperature_2m_max[i];
            const left = ((dmin - lo) / span) * 100;
            const width = ((dmax - dmin) / span) * 100;
            drows += `<div class="wx-d">
                <span class="wx-d-day">${day}</span>
                <span class="wx-d-i">${dd.icon}</span>
                <span class="wx-d-lo">${Math.round(dmin)}°</span>
                <span class="wx-d-track"><span class="wx-d-range" style="left:${left}%;width:${width}%"></span></span>
                <span class="wx-d-hi">${Math.round(dmax)}°</span>
            </div>`;
        });
        $('wxDaily').innerHTML = drows;
    }

    load();
    return () => { cancelled = true; };
}

/* ============================================================
   Music app — working player (simulated playback, editable library)
   ============================================================ */
function initMusic(root){
    /* Edit this list to change the library. `art` is a CSS gradient for the
       album tile, `dur` is the track length in seconds. */
    const LIBRARY = [
        { title:'For an Angel', artist:'Paul van Dyk',  dur:268, art:'linear-gradient(150deg,#a78bfa,#6d28d9)' },
        { title:'Children',     artist:'Robert Miles',  dur:267, art:'linear-gradient(150deg,#fca5a5,#b91c1c)' },
    ];

    const $ = (id) => root.querySelector('#' + id);
    const art = $('muArt'), titleEl = $('muTitle'), artistEl = $('muArtist');
    const fill = $('muFill'), knob = $('muKnob'), bar = $('muBar');
    const curEl = $('muCur'), durEl = $('muDur'), playIcon = $('muPlayIcon');
    const list = $('muList');
    const PLAY = 'M8 5v14l11-7z';
    const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';

    let idx = 0, playing = false, t = 0, raf = null, last = 0;
    let shuffle = false, repeat = false;

    const fmt = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };

    function renderList(){
        list.innerHTML = LIBRARY.map((s, i) => `
            <li class="mu-row ${i === idx ? 'is-current' : ''}" data-i="${i}">
                <span class="mu-row-art" style="background:${s.art}"></span>
                <span class="mu-row-meta"><span class="mu-row-title">${s.title}</span><span class="mu-row-artist">${s.artist}</span></span>
                <span class="mu-row-state">${(i === idx && playing) ? '<span class="mu-eq"><i></i><i></i><i></i></span>' : fmt(s.dur)}</span>
            </li>`).join('');
    }
    function loadTrack(i, autoplay){
        idx = (i + LIBRARY.length) % LIBRARY.length;
        const s = LIBRARY[idx];
        t = 0;
        titleEl.textContent = s.title;
        artistEl.textContent = s.artist;
        art.style.background = s.art;
        durEl.textContent = fmt(s.dur);
        curEl.textContent = '0:00';
        updateBar();
        renderList();
        if (autoplay) play(); else pause();
    }
    function updateBar(){
        const pct = (t / LIBRARY[idx].dur) * 100;
        fill.style.width = pct + '%';
        knob.style.left = pct + '%';
        curEl.textContent = fmt(t);
    }
    function tick(now){
        if (!playing) return;
        const dt = (now - last) / 1000; last = now;
        t += dt;
        if (t >= LIBRARY[idx].dur){
            if (repeat){ t = 0; }
            else { next(); return; }
        }
        updateBar();
        raf = requestAnimationFrame(tick);
    }
    function play(){
        playing = true;
        playIcon.setAttribute('d', PAUSE);
        last = performance.now();
        raf = requestAnimationFrame(tick);
        renderList();
    }
    function pause(){
        playing = false;
        playIcon.setAttribute('d', PLAY);
        if (raf) cancelAnimationFrame(raf);
        renderList();
    }
    const toggle = () => playing ? pause() : play();
    function next(){
        if (shuffle){ loadTrack(Math.floor(Math.random() * LIBRARY.length), true); }
        else loadTrack(idx + 1, true);
    }
    function prev(){
        if (t > 3){ t = 0; updateBar(); return; }   // restart current first
        loadTrack(idx - 1, true);
    }

    $('muPlay').addEventListener('click', toggle);
    $('muNext').addEventListener('click', next);
    $('muPrev').addEventListener('click', prev);
    $('muShuffle').addEventListener('click', (e) => { shuffle = !shuffle; e.currentTarget.classList.toggle('is-on', shuffle); });
    $('muRepeat').addEventListener('click', (e) => { repeat = !repeat; e.currentTarget.classList.toggle('is-on', repeat); });
    list.addEventListener('click', (e) => {
        const row = e.target.closest('.mu-row'); if (!row) return;
        const i = +row.dataset.i;
        if (i === idx) toggle(); else loadTrack(i, true);
    });
    // scrub by clicking/dragging the progress bar
    function seek(clientX){
        const r = bar.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        t = pct * LIBRARY[idx].dur;
        updateBar();
    }
    bar.addEventListener('pointerdown', (e) => {
        seek(e.clientX);
        const move = (ev) => seek(ev.clientX);
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    });

    loadTrack(0, false);
    return () => { if (raf) cancelAnimationFrame(raf); };
}

/* ============================================================
   App Store app — themed showcase; buttons open apps / links
   ============================================================ */
function initStore(root){
    function onClick(e){
        const el = e.target.closest('[data-open],[data-link]');
        if (!el) return;
        if (el.dataset.open) openApp(el.dataset.open);
        else if (el.dataset.link) window.open(el.dataset.link, '_blank', 'noopener');
    }
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}

/* ============================================================
   Notes app — create / edit / delete, saved to localStorage
   ============================================================ */
function initNotes(root){
    const KEY = 'pf_notes';
    const listView = root.querySelector('#notesListView');
    const listEl   = root.querySelector('#notesList');
    const emptyEl  = root.querySelector('#notesEmpty');
    const editor   = root.querySelector('#notesEditor');
    const area     = root.querySelector('#notesArea');
    let notes = [];
    let curId = null;

    try { notes = JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { notes = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (_) {} };

    const titleOf = (t) => (t.trim().split('\n')[0] || 'New Note').slice(0, 40);
    const previewOf = (t) => { const l = t.trim().split('\n'); return (l[1] || '').slice(0, 40) || 'No additional text'; };
    const dateOf = (ts) => new Date(ts).toLocaleDateString([], {day:'numeric', month:'short', year:'numeric'});

    function renderList(){
        notes.sort((a, b) => b.ts - a.ts);
        emptyEl.hidden = notes.length > 0;
        listEl.innerHTML = notes.map(n => `
            <li class="note-row" data-id="${n.id}">
                <span class="note-row-title">${titleOf(n.text) || 'New Note'}</span>
                <span class="note-row-sub"><span class="note-row-date">${dateOf(n.ts)}</span> ${previewOf(n.text)}</span>
            </li>`).join('');
    }
    function openEditor(id){
        curId = id;
        const n = notes.find(x => x.id === id);
        area.value = n ? n.text : '';
        listView.hidden = true; editor.hidden = false;
        area.focus();
    }
    function closeEditor(){
        editor.hidden = true; listView.hidden = false;
        renderList();
    }

    root.querySelector('#notesNew').addEventListener('click', () => {
        const n = { id: Date.now().toString(36), text: '', ts: Date.now() };
        notes.push(n); save(); openEditor(n.id);
    });
    listEl.addEventListener('click', (e) => {
        const row = e.target.closest('.note-row'); if (!row) return;
        openEditor(row.dataset.id);
    });
    area.addEventListener('input', () => {
        const n = notes.find(x => x.id === curId);
        if (n){ n.text = area.value; n.ts = Date.now(); save(); }
    });
    root.querySelector('#notesBack').addEventListener('click', () => {
        // drop empty notes so the list isn't littered with blanks
        notes = notes.filter(n => n.text.trim() !== '');
        save(); closeEditor();
    });
    root.querySelector('#notesDel').addEventListener('click', () => {
        notes = notes.filter(n => n.id !== curId); save(); closeEditor();
    });

    renderList();
    return null;
}

/* ============================================================
   Brightness is shared by Settings and Control Center. The phone
   screen's data-brightness (25 to 100) is the single source of truth;
   both controls write it through setScreenBrightness and read it back,
   so the two sliders always agree and represent the same level.
   ============================================================ */
function setScreenBrightness(v){
    v = Math.max(25, Math.min(100, Math.round(v)));
    screen.dataset.brightness = v;
    const d = document.getElementById('screenDim');
    if (d) d.style.opacity = ((100 - v) / 100 * 0.8).toFixed(3);
    return v;
}
/* brightness value (25 to 100) maps to a control fill/position of 0 to 100% */
function brightnessFill(v){ return ((+v - 25) / 75) * 100; }

/* ============================================================
   Settings app: brightness / airplane / wallpaper, etc.
   The phone screen element is the single source of truth so the
   switches stay in sync each time Settings is reopened.
   ============================================================ */
function initSettings(root){
    const grain = document.querySelector('.grain');

    const state = {
        airplane:  screen.classList.contains('airplane'),
        bluetooth: screen.dataset.bt !== 'off',          // default on
        blur:      !screen.classList.contains('wp-noblur'),
        grain:     !screen.classList.contains('no-grain'),
    };
    const setSwitch = (sw, on) => { sw.classList.toggle('on', !!on); sw.setAttribute('aria-checked', !!on); };

    // sync each toggle to the real current state
    root.querySelectorAll('.set-toggle').forEach(row => {
        const sw = row.querySelector('.set-switch');
        setSwitch(sw, state[row.dataset.setting]);
    });

    function apply(key, on){
        if (key === 'airplane') screen.classList.toggle('airplane', on);
        else if (key === 'bluetooth') screen.dataset.bt = on ? 'on' : 'off';
        else if (key === 'blur') screen.classList.toggle('wp-noblur', !on);
        else if (key === 'grain'){ screen.classList.toggle('no-grain', !on); if (grain) grain.style.display = on ? 'block' : 'none'; }
    }

    const onClick = (e) => {
        const sw = e.target.closest('.set-switch'); if (!sw) return;
        const key = sw.closest('.set-toggle').dataset.setting;
        const on = !sw.classList.contains('on');
        setSwitch(sw, on);
        apply(key, on);
    };
    root.addEventListener('click', onClick);

    // brightness slider dims the whole screen — uses the shared helper so it
    // stays in lock-step with the Control Center slider (same dataset + dim).
    const bright = root.querySelector('#setBrightness');
    bright.value = screen.dataset.brightness || 100;
    const onInput = () => setScreenBrightness(+bright.value);
    bright.addEventListener('input', onInput);

    // root (appBody) persists across opens — hand back a cleanup so these
    // listeners don't accumulate and start cancelling each other's toggles
    return () => {
        root.removeEventListener('click', onClick);
        bright.removeEventListener('input', onInput);
    };
}

/* ============================================================
   Control Center — pulls down from the top-right. Mirrors the
   phone's real state so toggles stay in sync with the Settings app
   (airplane / wi-fi / bluetooth / brightness / flashlight).
   ============================================================ */
const cc       = document.getElementById('controlCenter');
const ccTrig   = document.getElementById('ccTrigger');
const ccBright = document.getElementById('ccBright');
const ccFill   = ccBright ? ccBright.querySelector('.cc-slider-fill') : null;

/* reflect the live screen state onto the buttons every time it opens */
function syncCC(){
    if (!cc) return;
    const air = screen.classList.contains('airplane');
    const set = (k, on) => { const b = cc.querySelector(`[data-cc="${k}"]`); if (b) b.classList.toggle('on', !!on); };
    set('airplane',  air);
    set('wifi',      !air && !screen.classList.contains('wifi-off'));
    set('cellular',  !air && !screen.classList.contains('cell-off'));
    set('bluetooth', !air && screen.dataset.bt !== 'off');
    set('flashlight', document.body.classList.contains('flash-on'));
    const v = +(screen.dataset.brightness || 100);
    if (ccFill)   ccFill.style.height = brightnessFill(v) + '%';   // same % as Settings
    if (ccBright) ccBright.setAttribute('aria-valuenow', v);
}
function openCC(){ if (!cc) return; syncCC(); screen.classList.add('cc-open'); }
function closeCC(){ screen.classList.remove('cc-open'); }

if (cc && ccTrig){
    /* ---- open: click or swipe down on the top-right grab zone ---- */
    ccTrig.addEventListener('click', (e) => { e.stopPropagation(); openCC(); });
    let trigY = null;
    ccTrig.addEventListener('pointerdown', (e) => { trigY = e.clientY; try { ccTrig.setPointerCapture(e.pointerId); } catch (_) {} });
    ccTrig.addEventListener('pointerup', (e) => { if (trigY !== null && e.clientY - trigY > 18) openCC(); trigY = null; });

    /* ---- close: tap the empty backdrop, or swipe up on the panel ---- */
    cc.addEventListener('click', (e) => { if (e.target === cc || e.target.classList.contains('cc-grid')) closeCC(); });
    let panelY = null;
    cc.addEventListener('pointerdown', (e) => { panelY = e.clientY; });
    cc.addEventListener('pointerup', (e) => { if (panelY !== null && panelY - e.clientY > 30) closeCC(); panelY = null; });

    /* ---- toggles ---- */
    cc.addEventListener('click', (e) => {
        const t = e.target.closest('[data-cc]'); if (!t) return;
        const key = t.dataset.cc;
        const dropAirplane = () => screen.classList.remove('airplane');
        switch (key){
            case 'airplane':  screen.classList.toggle('airplane'); break;
            case 'wifi':      dropAirplane(); screen.classList.toggle('wifi-off'); break;
            case 'cellular':  dropAirplane(); screen.classList.toggle('cell-off'); break;
            case 'bluetooth': dropAirplane(); screen.dataset.bt = (screen.dataset.bt === 'off') ? 'on' : 'off'; break;
            case 'flashlight': {
                const on = !document.body.classList.contains('flash-on');
                document.body.classList.toggle('flash-on', on);
                if (typeof flashBtn !== 'undefined' && flashBtn) flashBtn.classList.toggle('active', on);
                break;
            }
            case 'orient':
            case 'dnd':       t.classList.toggle('on'); break;   // cosmetic toggles
            case 'music':     closeCC(); openApp('music');  return;
            case 'camera':    closeCC(); openApp('camera'); return;
            case 'brightness': return;                           // handled by the drag below
        }
        syncCC();
    });

    /* ---- drag the tall sliders. Brightness drives the real dim overlay
           (same as Settings); volume is a visual-only level. ---- */
    function wireSlider(el, onPct){
        if (!el) return;
        const fill = el.querySelector('.cc-slider-fill');
        const setFromY = (clientY) => {
            const r = el.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
            const ariaVal = onPct(pct);                // side effect; returns the aria value
            // the fill spans the FULL bar (0–100%) as you drag top→bottom, so
            // it reads the same percentage as the Settings slider's position
            if (fill) fill.style.height = (pct * 100) + '%';
            if (ariaVal != null) el.setAttribute('aria-valuenow', Math.round(ariaVal));
        };
        let dragging = false;
        el.addEventListener('pointerdown', (e) => { dragging = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} setFromY(e.clientY); e.stopPropagation(); });
        el.addEventListener('pointermove', (e) => { if (dragging) setFromY(e.clientY); });
        el.addEventListener('pointerup',   (e) => { dragging = false; e.stopPropagation(); });
        el.addEventListener('click', (e) => e.stopPropagation());
    }
    // brightness clamps 25–100; the shared helper keeps Settings + CC in sync
    wireSlider(ccBright, (pct) => setScreenBrightness(25 + pct * 75));
    wireSlider(document.getElementById('ccVol'), (pct) => Math.round(pct * 100));
}
