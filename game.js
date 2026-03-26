(() => {
  const arena = document.getElementById("arena");
  const itemsRoot = document.getElementById("items");
  const catcher = document.getElementById("catcher");
  const outerPath = document.getElementById("catcherOuter");
  const midPath = document.getElementById("catcherMid");
  const innerPath = document.getElementById("catcherInner");

  const player = document.getElementById("player");

  const screen = document.getElementById("screen");
  const startScreen = document.getElementById("startScreen");
  const startBtn = document.getElementById("startBtn");
  const rulesBtn = document.getElementById("rulesBtn");

  const startSlideIntro = document.getElementById("startSlideIntro");
  const startSlideRules = document.getElementById("startSlideRules");
  const startPrizesList = document.getElementById("startPrizesList");

  const introScreen = document.getElementById("introScreen");
  const introStrip = document.getElementById("introStrip");
  const introCatcher = document.getElementById("introCatcher");
  const introHandle = document.getElementById("introHandle");
  const introOuterPath = document.getElementById("introOuterPath");
  const introMidPath = document.getElementById("introMidPath");
  const introInnerPath = document.getElementById("introInnerPath");

  const scoreNowEl = document.getElementById("scoreNow");
  const scoreTotalEl = document.getElementById("scoreTotal");
  const closeBtn = document.querySelector(".hud__close");
  const livesEls = Array.from(document.querySelectorAll(".hud__lives .life"));

  if (
    !arena ||
    !itemsRoot ||
    !catcher ||
    !outerPath ||
    !midPath ||
    !innerPath ||
    !player ||
    !introScreen ||
    !introStrip ||
    !introCatcher ||
    !introHandle ||
    !introOuterPath ||
    !introMidPath ||
    !introInnerPath ||
    !startScreen ||
    !startBtn ||
    !rulesBtn ||
    !startSlideIntro ||
    !startSlideRules ||
    !startPrizesList ||
    !scoreNowEl ||
    !scoreTotalEl
  )
    return;

  const LIVES_MAX = 5;
  const KEYS_TO_WIN = 20;
  let lives = LIVES_MAX;
  let scoreNow = Number(scoreNowEl.textContent || 0);
  let running = false;

  const PRIZES = [
    { id: "coupon", title: "Купон на посуточную аренду", desc: "Скидка на аренду жилья посуточно. Подробные условия в приложении Циан." },
    { id: "early", title: "100 дней раннего доступа к объявлениям от собственника", desc: "Получите ранний доступ к новым функциям сервиса на 100 дней." },
    { id: "realtor", title: "Скидка 10 000₽ на\u00A0услуги риелтора от\u00A0Циана", desc: "Скидка 10 000 рублей на услуги риелтора при оформлении сделки через Циан." },
  ];
  const PRIZE_FOOTER = "Подарок можно получить только один раз. Его можно передавать другим людям.";

  function setActiveStartSlide(which) {
    const showIntro = which === "intro";
    startSlideIntro?.classList.toggle("is-active", showIntro);
    startSlideRules?.classList.toggle("is-active", !showIntro);
  }

  function renderStartPrizes() {
    if (!startPrizesList) return;
    startPrizesList.innerHTML = PRIZES.map(
      (p) => `
        <div class="prize-item" data-prize-id="${p.id}">
          <span class="prize-item__icon prize-item__icon--${p.id}" aria-hidden="true">
            <img class="prize-item__iconImg" src="./asset/game-items/${p.id}.png" alt="" aria-hidden="true" />
          </span>
          <span class="prize-item__title">${p.title}</span>
          <img class="prize-item__chevron" src="./asset/game-items/ChevronRight.svg" alt="" aria-hidden="true" />
        </div>`
    ).join("");
  }

  function hideStart() {
    introScreen.classList.add("is-hidden");
    startScreen.classList.add("is-hidden");
    startScreen.classList.remove("start-screen--revealing");
    startScreen.style.setProperty("--intro-reveal", "100%");
  }

  function showStart() {
    introScreen.classList.add("is-hidden");
    startScreen.classList.remove("is-hidden");
    startScreen.classList.remove("start-screen--revealing");
    startScreen.style.setProperty("--intro-reveal", "100%");
    setActiveStartSlide("intro");
    introTarget = 1;
    introNow = 1;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const state = {
    norm: 0, // current (-1..1)
    targetNorm: 0, // target (-1..1)
    px: 0,
    py: 0,
    pr: 34, // collision radius (set on first update)
    prInited: false,
    pointerDown: false,
    pointerId: null,
  };

  function arenaRect() {
    return arena.getBoundingClientRect();
  }

  function catcherRect() {
    return catcher.getBoundingClientRect();
  }

  function buildTrianglePath(L, R, apexX, apexY, rView) {
    // Straight sides + rounded apex.
    // SVG viewBox coords: X in [0..100], Y in [0..100]
    const baseY = 100;

    if (!rView || rView <= 0.01) {
      return `M ${L.toFixed(2)} ${baseY} L ${apexX.toFixed(2)} ${apexY.toFixed(2)} L ${R.toFixed(2)} ${baseY} Z`;
    }

    const left = { x: L, y: baseY };
    const right = { x: R, y: baseY };
    const apex = { x: apexX, y: apexY };

    const vL = { x: left.x - apex.x, y: left.y - apex.y };
    const vR = { x: right.x - apex.x, y: right.y - apex.y };
    const lenL = Math.hypot(vL.x, vL.y);
    const lenR = Math.hypot(vR.x, vR.y);
    if (!lenL || !lenR) {
      return `M ${L.toFixed(2)} ${baseY} L ${apexX.toFixed(2)} ${apexY.toFixed(2)} L ${R.toFixed(2)} ${baseY} Z`;
    }

    const uL = { x: vL.x / lenL, y: vL.y / lenL };
    const uR = { x: vR.x / lenR, y: vR.y / lenR };

    const dot = clamp(uL.x * uR.x + uL.y * uR.y, -1, 1);
    const theta = Math.acos(dot);
    const half = theta / 2;
    const tanHalf = Math.tan(half);
    const sinHalf = Math.sin(half);

    if (Math.abs(tanHalf) < 1e-6 || Math.abs(sinHalf) < 1e-6) {
      return `M ${L.toFixed(2)} ${baseY} L ${apexX.toFixed(2)} ${apexY.toFixed(2)} L ${R.toFixed(2)} ${baseY} Z`;
    }

    // Tangency distance along each side from the apex
    let t = rView / tanHalf;
    const maxT = Math.min(lenL, lenR) * 0.55;
    if (t > maxT) {
      t = maxT;
      rView = t * tanHalf; // keep consistent radius
    }

    const P1 = { x: apex.x + uL.x * t, y: apex.y + uL.y * t };
    const P2 = { x: apex.x + uR.x * t, y: apex.y + uR.y * t };

    // Circle center lies on the angle bisector
    const bis = { x: uL.x + uR.x, y: uL.y + uR.y };
    const bisLen = Math.hypot(bis.x, bis.y);
    if (!bisLen) {
      return `M ${L.toFixed(2)} ${baseY} L ${apexX.toFixed(2)} ${apexY.toFixed(2)} L ${R.toFixed(2)} ${baseY} Z`;
    }
    bis.x /= bisLen;
    bis.y /= bisLen;

    const centerDist = rView / sinHalf;
    const C = { x: apex.x + bis.x * centerDist, y: apex.y + bis.y * centerDist };

    const v1 = { x: P1.x - C.x, y: P1.y - C.y };
    const v2 = { x: P2.x - C.x, y: P2.y - C.y };
    const ang1 = Math.atan2(v1.y, v1.x);
    const ang2 = Math.atan2(v2.y, v2.x);
    const TAU = Math.PI * 2;
    const deltaPos = (ang2 - ang1 + TAU) % TAU;
    const sweepFlag = deltaPos <= Math.PI ? 1 : 0;

    const rr = Math.max(0.01, rView);
    return `M ${L.toFixed(2)} ${baseY.toFixed(2)} L ${P1.x.toFixed(2)} ${P1.y.toFixed(
      2
    )} A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 ${sweepFlag} ${P2.x.toFixed(2)} ${P2.y.toFixed(
      2
    )} L ${R.toFixed(2)} ${baseY.toFixed(2)} Z`;
  }

  /**
   * Intro only: vertical base on the left (x=0), apex to the right.
   * Same rounded-apex math as buildTrianglePath, different winding.
   */
  function buildLeftEdgeTrianglePath(baseTop, baseBottom, apexX, apexY, rView) {
    const cornerTop = { x: 0, y: baseTop };
    const cornerBot = { x: 0, y: baseBottom };
    const apex = { x: apexX, y: apexY };

    if (!rView || rView <= 0.01) {
      return `M ${cornerTop.x.toFixed(2)} ${cornerTop.y.toFixed(2)} L ${apex.x.toFixed(2)} ${apex.y.toFixed(
        2
      )} L ${cornerBot.x.toFixed(2)} ${cornerBot.y.toFixed(2)} Z`;
    }

    const vL = { x: cornerTop.x - apex.x, y: cornerTop.y - apex.y };
    const vR = { x: cornerBot.x - apex.x, y: cornerBot.y - apex.y };
    const lenL = Math.hypot(vL.x, vL.y);
    const lenR = Math.hypot(vR.x, vR.y);
    if (!lenL || !lenR) {
      return `M ${cornerTop.x.toFixed(2)} ${cornerTop.y.toFixed(2)} L ${apex.x.toFixed(2)} ${apex.y.toFixed(
        2
      )} L ${cornerBot.x.toFixed(2)} ${cornerBot.y.toFixed(2)} Z`;
    }

    const uL = { x: vL.x / lenL, y: vL.y / lenL };
    const uR = { x: vR.x / lenR, y: vR.y / lenR };

    const dot = clamp(uL.x * uR.x + uL.y * uR.y, -1, 1);
    const theta = Math.acos(dot);
    const half = theta / 2;
    const tanHalf = Math.tan(half);
    const sinHalf = Math.sin(half);

    if (Math.abs(tanHalf) < 1e-6 || Math.abs(sinHalf) < 1e-6) {
      return `M ${cornerTop.x.toFixed(2)} ${cornerTop.y.toFixed(2)} L ${apex.x.toFixed(2)} ${apex.y.toFixed(
        2
      )} L ${cornerBot.x.toFixed(2)} ${cornerBot.y.toFixed(2)} Z`;
    }

    let t = rView / tanHalf;
    const maxT = Math.min(lenL, lenR) * 0.55;
    if (t > maxT) {
      t = maxT;
      rView = t * tanHalf;
    }

    const P1 = { x: apex.x + uL.x * t, y: apex.y + uL.y * t };
    const P2 = { x: apex.x + uR.x * t, y: apex.y + uR.y * t };

    const bis = { x: uL.x + uR.x, y: uL.y + uR.y };
    const bisLen = Math.hypot(bis.x, bis.y);
    if (!bisLen) {
      return `M ${cornerTop.x.toFixed(2)} ${cornerTop.y.toFixed(2)} L ${apex.x.toFixed(2)} ${apex.y.toFixed(
        2
      )} L ${cornerBot.x.toFixed(2)} ${cornerBot.y.toFixed(2)} Z`;
    }
    bis.x /= bisLen;
    bis.y /= bisLen;

    const centerDist = rView / sinHalf;
    const C = { x: apex.x + bis.x * centerDist, y: apex.y + bis.y * centerDist };

    const v1 = { x: P1.x - C.x, y: P1.y - C.y };
    const v2 = { x: P2.x - C.x, y: P2.y - C.y };
    const ang1 = Math.atan2(v1.y, v1.x);
    const ang2 = Math.atan2(v2.y, v2.x);
    const TAU = Math.PI * 2;
    const deltaPos = (ang2 - ang1 + TAU) % TAU;
    const sweepFlag = deltaPos <= Math.PI ? 1 : 0;

    const rr = Math.max(0.01, rView);
    return `M ${cornerTop.x.toFixed(2)} ${cornerTop.y.toFixed(2)} L ${P1.x.toFixed(2)} ${P1.y.toFixed(
      2
    )} A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 ${sweepFlag} ${P2.x.toFixed(2)} ${P2.y.toFixed(
      2
    )} L ${cornerBot.x.toFixed(2)} ${cornerBot.y.toFixed(2)} Z`;
  }

  function initIntroHandleGeometry() {
    // No-op now (intro curtain triangle is updated dynamically in applyIntro()).
    return;
  }

  function initBallCollisionRadius() {
    if (state.prInited) return;
    const rP = player.getBoundingClientRect();
    // Slightly bigger than half-ball for forgiving "catch" feel.
    state.pr = (Math.min(rP.width, rP.height) / 2) * 0.45;
    state.prInited = true;
  }

  function updateTriangleAndBall(norm) {
    initBallCollisionRadius();

    const c = catcherRect();
    const a = arenaRect();

    // Triangle geometry (viewBox 0..100)
    // База должна совпадать с краями экрана: используем X=0..100.
    const baseLeftX = 0;
    const baseRightX = 100;
    const apexY = 8;

    // Внутренний (белый) треугольник:
    // - у вершины делаем белый ближе к оранжевому (меньше insetY)
    // - у основания белый сильнее "уходит" внутрь (больше insetX),
    //   чтобы оранжевая обводка утолщалась книзу.
    const insetX = 8;
    const insetY = 5;
    const ballOffsetPx = 45; // подняли шарик на 5px вверх
    const catchTriggerUpPx = 14; // ловим не так рано (сложнее)

    // Только вершина двигается: основание зафиксировано.
    // Чтобы шарик мог двигаться почти до краёв экрана, ограничиваем апекс
    // так, чтобы центр шарика (с учётом translate(-50%)) не выходил за края.
    const apexShiftView = 50; // norm -1..1 -> апекс от 0..100 (дальше зажмём радиусом шарика)
    const rP = player.getBoundingClientRect();
    const halfBallPx = Math.min(rP.width, rP.height) / 2;
    const halfBallView = (halfBallPx / Math.max(1, c.width)) * 100;
    // Консервативный кламп по X для того, чтобы шарик не уходил за пределы белого треугольника.
    const apexMinX = baseLeftX + insetX + halfBallView;
    const apexMaxX = baseRightX - insetX - halfBallView;
    const apexX = clamp(50 + norm * apexShiftView, apexMinX, apexMaxX);

    const L = baseLeftX;
    const R = baseRightX;

    // Mid (yellow) between orange and white: half inset values.
    const insetXMid = insetX * 0.5;
    const insetYMid = insetY * 0.5;

    const L2 = clamp(L + insetX, 2, 98);
    const R2 = clamp(R - insetX, 2, 98);
    const apexY2 = apexY + insetY;

    const Lmid = clamp(L + insetXMid, 2, 98);
    const Rmid = clamp(R - insetXMid, 2, 98);
    const apexYmid = apexY + insetYMid;

    // Different rounding so the orange corner reads wider than the white one.
    const roundingPxOuter = 16;
    const roundingPxMid = 13;
    const roundingPxInner = 10;
    const rViewOuter = (roundingPxOuter / Math.max(1, c.height)) * 100;
    const rViewMid = (roundingPxMid / Math.max(1, c.height)) * 100;
    const rViewInner = (roundingPxInner / Math.max(1, c.height)) * 100;

    // Straight sides, rounded apex only.
    outerPath.setAttribute("d", buildTrianglePath(L, R, apexX, apexY, rViewOuter));
    midPath.setAttribute("d", buildTrianglePath(Lmid, Rmid, apexX, apexYmid, rViewMid));
    innerPath.setAttribute("d", buildTrianglePath(L2, R2, apexX, apexY2, rViewInner));

    // Ball follows the vertex, but with smaller horizontal shift:
    // apex at -1 => ball center ~ -0.9.
    const apexXPx = (apexX / 100) * c.width;
    const apexYPx = (apexY2 / 100) * c.height;

    const catcherCenterX = c.width / 2;
    const follow = 0.85;
    const ballCenterXPx = catcherCenterX + (apexXPx - catcherCenterX) * follow;

    player.style.left = `${ballCenterXPx}px`;
    player.style.top = `${apexYPx + ballOffsetPx}px`;

    // Collision circle center in arena coords.
    state.px = (c.left - a.left) + ballCenterXPx;
    state.py = (c.top - a.top) + apexYPx + ballOffsetPx - catchTriggerUpPx;
  }

  function resetCatcher() {
    state.norm = 0;
    state.targetNorm = 0;
    updateTriangleAndBall(0);
  }

  function setScore(next) {
    scoreNow = Math.max(0, next);
    scoreNowEl.textContent = String(scoreNow);
    if (scoreTotalEl) scoreTotalEl.textContent = String(KEYS_TO_WIN);
  }

  function setLives(next) {
    lives = clamp(next, 0, LIVES_MAX);
    livesEls.forEach((el, idx) => {
      const on = idx < lives;
      el.classList.toggle("is-on", on);
      el.classList.toggle("is-off", !on);
    });
  }

  function spawnPop(x, y, kind) {
    const el = document.createElement("div");
    el.className = `pop${kind === "bad" ? " pop--bad" : ""}`;
    el.style.setProperty("--px", `${x}px`);
    el.style.setProperty("--py", `${y}px`);
    arena.appendChild(el);
    window.setTimeout(() => el.remove(), 650);
  }

  function spawnSalute(x, y) {
    const count = 28;
    const spreadX = 86;
    const spreadY = 34;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "pop pop--salute";
      const size = 3 + Math.random() * 10; // 3..13px
      const dx = (Math.random() - 0.5) * spreadX * (0.65 + Math.random() * 0.9);
      const dy = (Math.random() - 0.5) * spreadY * (0.65 + Math.random() * 0.9);
      const dur = 620 + Math.random() * 520; // 620..1140ms
      const tyEnd = -12 - Math.random() * 34; // -12..-46px
      const s2 = 1.8 + Math.random() * 2.2; // 1.8..4.0

      el.style.setProperty("--px", `${x + dx}px`);
      el.style.setProperty("--py", `${y + dy}px`);
      el.style.setProperty("--ps", `${size}px`);
      el.style.setProperty("--pd", `${dur}ms`);
      el.style.setProperty("--tyEnd", `${tyEnd}px`);
      el.style.setProperty("--s2", `${s2}`);
      arena.appendChild(el);
      window.setTimeout(() => el.remove(), 1060);
    }
  }

  function circleHit(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const rr = a.r + b.r;
    return dx * dx + dy * dy <= rr * rr;
  }

  function createItem(type) {
    const el = document.createElement("div");
    el.className = "item";
    el.dataset.kind = type === "thief" || type === "granny" || type === "invis" ? "bad" : "good";
    el.dataset.type = type;

    const float = document.createElement("div");
    float.className = `float float--${type}`;
    float.setAttribute("aria-hidden", "true");

    // Your PNGs in `asset/game-items/` (optional). If absent, only placeholder glow stays.
    const icon = document.createElement("img");
    icon.className = "icon";
    icon.alt = "";
    icon.draggable = false;
    icon.src = `./asset/game-items/${type}.png`;
    icon.addEventListener("load", () => float.classList.add("has-img"));
    icon.addEventListener("error", () => {});
    float.appendChild(icon);

    // Minimal fallback shapes (only if PNG is missing).
    if (type.startsWith("key")) {
      const fig = document.createElement("div");
      fig.className = `figure figure--key figure--${type}`;
      float.appendChild(fig);
    } else if (type === "thief") {
      const fig = document.createElement("div");
      fig.className = `figure figure--thief`;
      float.appendChild(fig);
    } else if (type === "granny") {
      const fig = document.createElement("div");
      fig.className = `figure figure--granny`;
      float.appendChild(fig);
    } else if (type === "invis") {
      const fig = document.createElement("div");
      fig.className = `figure figure--invis`;
      float.appendChild(fig);
    }

    el.appendChild(float);
    return { el, icon, kind: el.dataset.kind, type, x: 0, y: 0, v: 0, r: 38 };
  }

  const items = [];
  let spawnTimer = null;
  let raf = 0;
  let lastTs = 0;

  function spawnOne() {
    if (!running) return;
    const rA = arenaRect();

    const types = ["key1", "key2", "key3", "key4", "thief", "granny", "invis"];
    const weights = [0.18, 0.16, 0.18, 0.16, 0.14, 0.12, 0.06];

    const roll = Math.random();
    let acc = 0;
    let picked = types[0];
    for (let i = 0; i < types.length; i++) {
      acc += weights[i];
      if (roll <= acc) {
        picked = types[i];
        break;
      }
    }

    const it = createItem(picked);
    it.x = 24 + Math.random() * (rA.width - 48);
    it.y = -62;
    it.v = 300 + Math.random() * 210; // быстрее -> сложнее

    it.el.style.left = `${it.x}px`;
    it.el.style.top = `${it.y}px`;
    itemsRoot.appendChild(it.el);
    items.push(it);
  }

  function removeItem(i) {
    const it = items[i];
    if (!it) return;
    it.el.remove();
    items.splice(i, 1);
  }

  function hitItem(it) {
    if (it.kind === "good") {
      spawnPop(it.x, it.y, "good");
      setScore(scoreNow + 1);
      if (scoreNow >= KEYS_TO_WIN) endGame();
      return;
    }

    setLives(lives - 1);
    if (lives <= 0) endGame();
  }

  function removeItemByRef(it) {
    const idx = items.indexOf(it);
    if (idx >= 0) removeItem(idx);
  }

  function triggerBadHit(it) {
    if (it.el.dataset.caught === "1") return;
    it.el.dataset.caught = "1";

    // Replace bad icon with "second emotion" immediately.
    // Assets: thief2.png / granny2.png / invis2.png
    if (it.type === "thief" || it.type === "granny" || it.type === "invis") {
      const nextSrc = `./asset/game-items/${it.type}2.png`;
      if (it.icon) {
        it.icon.src = nextSrc;
      } else {
        const iconEl = it.el.querySelector("img.icon");
        iconEl && (iconEl.src = nextSrc);
      }
    }

    // Slow down + shake caught item.
    it.v = it.v * 0.15;
    it.el.classList.add("item--bad-caught");

    // Shake catcher a bit.
    catcher.classList.remove("is-bad-hit");
    catcher.offsetWidth; // force reflow to restart animation
    catcher.classList.add("is-bad-hit");
    window.setTimeout(() => catcher.classList.remove("is-bad-hit"), 340);

    // Red salute under the item.
    spawnSalute(it.x, it.y + 22);

    // Update score/lives.
    hitItem(it);

    // Remove after VFX + pause feel.
    window.setTimeout(() => removeItemByRef(it), 520);
  }

  function buildPrizesCard(won) {
    const prizeRows = PRIZES.map(
      (p) => `
      <div class="prize-item ${won ? "" : "prize-item--disabled"}" data-prize-id="${p.id}">
        <span class="prize-item__icon prize-item__icon--${p.id}" aria-hidden="true">
          <img class="prize-item__iconImg" src="./asset/game-items/${p.id}.png" alt="" aria-hidden="true" />
        </span>
        <span class="prize-item__title">${p.title}</span>
        <img class="prize-item__chevron" src="./asset/game-items/ChevronRight.svg" alt="" aria-hidden="true" />
      </div>`
    ).join("");

    const scoreText = `${scoreNow}/${KEYS_TO_WIN}`;

    const cardContent = won
      ? `
        <p class="overlay__score">${scoreText}</p>
        <p class="overlay__win-text">
          <span class="overlay__win-text-title">Браво!</span>
          Подарок ваш —<br/>забирайте
        </p>
        <div class="prizes-list" role="list">${prizeRows}</div>
        <div class="overlay__actions">
          <button class="btn btn--primary btn--pill" data-action="restart" type="button">Играть снова</button>
        </div>
        <p class="overlay__footer">${PRIZE_FOOTER}</p>
      `
      : `
        <p class="overlay__score">${scoreText}</p>
        <p class="overlay__loss-text">Ключей пока<br/>не хватает<br/>Попробуете ещё раз?</p>
        <div class="overlay__actions">
          <button class="btn btn--primary btn--pill" data-action="restart" type="button">Играть снова</button>
        </div>
        <!-- Footer intentionally removed for loss screen -->
      `;

    return `
      <button class="overlay__close" type="button" aria-label="Закрыть">
        <img class="overlay__close-icon" src="./asset/game-items/Close.svg" alt="" />
      </button>
      <div class="overlay__card overlay__card--prizes" role="dialog" aria-label="${won ? "Выбор подарка" : "Конец игры"}">
        ${cardContent}
      </div>
    `;
  }

  function bindPrizesCard(overlay) {
    const closeBtn = overlay.querySelector(".overlay__close");
    if (closeBtn) closeBtn.addEventListener("click", doClose);
  }

  function doRestart() {
    const overlay = document.querySelector(".overlay");
    overlay?.remove();
    resetGame();
    hideStart();
    start();
  }

  function doClose() {
    const overlay = document.querySelector(".overlay");
    overlay?.remove();
    resetGame();
    showStart();
  }

  function endGame() {
    if (!running) return;
    running = false;
    if (spawnTimer) {
      window.clearInterval(spawnTimer);
      spawnTimer = null;
    }
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    const won = scoreNow >= KEYS_TO_WIN;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = buildPrizesCard(won);
    (screen || arena).appendChild(overlay);
    bindPrizesCard(overlay);

    // Делегирование: один обработчик на оверлей, чтобы клики по кнопкам точно срабатывали
    overlay.addEventListener("click", (e) => {
      const restartBtn = e.target.closest('button[data-action="restart"]');
      const closeBtnOverlay = e.target.closest('button[data-action="close"]');
      if (restartBtn) {
        e.preventDefault();
        doRestart();
        return;
      }
      if (closeBtnOverlay) {
        e.preventDefault();
        doClose();
      }
    });
  }

  function resetGame() {
    setScore(0);
    setLives(LIVES_MAX);
    for (let i = items.length - 1; i >= 0; i--) removeItem(i);
    resetCatcher();
    lastTs = 0;
  }

  function tick(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    // Keyboard: hold-to-move (more responsive than key-repeat)
    if (keys.left || keys.right) {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir !== 0) {
        // Tune: higher = faster keyboard movement
        const keyboardSpeed = 1.65; // norm units per second
        state.targetNorm = clamp(state.targetNorm + dir * keyboardSpeed * dt, -1, 1);
      }
    }

    // Smooth catcher movement + synced triangle vertex.
    const k = 0.18;
    state.norm = state.norm + (state.targetNorm - state.norm) * k;
    if (Math.abs(state.targetNorm - state.norm) < 0.001) state.norm = state.targetNorm;
    updateTriangleAndBall(state.norm);

    const rA = arenaRect();
    const p = { x: state.px, y: state.py, r: state.pr };

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.v * dt;
      it.el.style.top = `${it.y}px`;

      // (trail removed)

      if (it.y > rA.height + 90) {
        removeItem(i);
        continue;
      }

      if (it.el.dataset.caught === "1") continue;

      if (circleHit(p, it)) {
        if (it.kind === "bad") {
          triggerBadHit(it);
        } else {
          hitItem(it);
          removeItem(i);
        }
      }
    }

    raf = requestAnimationFrame(tick);
  }

  function start() {
    running = true;
    if (spawnTimer) window.clearInterval(spawnTimer);
    spawnTimer = window.setInterval(spawnOne, 440); // чаще -> сложнее
    spawnOne();
    window.setTimeout(spawnOne, 180);
    raf = requestAnimationFrame(tick);
  }

  function setTargetFromPointer(clientX) {
    const rC = catcherRect();
    const x = clientX - rC.left;
    // Sync pointer range with apex shift in updateTriangleAndBall.
    const apexShiftView = 50;
    const shiftPx = (apexShiftView / 100) * rC.width;
    const norm = (x - rC.width / 2) / Math.max(1, shiftPx);
    state.targetNorm = clamp(norm, -1, 1);
  }

  function onPointerDown(e) {
    if (!running) return;
    if (!e.isPrimary) return;
    state.pointerDown = true;
    state.pointerId = e.pointerId;
    arena.setPointerCapture(e.pointerId);
    setTargetFromPointer(e.clientX);
  }

  function onPointerMove(e) {
    if (!running) return;
    if (!state.pointerDown || e.pointerId !== state.pointerId) return;
    setTargetFromPointer(e.clientX);
  }

  function onPointerUp(e) {
    if (!running) return;
    if (e.pointerId !== state.pointerId) return;
    state.pointerDown = false;
    state.pointerId = null;
  }

  arena.addEventListener("pointerdown", onPointerDown);
  arena.addEventListener("pointermove", onPointerMove);
  arena.addEventListener("pointerup", onPointerUp);
  arena.addEventListener("pointercancel", onPointerUp);

  closeBtn?.addEventListener("click", () => {
    document.querySelector(".overlay")?.remove();
    resetGame();
    showStart();
  });

  const keys = { left: false, right: false };
  window.addEventListener("keydown", (e) => {
    if (!running) return;
    if (e.key === "ArrowLeft") {
      keys.left = true;
      // Instant nudge for snappy feel
      state.targetNorm = clamp(state.targetNorm - 0.16, -1, 1);
      e.preventDefault();
    }
    if (e.key === "ArrowRight") {
      keys.right = true;
      state.targetNorm = clamp(state.targetNorm + 0.16, -1, 1);
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });

  // Intro onboarding: map strip slides right, cyan fills; then start modal.

  // First this many px of pull move only triangle/ball; then cyan strip starts (--intro-p).
  const INTRO_PRE_PX = 130;
  const INTRO_TAP_MS = 400;

  // Rounding for each layer (viewBox units will be derived from screen height).
  const roundingPxOuter = 30;
  const roundingPxMid = 26;
  const roundingPxInner = 22;

  let introNow = 0; // 0..1 (smoothed)
  let introTarget = 0; // 0..1 (direct)
  let introDragging = false;
  let introPointerMoved = false;
  let introStartX = 0;
  let introStartTarget = 0;
  let introMaxPullPx = 1;
  let introRaf = 0;
  let introScreenRect = { width: 1, height: 1 };
  let introTapAnimating = false;
  let introTapAnimStart = 0;
  let introTapAnimFrom = 0;

  function recomputeIntroMetrics() {
    introScreenRect = screen.getBoundingClientRect();
    introMaxPullPx = Math.max(1, introScreenRect.width);
  }

  function applyIntro(p) {
    const pullPx = p * introMaxPullPx;
    const preMax = Math.min(INTRO_PRE_PX, Math.max(0, introMaxPullPx - 1));
    const pre = Math.min(preMax, pullPx);
    const pStrip =
      pullPx <= preMax ? 0 : (pullPx - preMax) / Math.max(1, introMaxPullPx - preMax);

    introScreen.style.setProperty("--intro-p", String(clamp(pStrip, 0, 1)));
    introScreen.style.setProperty("--intro-pre", `${pre}px`);

    const c = introCatcher.getBoundingClientRect();
    const ballOffsetPx = 45;
    const introBallShiftLeftPx = 88;

    if (introOuterPath && introMidPath && introInnerPath && c.width > 4 && c.height > 4) {
      // Left-edge isosceles, shared apex. Blue: base = full viewBox height (0..100) → full screen height; 90° at apex.
      const midY = 50;
      const DEG = Math.PI / 180;
      const wInner = 50; // half of vertical base 0..100
      const dApex = wInner / Math.tan((90 * DEG) / 2); // = 50 for 90°
      const wMid = dApex * Math.tan((100 * DEG) / 2);
      const wOuter = dApex * Math.tan((110 * DEG) / 2);

      const rViewOuter = (roundingPxOuter / Math.max(1, c.height)) * 100;
      const rViewMid = (roundingPxMid / Math.max(1, c.height)) * 100;
      const rViewInner = (roundingPxInner / Math.max(1, c.height)) * 100;

      introOuterPath.removeAttribute("transform");
      introMidPath.removeAttribute("transform");
      introInnerPath.removeAttribute("transform");

      introOuterPath.setAttribute(
        "d",
        buildLeftEdgeTrianglePath(midY - wOuter, midY + wOuter, dApex, midY, rViewOuter)
      );
      introMidPath.setAttribute(
        "d",
        buildLeftEdgeTrianglePath(midY - wMid, midY + wMid, dApex, midY, rViewMid)
      );
      introInnerPath.setAttribute(
        "d",
        buildLeftEdgeTrianglePath(0, 100, dApex, midY, rViewInner)
      );

      const apexXPx = (dApex / 100) * c.width;
      introHandle.style.left = `${(apexXPx + ballOffsetPx - introBallShiftLeftPx).toFixed(2)}px`;
      introHandle.style.top = `${(c.height / 2).toFixed(2)}px`;
    }
  }

  function ensureIntroRaf() {
    if (introRaf) return;
    const step = () => {
      if (introTapAnimating) {
        const u = Math.min(1, (performance.now() - introTapAnimStart) / INTRO_TAP_MS);
        const ease = 1 - (1 - u) ** 3;
        introNow = introTapAnimFrom + (1 - introTapAnimFrom) * ease;
        if (u >= 1) {
          introNow = 1;
          introTapAnimating = false;
        }
      } else {
        const k = introDragging ? 0.28 : 0.34;
        introNow = introNow + (introTarget - introNow) * k;
        if (Math.abs(introTarget - introNow) < 0.002) introNow = introTarget;
      }
      applyIntro(introNow);

      if (introTarget >= 0.999 && introNow >= 0.999) {
        introRaf = 0;
        introTapAnimating = false;
        introScreen.classList.add("is-hidden");
        startScreen.classList.remove("is-hidden");
        startScreen.classList.remove("start-screen--revealing");
        startScreen.style.removeProperty("--intro-reveal");
        setActiveStartSlide("intro");
        return;
      }

      if (!introDragging && introTarget === introNow && !introTapAnimating) {
        introRaf = 0;
        return;
      }

      introRaf = requestAnimationFrame(step);
    };
    introRaf = requestAnimationFrame(step);
  }

  function setIntroTarget(p) {
    introTarget = clamp(p, 0, 1);
    ensureIntroRaf();
  }

  introHandle.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary) return;
    recomputeIntroMetrics();
    introTapAnimating = false;
    introDragging = true;
    introPointerMoved = false;
    introStartX = e.clientX;
    introStartTarget = introTarget;
    introHandle.setPointerCapture(e.pointerId);

    introScreen.classList.add("is-dragging");
    ensureIntroRaf();
  });

  introHandle.addEventListener("pointermove", (e) => {
    if (!introDragging) return;
    const dx = e.clientX - introStartX;
    if (Math.abs(dx) > 8) introPointerMoved = true;
    const p = introStartTarget + dx / introMaxPullPx;
    setIntroTarget(p);
  });

  introHandle.addEventListener("pointerup", () => {
    if (!introDragging) return;
    introDragging = false;
    introScreen.classList.remove("is-dragging");

    if (!introPointerMoved) {
      introTapAnimating = true;
      introTapAnimStart = performance.now();
      introTapAnimFrom = introNow;
      setIntroTarget(1);
      return;
    }
    if (introTarget >= 0.86) setIntroTarget(1);
    else setIntroTarget(0);
  });

  introHandle.addEventListener("pointercancel", () => {
    if (!introDragging) return;
    introDragging = false;
    introScreen.classList.remove("is-dragging");
    setIntroTarget(0);
  });

  window.addEventListener("resize", () => {
    updateTriangleAndBall(state.norm);
    recomputeIntroMetrics();
    if (!introScreen.classList.contains("is-hidden")) applyIntro(introNow);
  });

  // init
  setLives(LIVES_MAX);
  setScore(0);
  resetCatcher();

  recomputeIntroMetrics();
  introScreen.classList.remove("is-hidden");
  startScreen.classList.add("is-hidden");
  startScreen.classList.remove("start-screen--revealing");
  startScreen.style.removeProperty("--intro-reveal");
  introNow = 0;
  introTarget = 0;
  applyIntro(0);
  renderStartPrizes();
  setActiveStartSlide("intro");
  ensureIntroRaf();

  startBtn.addEventListener("click", () => {
    if (introTarget < 0.98) return;
    document.querySelector(".overlay")?.remove();
    resetGame();
    hideStart();
    start();
  });

  rulesBtn?.addEventListener("click", () => {
    setActiveStartSlide("rules");
  });
})();

