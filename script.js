window.addEventListener('DOMContentLoaded', () => {
  window.gameManager = new GameManager();
});

// Anti Doppel-Trigger (pointerdown + click)
function bindTap(el, handler) {
  let locked = false;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (locked) return;
    locked = true;
    try { handler(e); } finally {
      setTimeout(() => { locked = false; }, 180);
    }
  });

  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

class GameManager {
  constructor() {
    this.completedLevels = this.loadCompletedLevels();
    this.currentLevel = null;

    this.roundCorrect = 0;
    this.timeSumMs = 0;

    this._t0 = 0;
    this._timing = false;

    this._confetti = null;
    this._confettiStopTimer = 0;

    this.initEvents();
    this.applyDeviceTuning();
    this.updateLevels();
    this.showScreen('start-screen');
  }

  isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 || window.matchMedia?.('(pointer: coarse)')?.matches;
  }

  applyDeviceTuning() {
    const touch = this.isTouchDevice();
    const base = { 1: 4000, 2: 3500, 3: 15000, 4: 20000 };
    const factor = touch ? 1.0 : 1.0;

    document.querySelectorAll('.level-btn').forEach(btn => {
      const level = parseInt(btn.dataset.level, 10);
      const tuned = Math.round((base[level] ?? parseInt(btn.dataset.maxTime, 10)) * factor);
      btn.dataset.maxTime = String(tuned);
    });
  }

  loadCompletedLevels() {
    try {
      const raw = sessionStorage.getItem('completedLevels');
      const arr = JSON.parse(raw || '[]');
      if (!Array.isArray(arr)) return [];
      return arr.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
    } catch {
      return [];
    }
  }

  saveCompletedLevels() {
    sessionStorage.setItem('completedLevels', JSON.stringify(this.completedLevels));
  }

  initEvents() {
    bindTap(document.getElementById('start-btn'), () => this.showScreen('menu'));

    document.querySelectorAll('.level-btn').forEach(btn => {
      bindTap(btn, () => {
        const level = parseInt(btn.dataset.level, 10);
        if (btn.disabled || btn.classList.contains('locked')) {
          alert(`Bitte bestehe erst Level ${level - 1}.`);
          return;
        }
        this.showLevelPrep(level);
      });
    });

    bindTap(document.getElementById('menu-back-btn'), () => this.showScreen('start-screen'));
    bindTap(document.getElementById('back-to-menu'), () => this.showScreen('menu'));
    bindTap(document.getElementById('start-level'), () => this.startCountdown());

    bindTap(document.getElementById('menu-btn'), () => {
      this.hideEndMenu();
      this.showScreen('menu');
    });

    bindTap(document.getElementById('inlevel-back-btn'), () => {
      this.timingStop();
      this.showScreen('menu');
    });

    bindTap(document.getElementById('retry-btn'), () => this.showLevelPrep(this.currentLevel));
    bindTap(document.getElementById('retry-btn-lose'), () => this.showLevelPrep(this.currentLevel));

    bindTap(document.getElementById('next-level-btn'), () => {
      const next = Math.min(4, this.currentLevel + 1);
      this.showLevelPrep(next);
    });

    bindTap(document.getElementById('end-restart-btn'), () => {
      this.hideEndMenu();
      this.showLevelPrep(1);
    });

    bindTap(document.getElementById('end-to-menu-btn'), () => {
      this.hideEndMenu();
      this.showScreen('menu');
    });

    bindTap(document.getElementById('end-reset-progress-btn'), () => {
      sessionStorage.removeItem('completedLevels');
      this.completedLevels = [];
      this.updateLevels();
      this.hideEndMenu();
      this.showScreen('menu');
    });

    window.addEventListener('resize', () => {
      if (this._confetti) this.startConfetti(true);
    });
  }

  updateLevels() {
    document.querySelectorAll('.level-btn').forEach(btn => {
      const level = parseInt(btn.dataset.level, 10);
      const unlocked = (level === 1) || this.completedLevels.includes(level - 1);

      btn.classList.toggle('unlocked', unlocked);
      btn.classList.toggle('locked', !unlocked);

      btn.disabled = !unlocked;
      btn.setAttribute('aria-disabled', String(!unlocked));
    });
  }

  showLevelPrep(level) {
    this.currentLevel = level;

    const btn = document.querySelector(`[data-level="${level}"]`);
    document.getElementById('prep-title').textContent = btn.textContent.trim();
    document.getElementById('prep-desc').innerHTML = btn.dataset.desc;

    const ms = parseInt(btn.dataset.maxTime, 10);
    document.getElementById('prep-max-time').textContent = `Maximalzeit: ${ms} ms`;

    this.showScreen('level-prep');
  }

  startCountdown() {
    this.hideEndMenu();
    this.showScreen('countdown');

    const display = document.getElementById('countdown-display');
    const text = document.getElementById('countdown-text');
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;

    text.textContent = '';

    const setAnim = (cls) => {
      display.classList.remove('step', 'morph', 'go');
      display.style.animation = 'none';
      void display.offsetHeight;
      display.style.animation = '';
      if (cls) display.classList.add(cls);
    };

    const playStep = () => {
      const val = steps[i];
      display.textContent = val;

      if (val === '3') setAnim('step');
      else if (val === '2' || val === '1') setAnim('morph');
      else if (val === 'GO!') setAnim('go');

      if (val === 'GO!') {
        setTimeout(() => this.startGame(), 520);
        return;
      }

      i++;
      setTimeout(playStep, 950);
    };

    playStep();
  }

  startGame() {
    this.roundCorrect = 0;
    this.timeSumMs = 0;
    this._timing = false;
    this._t0 = 0;

    document.getElementById('level-name').textContent =
      document.querySelector(`[data-level="${this.currentLevel}"]`).textContent.trim();

    document.getElementById('round').textContent = '1';

    const container = document.getElementById('game-area');
    container.innerHTML = '';

    try {
      switch (this.currentLevel) {
        case 1: new ReactionField(container).start(); break;
        case 2: new ColorGame(container).start(); break;
        case 3: new SimonSequence(container).start(); break;
        case 4: new MemoryGame(container).start(); break;
      }
    } catch (e) {
      alert('Fehler beim Starten des Levels. Bitte Seite neu laden.');
      console.error(e);
      this.showScreen('menu');
      return;
    }

    this.showScreen('game-screen');
  }

  timingStart() {
    if (this._timing) return;
    this._timing = true;
    this._t0 = performance.now();
  }

  timingStop() {
    if (!this._timing) return;
    this.timeSumMs += (performance.now() - this._t0);
    this._timing = false;
  }

  markRound(correct) {
    if (correct) this.roundCorrect++;
  }

  finishLevel() {
    this.timingStop();

    const maxMs = parseInt(document.querySelector(`[data-level="${this.currentLevel}"]`).dataset.maxTime, 10);
    const total = Math.round(this.timeSumMs);
    const passed = (total <= maxMs) && (this.roundCorrect === 5);

    if (passed && !this.completedLevels.includes(this.currentLevel)) {
      this.completedLevels.push(this.currentLevel);
      this.completedLevels.sort((a, b) => a - b);
      this.saveCompletedLevels();
      this.updateLevels();
    }

    document.getElementById('results-stats').textContent =
      `Zeit: ${total} ms / ${maxMs} ms\nKorrekt: ${this.roundCorrect}/5`;

    const statusEl = document.getElementById('level-status');
    statusEl.textContent = passed ? 'BESTANDEN' : 'NICHT BESTANDEN';
    statusEl.style.color = passed ? '#4caf50' : '#f44336';
    statusEl.style.background = passed ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';

    document.getElementById('results-win-buttons').style.display = passed ? 'flex' : 'none';
    document.getElementById('results-lose-buttons').style.display = passed ? 'none' : 'flex';
    document.getElementById('next-level-btn').style.display = (passed && this.currentLevel < 4) ? 'inline-block' : 'none';

    this.showScreen('results-screen');

    if (passed && this.currentLevel === 4) this.showEndMenu();
    else this.hideEndMenu();
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('countdown').classList.remove('active');

    if (screenId === 'countdown') document.getElementById('countdown').classList.add('active');
    else document.getElementById(screenId).classList.add('active');

    const title = document.getElementById('main-title');
    if (screenId === 'start-screen') title.classList.remove('hidden');
    else title.classList.add('hidden');

    const backBtn = document.getElementById('inlevel-back-btn');
    if (screenId === 'game-screen') backBtn.classList.add('visible');
    else backBtn.classList.remove('visible');
  }

  showEndMenu() {
    document.getElementById('results-stats').style.display = 'none';
    document.getElementById('level-status').style.display = 'none';
    document.getElementById('results-win-buttons').style.display = 'none';
    document.getElementById('results-lose-buttons').style.display = 'none';
    document.getElementById('menu-btn').style.display = 'none';

    // "Glückwunsch!" entfernen: Titel einfach leer lassen
    document.getElementById('results-title').textContent = '';

    document.getElementById('end-menu').style.display = 'block';

    // Konfetti deutlich länger laufen lassen
    this.startConfetti(false);
    clearTimeout(this._confettiStopTimer);
    this._confettiStopTimer = setTimeout(() => this.stopConfetti(false), 12000);
  }

  hideEndMenu() {
    const end = document.getElementById('end-menu');
    if (end) end.style.display = 'none';

    clearTimeout(this._confettiStopTimer);
    this.stopConfetti(true);

    document.getElementById('results-stats').style.display = '';
    document.getElementById('level-status').style.display = '';
    document.getElementById('menu-btn').style.display = '';
  }

  startConfetti(keepExistingPieces) {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#ffd700', '#00d4aa', '#667eea', '#f5576c', '#ffffff', '#9b59b6'];
    const w = rect.width, h = rect.height;

    if (!keepExistingPieces) this.stopConfetti(false);

    const pieces = keepExistingPieces && this._confetti?.pieces
      ? this._confetti.pieces
      : Array.from({ length: 240 }).map(() => ({
          x: Math.random() * w,
          y: -20 - Math.random() * h * 0.6,
          vx: (Math.random() - 0.5) * 1.7,
          vy: 2.0 + Math.random() * 4.2,
          r: 3 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.22,
          color: colors[Math.floor(Math.random() * colors.length)],
          settled: false
        }));

    this._confetti = { running: true, pieces, raf: 0, w, h };

    const step = () => {
      if (!this._confetti || !this._confetti.running) return;

      ctx.clearRect(0, 0, w, h);

      for (const p of this._confetti.pieces) {
        if (!p.settled) {
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          p.vx *= 0.996;

          if (p.y >= h - 6) {
            p.y = h - 6;
            p.vx = 0;
            p.vy = 0;
            p.vr = 0;
            p.settled = true;
          }

          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        ctx.restore();
      }

      this._confetti.raf = requestAnimationFrame(step);
    };

    step();
  }

  stopConfetti(clear = false) {
    const canvas = document.getElementById('confetti-canvas');

    if (this._confetti?.raf) cancelAnimationFrame(this._confetti.raf);
    if (this._confetti) this._confetti.running = false;
    this._confetti = null;

    if (clear && canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

/* ---------------- Level 1 ---------------- */
class ReactionField {
  constructor(container) { this.container = container; this.round = 0; }
  start() { this.nextRound(); }

  nextRound() {
    this.round++;
    document.getElementById('round').textContent = this.round;

    this.container.innerHTML = '';

    const area = document.createElement('div');
    area.id = 'reaction-area';
    this.container.appendChild(area);

    const field = document.createElement('div');
    field.id = 'target-field';
    area.appendChild(field);

    const msg = document.createElement('div');
    msg.id = 'wait-message';
    msg.textContent = 'Warte auf das Feld...';
    area.appendChild(msg);

    const delay = 450 + Math.random() * 900;

    setTimeout(() => {
      msg.textContent = 'KLICKE!';
      field.style.display = 'block';
      field.classList.add('active');

      const rect = area.getBoundingClientRect();
      const size = 85, pad = 8, topSafe = 120;
      const maxX = Math.max(0, rect.width - size - pad);
      const maxY = Math.max(0, rect.height - size - pad - topSafe);

      field.style.left = (pad + Math.random() * maxX) + 'px';
      field.style.top = (topSafe + Math.random() * maxY) + 'px';

      gameManager.timingStart();

      const onHit = () => {
        field.onpointerdown = null;
        gameManager.timingStop();
        gameManager.markRound(true);

        if (this.round < 5) this.nextRound();
        else gameManager.finishLevel();
      };

      field.onpointerdown = (e) => { e.preventDefault(); onHit(); };
    }, delay);
  }
}

/* ---------------- Level 2 ---------------- */
class ColorGame {
  constructor(container) {
    this.container = container;
    this.round = 0;
    this.words = ['GELB', 'ROT', 'BLAU', 'GRÜN', 'LILA', 'ORANGE'];
    this.colors = ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];
    this._answered = false;
  }

  start() { this.nextRound(); }

  nextRound() {
    this.round++;
    document.getElementById('round').textContent = this.round;

    this._answered = false;

    const n = this.words.length;
    const wordIdx = Math.floor(Math.random() * n);
    const colorIdx = Math.floor(Math.random() * n);
    const match = (wordIdx === colorIdx);

    this.container.innerHTML = `
      <div class="color-wrap">
        <div class="stroop-word" style="color:${this.colors[colorIdx]}">${this.words[wordIdx]}</div>
        <div class="stroop-buttons">
          <button class="stroop-btn wahr" type="button">WAHR</button>
          <button class="stroop-btn falsch" type="button">FALSCH</button>
        </div>
      </div>
    `;

    const btnT = this.container.querySelector('.stroop-btn.wahr');
    const btnF = this.container.querySelector('.stroop-btn.falsch');

    gameManager.timingStart();

    const answer = (ansTrue) => {
      if (this._answered) return;
      this._answered = true;

      btnT.disabled = true;
      btnF.disabled = true;

      gameManager.timingStop();
      gameManager.markRound(ansTrue === match);

      if (this.round < 5) setTimeout(() => this.nextRound(), 180);
      else gameManager.finishLevel();
    };

    btnT.onpointerdown = (e) => { e.preventDefault(); answer(true); };
    btnF.onpointerdown = (e) => { e.preventDefault(); answer(false); };
  }
}

/* ---------------- Level 3 (Simon) ---------------- */
class SimonSequence {
  constructor(container) {
    this.container = container;
    this.sequence = [];
    this.playerSeq = [];
    this.round = 0;
    this.locked = false;
    this.failedThisRound = false;
    this.playToken = 0;
  }

  start() {
    this.container.innerHTML = `
      <div class="simon-wrapper">
        <div id="simon-grid"></div>
        <p id="simon-status"></p>
      </div>
    `;

    const grid = document.getElementById('simon-grid');
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

    for (let i = 0; i < 4; i++) {
      const panel = document.createElement('div');
      panel.className = 'simon-panel';
      panel.style.background = colors[i];

      panel.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.playerClick(i);
      });

      grid.appendChild(panel);
    }

    this.nextRound();
  }

  setStatus(text) {
    const el = document.getElementById('simon-status');
    if (el) el.textContent = text;
  }

  nextRound() {
    this.round++;
    document.getElementById('round').textContent = this.round;

    this.playerSeq = [];
    this.failedThisRound = false;

    const lenByRound = [3, 4, 5, 6, 7];
    const len = lenByRound[this.round - 1] ?? 5;

    this.sequence = [];
    let prev = -1;
    for (let i = 0; i < len; i++) {
      let v = Math.floor(Math.random() * 4);
      while (v === prev) v = Math.floor(Math.random() * 4);
      this.sequence.push(v);
      prev = v;
    }

    this.setStatus('MERKEN ...');
    setTimeout(() => this.playSequence(), 350);
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async flashPanel(id, onMs) {
    const panel = document.querySelectorAll('.simon-panel')[id];
    panel.classList.add('flash');
    await this.sleep(onMs);
    panel.classList.remove('flash');
  }

  async playSequence() {
    this.locked = true;
    const onMs = 220;
    const offMs = 160;

    this.playToken++;
    const token = this.playToken;

    this.playerSeq = [];

    for (let i = 0; i < this.sequence.length; i++) {
      if (token !== this.playToken) return;
      await this.flashPanel(this.sequence[i], onMs);
      await this.sleep(offMs);
    }

    this.locked = false;
    this.setStatus('DU BIST DRAN!');
    gameManager.timingStart();
  }

  async flashPanelQuick(id) {
    const panel = document.querySelectorAll('.simon-panel')[id];
    panel.classList.add('flash');
    await this.sleep(140);
    panel.classList.remove('flash');
  }

  playerClick(id) {
    if (this.locked) return;

    this.playerSeq.push(id);
    this.flashPanelQuick(id);

    const idx = this.playerSeq.length - 1;

    if (this.playerSeq[idx] !== this.sequence[idx]) {
      this.failedThisRound = true;
      this.setStatus('FEHLER! NOCHMAL MERKEN ...');

      this.playerSeq = [];
      gameManager.timingStop();

      setTimeout(() => this.playSequence(), 420);
      return;
    }

    if (this.playerSeq.length === this.sequence.length) {
      gameManager.timingStop();
      gameManager.markRound(!this.failedThisRound);

      if (this.round < 5) {
        this.setStatus('Nächste Runde ...');
        setTimeout(() => this.nextRound(), 520);
      } else {
        this.setStatus('GESCHAFFT!');
        gameManager.finishLevel();
      }
      return;
    }

    const rest = this.sequence.length - this.playerSeq.length;
    this.setStatus('NOCH ' + rest + ' ...');
  }
}

/* ---------------- Level 4 (Memory) ---------------- */
class MemoryGame {
  constructor(container) {
    this.container = container;
    this.round = 0;
    this.locked = false;
    this.first = null;
    this.second = null;
    this.matchedCount = 0;
    this.totalCards = 0;
    this.missedThisRound = false;
    this.queue = Promise.resolve();
  }

  start() { this.nextRound(); }

  enqueue(fn) {
    this.queue = this.queue.then(() => fn()).catch(() => {});
  }

  nextRound() {
    this.round++;
    document.getElementById('round').textContent = this.round;

    this.locked = true;
    this.first = null;
    this.second = null;
    this.matchedCount = 0;
    this.missedThisRound = false;

    const cardsByRound = [6, 6, 8, 8, 12];
    const total = cardsByRound[this.round - 1] ?? 12;
    this.totalCards = total;

    const pairs = total / 2;

    const values = [];
    for (let i = 1; i <= pairs; i++) values.push(i, i);

    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    this.container.innerHTML = `<div class="memory-grid"></div>`;
    const grid = this.container.querySelector('.memory-grid');
    let cols = 4;
    if (total === 6) cols = 3;
    if (total === 8) cols = 4;

    // Auto-fit Karten für kleine Displays (Runden 3-5), ohne Scroll/Überlauf
    const rows = Math.ceil(total / cols);
    const rect = grid.getBoundingClientRect();
    const pad = 12;
    const gap = 10;
    const availW = Math.max(200, rect.width - pad * 2);
    const availH = Math.max(200, rect.height - pad * 2);

    // Breite/Höhe pro Karte (mit Gap), mit sinnvollen Limits
    const w = Math.floor((availW - gap * (cols - 1)) / cols);
    const h = Math.floor((availH - gap * (rows - 1)) / rows);

    const cardW = Math.max(56, Math.min(92, w));
    const cardH = Math.max(50, Math.min(72, h));

    grid.style.setProperty('--mem-card-w', cardW + 'px');
    grid.style.setProperty('--mem-card-h', cardH + 'px');

    grid.style.gridTemplateColumns = `repeat(${cols}, var(--mem-card-w))`;

    const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    values.forEach(v => {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.value = String(v);

      const inner = document.createElement('div');
      inner.className = 'card-inner';

      const back = document.createElement('div');
      back.className = 'card-face card-back';

      const front = document.createElement('div');
      front.className = 'card-face card-front';
      front.textContent = symbols[v - 1] ?? String(v);

      inner.appendChild(back);
      inner.appendChild(front);
      card.appendChild(inner);

      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.enqueue(() => this.flip(card));
      });

      grid.appendChild(card);
    });

    const closedBeforeRevealMs = 220;
    const revealMsByRound = [900, 800, 850, 900, 2600];
    const revealMs = revealMsByRound[this.round - 1] ?? 1000;

    const cards = Array.from(this.container.querySelectorAll('.memory-card'));
    cards.forEach(c => c.classList.remove('revealed', 'preview', 'matched', 'just-matched'));

    setTimeout(() => {
      cards.forEach(c => c.classList.add('revealed', 'preview'));
      setTimeout(() => {
        cards.forEach(c => c.classList.remove('revealed', 'preview'));
        this.locked = false;
        gameManager.timingStart();
      }, revealMs);
    }, closedBeforeRevealMs);
  }

  async flip(card) {
    if (this.locked) return;
    if (card.classList.contains('matched')) return;
    if (card.classList.contains('revealed')) return;

    card.classList.add('revealed');

    if (!this.first) {
      this.first = card;
      return;
    }

    this.second = card;
    this.locked = true;

    const a = this.first.dataset.value;
    const b = this.second.dataset.value;

    if (a === b) {
      this.first.classList.add('matched', 'just-matched');
      this.second.classList.add('matched', 'just-matched');
      this.matchedCount += 2;

      setTimeout(() => {
        this.first?.classList.remove('just-matched');
        this.second?.classList.remove('just-matched');
      }, 200);

      this.resetPick();

      if (this.matchedCount === this.totalCards) {
        gameManager.timingStop();
        gameManager.markRound(!this.missedThisRound);

        if (this.round < 5) setTimeout(() => this.nextRound(), 380);
        else gameManager.finishLevel();
      }
      return;
    }

    this.missedThisRound = true;

    setTimeout(() => {
      this.first.classList.remove('revealed');
      this.second.classList.remove('revealed');
      this.resetPick();
    }, 430);
  }

  resetPick() {
    this.first = null;
    this.second = null;
    this.locked = false;
  }
}