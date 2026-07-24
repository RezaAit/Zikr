(function(){
  'use strict';

  // ---------- i18n helpers ----------
  const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  function toBn(num){
    return String(num).split('').map(ch => /[0-9]/.test(ch) ? bnDigits[ch] : ch).join('');
  }
  // numFmt: use Bangla digits in bn mode, plain Arabic digits in en mode
  function numFmt(num){ return state.lang === 'en' ? String(num) : toBn(num); }
  // Safe dict lookup — works even if i18n.js failed to load
  function _dict(){
    if(!window.I18N) return {};
    return window.I18N[state.lang] || window.I18N.bn || {};
  }
  function t(key){ return _dict()[key] || key; }
  function tf(key, ...args){
    const v = _dict()[key];
    return typeof v === 'function' ? v(...args) : (v || key);
  }

  // applyI18n: update all data-i18n elements in DOM
  function applyI18n(){
    const lang = state.lang;
    const dict = _dict();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if(dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if(dict[key]) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.dataset.i18nAria;
      if(dict[key]) el.setAttribute('aria-label', dict[key]);
    });
    // Quick-access chips: show Bangla or English name
    document.querySelectorAll('.dhikr-chip[data-name]').forEach(chip => {
      if(chip.id === 'pickerChip') return;
      const name = lang === 'en' ? (chip.dataset.nameEn || chip.dataset.name) : chip.dataset.name;
      chip.textContent = name;
    });
    // Lang toggle buttons
    document.querySelectorAll('.lang-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.lang === lang);
    });
    // Title tag
    document.title = dict.app_title || document.title;
  }

  // ---------- State ----------
  const STORAGE_KEY = 'tajbih_counter_state_v4';

  let state = {
    count: 0,
    round: 1,
    target: 33,
    dhikrName: 'সুবহানাল্লাহ',
    dhikrNameEn: 'SubhanAllah',
    isFree: false,
    sessionStart: Date.now(),
    todayTotal: 0,
    todayDate: new Date().toDateString(),
    grandTotal: 0,
    vibrate: true,
    sound: false,
    soundStyle: 'drop',      // drop | wood | bell | click
    autoRound: true,
    celebrate: true,
    theme: 'emerald',        // emerald | midnight | sepia
    dailyGoal: 100,
    streak: 0,
    lastStreakDate: null,    // last date the daily goal was met
    dayLog: {},              // { 'YYYY-MM-DD': totalCount }
    customDhikrs: [],
    history: [],
    milestonesHitThisSession: [], // [25,50] etc, reset on session close
    lang: 'bn',              // 'bn' | 'en'
    countingMode: 'single',  // 'single' | 'batch'
    batchDefaultSize: 20,    // default batch group size (user-configurable)
    isDuaMode: false,        // true when counting a post-salah dua
    duaIndex: -1             // which DUA_LIST item is active (-1 = none)
  };

  function dateKey(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const saved = JSON.parse(raw);
        state = Object.assign(state, saved);
        if(state.todayDate !== new Date().toDateString()){
          state.todayDate = new Date().toDateString();
          state.todayTotal = 0;
        }
      }
    }catch(e){ /* ignore corrupt storage */ }

    // Sanitize batchDefaultSize — must be 1–999, default 20
    if(!state.batchDefaultSize || state.batchDefaultSize < 1 || state.batchDefaultSize > 999){
      state.batchDefaultSize = 20;
    }
    // Clamp to integer
    state.batchDefaultSize = Math.round(state.batchDefaultSize);
  }

  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch(e){ /* storage unavailable */ }
  }

  // ---------- DOM ----------
  const countDisplay = document.getElementById('countDisplay');
  const roundLabel = document.getElementById('roundLabel');
  const targetLabel = document.getElementById('targetLabel');
  const targetInput = document.getElementById('targetInput');
  const targetLabelWrap = document.getElementById('targetLabelWrap');

  // Inline target edit
  targetLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    if(state.isFree) return;
    targetLabel.classList.add('editing');
    targetLabel.style.display = 'none';
    targetInput.value = state.target;
    targetInput.classList.add('show');
    targetInput.focus();
    targetInput.select();
  });

  function commitTargetEdit(){
    let val = parseInt(targetInput.value, 10);
    if(isNaN(val) || val < 1) val = state.target;
    if(val > 9999) val = 9999;
    state.target = val;
    // NOTE: batchDefaultSize is NEVER changed by target edit
    targetInput.classList.remove('show');
    targetLabel.classList.remove('editing');
    targetLabel.style.display = '';
    save();
    render();
  }

  targetInput.addEventListener('blur', commitTargetEdit);
  targetInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if(e.key === 'Enter') targetInput.blur();
    if(e.key === 'Escape'){ targetInput.value = state.target; targetInput.blur(); }
  });
  // prevent tap-zone from firing when editing target
  targetInput.addEventListener('click', (e) => e.stopPropagation());
  targetLabelWrap.addEventListener('click', (e) => e.stopPropagation());
  const activeDhikrName = document.getElementById('activeDhikrName');
  const ringFill = document.getElementById('ringFill');
  const milestoneDotsSvg = document.getElementById('milestoneDots');
  const tapZone = document.getElementById('tapZone');
  const celebrateBurst = document.getElementById('celebrateBurst');
  const milestoneToast = document.getElementById('milestoneToast');
  const todayTotalEl = document.getElementById('todayTotal');
  const grandTotalEl = document.getElementById('grandTotal');
  const dhikrChips = document.querySelectorAll('.dhikr-chip');
  const pickerChip = document.getElementById('pickerChip');
  const streakText = document.getElementById('streakText');
  const dailyGoalText = document.getElementById('dailyGoalText');

  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');
  const vibrateBtn = document.getElementById('vibrateBtn');

  const historyBtn = document.getElementById('historyBtn');
  const statsBtn = document.getElementById('statsBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const historySheet = document.getElementById('historySheet');
  const statsSheet = document.getElementById('statsSheet');
  const settingsSheet = document.getElementById('settingsSheet');
  const pickerSheet = document.getElementById('pickerSheet');
  const contactSheet = document.getElementById('contactSheet');
  const openContactBtn = document.getElementById('openContactBtn');
  const footerContactBtn = document.getElementById('footerContactBtn');

  // Dua modal
  const duaModalBtn = document.getElementById('duaModalBtn');
  const duaModalOverlay = document.getElementById('duaModalOverlay');
  const duaModalClose = document.getElementById('duaModalClose');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const pickerTabs = document.querySelectorAll('.picker-tab');
  const pickerPaneList = document.getElementById('pickerPaneList');
  const pickerPaneCustom = document.getElementById('pickerPaneCustom');
  const zikirSearchInput = document.getElementById('zikirSearchInput');
  const zikirResults = document.getElementById('zikirResults');

  const vibrateToggle = document.getElementById('vibrateToggle');
  const soundToggle = document.getElementById('soundToggle');
  const soundStyleRow = document.getElementById('soundStyleRow');
  const soundChips = document.querySelectorAll('.sound-chip');
  const autoRoundToggle = document.getElementById('autoRoundToggle');
  const celebrateToggle = document.getElementById('celebrateToggle');
  const dailyGoalInput = document.getElementById('dailyGoalInput');
  const themeChips = document.querySelectorAll('.theme-chip:not(.lang-chip)');

  const customNameInput = document.getElementById('customNameInput');
  const customTargetInputModal = document.getElementById('customTargetInputModal');
  const customSaveBtn = document.getElementById('customSaveBtn');

  // Batch mode DOM
  const modeSingleBtn = document.getElementById('modeSingle');
  const modeBatchBtn = document.getElementById('modeBatch');
  const batchPanel = document.getElementById('batchPanel');
  const batchSizeBadge = document.getElementById('batchSizeBadge');

  const RING_CIRC = 2 * Math.PI * 108;
  const RING_R = 108;
  const RING_CX = 120;
  const RING_CY = 120;

  let undoStack = [];
  let audioCtx = null;

  // ============================================================
  // Sound engine — all sounds are synthesized with Web Audio,
  // no external audio files needed.
  // ============================================================
  function getAudioCtx(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playDrop(){
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);

    // a faint second ripple for realism
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1800, t + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    gain2.gain.setValueAtTime(0.0001, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.06, t + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t + 0.05);
    osc2.stop(t + 0.22);
  }

  function playWood(){
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i = 0; i < bufferSize; i++){
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1400;
    bandpass.Q.value = 1.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(bandpass).connect(gain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.07);

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.05);
    oGain.gain.setValueAtTime(0.18, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(oGain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  function playBell(){
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const freqs = [988, 1480, 2960];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const peak = i === 0 ? 0.18 : 0.05;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 - i * 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  function playClick(){
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  function doSound(){
    if(!state.sound) return;
    try{
      switch(state.soundStyle){
        case 'wood': playWood(); break;
        case 'bell': playBell(); break;
        case 'click': playClick(); break;
        default: playDrop();
      }
    }catch(e){ /* audio unavailable */ }
  }

  function doVibrate(ms){
    if(state.vibrate && navigator.vibrate){
      navigator.vibrate(ms);
    }
  }

  // ============================================================
  // Theme
  // ============================================================
  function applyTheme(){
    document.documentElement.setAttribute('data-theme', state.theme);
    themeChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.theme === state.theme);
    });
  }

  // ============================================================
  // Daily goal & streak
  // ============================================================
  function recordDayProgress(amount){
    const key = dateKey(new Date());
    state.dayLog[key] = (state.dayLog[key] || 0) + amount;
    // prune old entries beyond 60 days to keep storage light
    const keys = Object.keys(state.dayLog).sort();
    if(keys.length > 60){
      keys.slice(0, keys.length - 60).forEach(k => delete state.dayLog[k]);
    }
    checkStreak();
  }

  function checkStreak(){
    const todayKey = dateKey(new Date());
    const todayCount = state.dayLog[todayKey] || 0;
    if(todayCount >= state.dailyGoal && state.lastStreakDate !== todayKey){
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yestKey = dateKey(yest);
      if(state.lastStreakDate === yestKey){
        state.streak += 1;
      }else{
        state.streak = 1;
      }
      state.lastStreakDate = todayKey;
    }
  }

  function renderStreakBar(){
    streakText.textContent = tf('streak_text', numFmt(state.streak));
    const todayKey = dateKey(new Date());
    const todayCount = state.dayLog[todayKey] || 0;
    const met = todayCount >= state.dailyGoal;
    dailyGoalText.textContent = tf('daily_goal_text', numFmt(Math.min(todayCount, state.dailyGoal)), numFmt(state.dailyGoal), met);
    dailyGoalText.classList.toggle('goal-met', met);
  }

  // ============================================================
  // Milestone dots + celebration
  // ============================================================
  function buildMilestoneDots(){
    milestoneDotsSvg.innerHTML = '';
    [25, 50, 75].forEach(pct => {
      const angle = (pct / 100) * 2 * Math.PI;
      const x = RING_CX + RING_R * Math.cos(angle);
      const y = RING_CY + RING_R * Math.sin(angle);
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x.toFixed(1));
      c.setAttribute('cy', y.toFixed(1));
      c.setAttribute('r', '4');
      c.dataset.pct = pct;
      milestoneDotsSvg.appendChild(c);
    });
  }

  function updateMilestoneDots(progressPct){
    milestoneDotsSvg.querySelectorAll('circle').forEach(c => {
      const pct = parseInt(c.dataset.pct, 10);
      c.classList.toggle('passed', progressPct >= pct);
    });
  }

  function checkMilestone(){
    if(state.isFree || state.target <= 0) return;
    const pct = Math.floor((state.count / state.target) * 100);
    const checkpoints = [25, 50, 75, 100];
    for(const cp of checkpoints){
      if(pct >= cp && !state.milestonesHitThisSession.includes(cp)){
        state.milestonesHitThisSession.push(cp);
        triggerCelebration(cp);
      }
    }
  }

  function triggerCelebration(pct){
    const label = pct === 100 ? t('milestone_complete') : tf('milestone_pct', numFmt(pct));
    showToast(label);
    if(state.celebrate){
      fireSparkBurst();
      tapZone.classList.remove('pulse');
      void tapZone.offsetWidth;
      tapZone.classList.add('pulse');
    }
    doVibrate(pct === 100 ? [30,50,30,50,30] : [20,30,20]);
  }

  function fireSparkBurst(){
    celebrateBurst.innerHTML = '';
    const sparkCount = 14;
    for(let i = 0; i < sparkCount; i++){
      const s = document.createElement('span');
      s.className = 'spark';
      const angle = (i / sparkCount) * 2 * Math.PI + Math.random() * 0.3;
      const dist = 70 + Math.random() * 40;
      s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      celebrateBurst.appendChild(s);
    }
    celebrateBurst.classList.remove('fire');
    void celebrateBurst.offsetWidth;
    celebrateBurst.classList.add('fire');
  }

  let toastTimer = null;
  function showToast(text){
    milestoneToast.textContent = text;
    milestoneToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => milestoneToast.classList.remove('show'), 1800);
  }

  // ============================================================
  // Rendering
  // ============================================================
  function render(){
    // Batch mode: count accumulates, so display directly
    countDisplay.textContent = numFmt(state.count);
    roundLabel.textContent = state.isFree ? t('free_count_label') : tf('round_label', numFmt(state.round));

    const isBatch = state.countingMode === 'batch';
    if(isBatch){
      // In batch mode target label shows batch size info, not editable
      targetLabel.textContent = (state.lang === 'en')
        ? `Per tap: ${state.batchDefaultSize}`
        : `প্রতি ট্যাপ: ${numFmt(state.batchDefaultSize)}`;
      targetLabel.style.cursor = 'default';
      // ring shows progress within current batch cycle (count mod batchDefaultSize)
      const cycleProgress = state.batchDefaultSize > 0
        ? (state.count % state.batchDefaultSize) / state.batchDefaultSize
        : 0;
      const offset = RING_CIRC * (1 - cycleProgress);
      ringFill.style.strokeDasharray = RING_CIRC;
      ringFill.style.strokeDashoffset = offset;
      ringFill.style.opacity = 1;
      milestoneDotsSvg.style.opacity = 0;
    } else {
      const tgtText = (!state.isFree && state.target > 0)
        ? tf('target_value_label', numFmt(state.target))
        : t('no_target_label');
      targetLabel.textContent = tgtText + (!state.isFree && state.target > 0 ? ' ✎' : '');
      targetLabel.style.cursor = (!state.isFree && state.target > 0) ? 'pointer' : 'default';
      let progress = (!state.isFree && state.target > 0) ? Math.min(state.count / state.target, 1) : 0;
      const offset = RING_CIRC * (1 - progress);
      ringFill.style.strokeDasharray = RING_CIRC;
      ringFill.style.strokeDashoffset = offset;
      ringFill.style.opacity = state.isFree ? 0.25 : 1;
      milestoneDotsSvg.style.opacity = state.isFree ? 0 : 1;
      updateMilestoneDots(progress * 100);
    }

    vibrateBtn.classList.toggle('active-state', state.vibrate);

    dhikrChips.forEach(chip => {
      let matches = false;
      if(chip.id === 'freeChip'){
        matches = state.isFree;
      }else if(chip.id === 'pickerChip'){
        matches = false;
      }else{
        matches = !state.isFree && chip.dataset.name === state.dhikrName && parseInt(chip.dataset.target,10) === state.target;
      }
      chip.classList.toggle('active', matches);
    });

    renderStreakBar();
  }

  // ============================================================
  // History logging
  // ============================================================
  function addHistoryEntry(count){
    if(count <= 0) return;
    state.history.unshift({
      name: state.dhikrName,
      nameEn: state.dhikrNameEn || state.dhikrName,
      count: count,
      target: state.isFree ? 0 : state.target,
      isFree: state.isFree,
      mode: state.countingMode,   // 'single' | 'batch'
      batchSize: state.batchDefaultSize,
      startedAt: state.sessionStart,
      endedAt: Date.now()
    });
    if(state.history.length > 300) state.history.pop();
  }

  function logCompletedRound(){
    addHistoryEntry(state.target);
    state.sessionStart = Date.now();
  }

  function closeOutCurrentSession(){
    if(state.count > 0){
      addHistoryEntry(state.count);
    }
    state.sessionStart = Date.now();
    state.milestonesHitThisSession = [];
  }

  // ============================================================
  // Actions
  // ============================================================
  function pushUndo(){
    undoStack.push({
      count: state.count,
      round: state.round,
      todayTotal: state.todayTotal,
      grandTotal: state.grandTotal,
      sessionStart: state.sessionStart,
      historyLen: state.history.length,
      milestonesHitThisSession: state.milestonesHitThisSession.slice(),
      dayKey: dateKey(new Date()),
      dayLogValue: state.dayLog[dateKey(new Date())] || 0
    });
    if(undoStack.length > 50) undoStack.shift();
  }

  function increment(){
    pushUndo();
    state.count++;
    state.todayTotal++;
    state.grandTotal++;
    recordDayProgress(1);

    doVibrate(15);
    doSound();

    if(!state.isFree && state.autoRound && state.target > 0 && state.count >= state.target){
      logCompletedRound();
      doVibrate([20,40,20]);
      state.round++;
      state.count = 0;
      state.milestonesHitThisSession = [];
    }else{
      checkMilestone();
    }

    save();
    render();
  }

  function undo(){
    const prev = undoStack.pop();
    if(!prev) return;
    state.count = prev.count;
    state.round = prev.round;
    state.todayTotal = prev.todayTotal;
    state.grandTotal = prev.grandTotal;
    state.sessionStart = prev.sessionStart;
    state.milestonesHitThisSession = prev.milestonesHitThisSession;
    state.dayLog[prev.dayKey] = prev.dayLogValue;
    while(state.history.length > prev.historyLen) state.history.shift();
    doVibrate(10);
    save();
    render();
  }

  function resetCurrent(){
    closeOutCurrentSession();
    state.count = 0;
    state.round = 1;
    undoStack = [];
    doVibrate(25);
    save();
    render();
  }

  function selectDhikr(name, target, isFree, nameEn, keepDuaMode){
    closeOutCurrentSession();
    state.dhikrName = name;
    state.dhikrNameEn = nameEn || name;
    state.target = target;
    state.isFree = !!isFree;
    if(!keepDuaMode){
      state.isDuaMode = false;
      state.duaIndex = -1;
    }
    state.count = 0;
    state.round = 1;
    undoStack = [];
    save();
    render();
  }

  // ============================================================
  // Batch mode helpers
  // ============================================================
  function renderBatchBadge(){
    if(batchSizeBadge) batchSizeBadge.textContent = numFmt(state.batchDefaultSize);
  }

  function applyMode(){
    const isBatch = state.countingMode === 'batch';
    modeSingleBtn.classList.toggle('active', !isBatch);
    modeBatchBtn.classList.toggle('active', isBatch);
    batchPanel.style.display = isBatch ? '' : 'none';
    tapZone.dataset.mode = state.countingMode;
    renderBatchBadge();
  }

  function commitBatch(){
    const amount = state.batchDefaultSize;
    if(amount <= 0) return;
    pushUndo();

    // Accumulate count (never reset in batch mode — user sees running total)
    state.count += amount;
    state.todayTotal += amount;
    state.grandTotal += amount;
    recordDayProgress(amount);
    doVibrate([15, 30, 15]);
    doSound();

    // In batch mode every tap = 1 round (round tracks hand-counted cycles)
    if(!state.isFree){
      logCompletedRound();
      state.round++;
      state.milestonesHitThisSession = [];
    }

    // Dua mode: advance after each batch tap
    if(state.isDuaMode){
      const currentDua = DUA_LIST[state.duaIndex];
      const isFinalDua = state.duaIndex >= DUA_LIST.length - 1;
      const duaName = currentDua ? currentDua.num + ' নং দোয়া' : 'দোয়া';
      showToast(state.lang === 'en'
        ? `✓ Dua ${(state.duaIndex+1)} complete!`
        : `✓ ${duaName} সম্পন্ন!`
      );
      doVibrate([30, 60, 30, 60, 30]);
      if(isFinalDua){
        state.isDuaMode = false;
        state.duaIndex = -1;
        setTimeout(() => showToast(state.lang === 'en'
          ? '🎉 All duas complete! Alhamdulillah'
          : '🎉 সব দোয়া সম্পন্ন! আলহামদুলিল্লাহ'), 1800);
      } else {
        setTimeout(() => startDua(state.duaIndex + 1), 1500);
      }
    }

    save();
    render();
  }

  // ============================================================
  // Event listeners — core
  // ============================================================
  tapZone.addEventListener('click', () => {
    if(state.countingMode === 'batch'){
      commitBatch();
    } else {
      increment();
    }
  });

  modeSingleBtn.addEventListener('click', () => {
    state.countingMode = 'single';
    save();
    applyMode();
    render();
  });

  modeBatchBtn.addEventListener('click', () => {
    state.countingMode = 'batch';
    save();
    applyMode();
    render();
  });
  undoBtn.addEventListener('click', undo);
  resetBtn.addEventListener('click', resetCurrent);
  vibrateBtn.addEventListener('click', () => {
    state.vibrate = !state.vibrate;
    vibrateToggle.checked = state.vibrate;
    save();
    render();
  });

  dhikrChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if(chip.id === 'pickerChip'){
        openPickerSheet();
        return;
      }
      if(chip.id === 'freeChip'){
        selectDhikr('মুক্ত গণনা', 0, true, 'Free Count');
        return;
      }
      selectDhikr(chip.dataset.name, parseInt(chip.dataset.target, 10), false, chip.dataset.nameEn || chip.dataset.name);
    });
  });

  // ---------- Zikir Picker Sheet ----------
  const ZIKIR_LIBRARY = window.ZIKIR_LIBRARY || [];

  function openPickerSheet(){
    switchPickerTab('list');
    zikirSearchInput.value = '';
    renderZikirResults('');
    openSheet(pickerSheet);
    setTimeout(() => zikirSearchInput.focus(), 250);
  }

  function switchPickerTab(tab){
    pickerTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    pickerPaneList.style.display = tab === 'list' ? '' : 'none';
    pickerPaneCustom.style.display = tab === 'custom' ? '' : 'none';
    if(tab === 'custom'){
      customNameInput.value = '';
      customTargetInputModal.value = 100;
      setTimeout(() => customNameInput.focus(), 200);
    }
  }

  pickerTabs.forEach(tab => {
    tab.addEventListener('click', () => switchPickerTab(tab.dataset.tab));
  });

  function renderZikirResults(query){
    const isEn = state.lang === 'en';
    const q = query.trim().toLowerCase();
    const filtered = q === ''
      ? ZIKIR_LIBRARY
      : ZIKIR_LIBRARY.filter(z =>
          z.name.toLowerCase().includes(q) ||
          (z.nameEn||'').toLowerCase().includes(q) ||
          (z.category||'').toLowerCase().includes(q) ||
          (z.categoryEn||'').toLowerCase().includes(q)
        );

    if(filtered.length === 0){
      zikirResults.innerHTML = `<p class="zikir-no-results">${t('no_results')}</p>`;
      return;
    }

    let html = '';
    let lastCategory = null;
    filtered.forEach(z => {
      const cat = isEn ? (z.categoryEn || z.category) : (z.category || 'অন্যান্য');
      const displayName = isEn ? (z.nameEn || z.name) : z.name;
      if(cat !== lastCategory){
        html += `<div class="zikir-category-heading">${cat}</div>`;
        lastCategory = cat;
      }
      const targetTxt = z.target > 0 ? `${numFmt(z.target)}x` : t('free_label');
      html += `<button class="zikir-result-item"
        data-name="${escapeAttr(z.name)}"
        data-name-en="${escapeAttr(z.nameEn||z.name)}"
        data-target="${z.target}">
        <span class="zr-name">${displayName}</span>
        <span class="zr-target">${targetTxt}</span>
      </button>`;
    });
    zikirResults.innerHTML = html;

    zikirResults.querySelectorAll('.zikir-result-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const nameEn = btn.dataset.nameEn || name;
        const target = parseInt(btn.dataset.target, 10);
        selectDhikr(name, target, target === 0, nameEn);
        closeSheets();
      });
    });
  }

  function escapeAttr(str){
    return str.replace(/"/g, '&quot;');
  }

  let searchDebounce = null;
  zikirSearchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => renderZikirResults(zikirSearchInput.value), 80);
  });

  customSaveBtn.addEventListener('click', () => {
    const name = customNameInput.value.trim();
    let target = parseInt(customTargetInputModal.value, 10);
    if(isNaN(target) || target < 0) target = 0;
    if(target > 9999) target = 9999;

    if(name === ''){
      customNameInput.focus();
      return;
    }

    state.customDhikrs.unshift({ name, target });
    state.customDhikrs = state.customDhikrs.slice(0, 20);

    selectDhikr(name, target, target === 0);
    closeSheets();
  });

  customNameInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') customSaveBtn.click(); });
  customTargetInputModal.addEventListener('keydown', (e) => { if(e.key === 'Enter') customSaveBtn.click(); });

  // ============================================================
  // Sheets
  // ============================================================
  function openSheet(sheet){
    sheetBackdrop.classList.add('show');
    sheet.classList.add('show');
  }
  function closeSheets(){
    sheetBackdrop.classList.remove('show');
    historySheet.classList.remove('show');
    statsSheet.classList.remove('show');
    settingsSheet.classList.remove('show');
    pickerSheet.classList.remove('show');
    contactSheet.classList.remove('show');
  }

  historyBtn.addEventListener('click', () => { renderHistory(); openSheet(historySheet); });
  statsBtn.addEventListener('click', () => { renderStats(); openSheet(statsSheet); });
  settingsBtn.addEventListener('click', () => openSheet(settingsSheet));
  openContactBtn.addEventListener('click', () => openSheet(contactSheet));
  footerContactBtn.addEventListener('click', () => openSheet(contactSheet));
  sheetBackdrop.addEventListener('click', closeSheets);

  // Dua modal listeners
  const DUA_LIST = [
    {
      num: '১', arabic: 'أَسْتَغْفِرُ اللهَ',
      bn: 'আস্তাগফিরুল্লাহ',
      meaning: 'অর্থ: আমি আল্লাহর কাছে ক্ষমা চাই।',
      count: '× ৩ বার', target: 3,
      ref: '📖 সহীহ মুসলিম: ৫৯১ | সাওবান (রা.) থেকে বর্ণিত'
    },
    {
      num: '২', arabic: 'اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالإِكْرَامِ',
      bn: 'আল্লাহুম্মা আনতাস সালামু ওয়া মিনকাস সালামু তাবারাকতা ইয়া যাল জালালি ওয়াল ইকরাম',
      meaning: 'অর্থ: হে আল্লাহ! আপনি শান্তি, আপনার কাছ থেকেই শান্তি আসে। আপনি বরকতময়, হে মহিমান্বিত ও সম্মানিত।',
      count: '× ১ বার', target: 1,
      ref: '📖 সহীহ মুসলিম: ৫৯১ | সাওবান (রা.) থেকে বর্ণিত'
    },
    {
      num: '৩', arabic: 'لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
      bn: 'লা ইলাহা ইল্লাল্লাহু ওয়াহদাহু লা শারীকালাহু, লাহুল মুলকু ওয়ালাহুল হামদু ওয়াহুয়া আলা কুল্লি শাইয়িন কাদীর',
      meaning: 'অর্থ: আল্লাহ ছাড়া কোনো সত্য ইলাহ নেই, তিনি একা, তাঁর কোনো অংশীদার নেই। রাজত্ব তাঁরই, প্রশংসা তাঁরই এবং তিনি সব কিছুর উপর ক্ষমতাবান।',
      count: '× ১ বার', target: 1,
      ref: "📖 সহীহ মুসলিম: ৫৯৪ | মুগীরা ইবন শু'বা (রা.) থেকে বর্ণিত"
    },
    {
      num: '৪', arabic: 'اللَّهُمَّ لَا مَانِعَ لِمَا أَعْطَيْتَ، وَلَا مُعْطِيَ لِمَا مَنَعْتَ، وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ',
      bn: "আল্লাহুম্মা লা মানিআ লিমা আ'তাইতা, ওয়ালা মু'তিয়া লিমা মানা'তা, ওয়ালা ইয়ানফাউ যাল জাদ্দি মিনকাল জাদ্দ",
      meaning: 'অর্থ: হে আল্লাহ! আপনি যা দেন তা আটকানোর কেউ নেই, আপনি যা বন্ধ করেন তা দেওয়ার কেউ নেই এবং কোনো ধনী ব্যক্তির সম্পদ আপনার কাছে কাজে আসে না।',
      count: '× ১ বার', target: 1,
      ref: "📖 সহীহ বুখারী: ৮৪৪ | সহীহ মুসলিম: ৫৯৩ | মুগীরা ইবন শু'বা (রা.) থেকে বর্ণিত"
    },
    {
      num: '৫', arabic: 'سُبْحَانَ اللهِ ×٣٣ | اَلْحَمْدُ لِلهِ ×٣٣ | اَللهُ أَكْبَرُ ×٣٤',
      bn: 'সুবহানাল্লাহ × ৩৩  |  আলহামদুলিল্লাহ × ৩৩  |  আল্লাহু আকবার × ৩৪',
      meaning: 'মোট = ১০০। এরপর একবার "লা ইলাহা ইল্লাল্লাহু ওয়াহদাহু..." পড়া সুন্নত — সমুদ্রের ফেনার মতো গুনাহ মাফ হয়।',
      count: '× ৩৩ + ৩৩ + ৩৪ = ১০০ বার', target: 100,
      ref: '📖 সহীহ মুসলিম: ৫৯৫ | আবু হুরায়রা (রা.) থেকে বর্ণিত', highlight: true
    },
    {
      num: '৬', arabic: 'آيَةُ الْكُرْسِيِّ — البقرة: ٢٥٥',
      bn: 'আয়াতুল কুরসী — সূরা বাকারা: ২৫৫',
      meaning: 'যে ব্যক্তি প্রতি ফরয নামাজের পর আয়াতুল কুরসী পড়বে, তার জান্নাতে প্রবেশের পথে মৃত্যু ছাড়া আর কোনো বাধা থাকবে না।',
      count: '× ১ বার (প্রতি ফরয নামাজের পরে)', target: 1,
      ref: '📖 নাসাঈ (সুনানুল কুবরা): ৯৮২৮ | আলবানী রহ. সহীহ | আবু উমামা (রা.) থেকে বর্ণিত'
    },
    {
      num: '৭', arabic: 'قُلْ هُوَ اللهُ أَحَدٌ | قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ | قُلْ أَعُوذُ بِرَبِّ النَّاسِ',
      bn: 'সূরা ইখলাস  |  সূরা ফালাক  |  সূরা নাস',
      meaning: 'ফজর ও মাগরিবের পরে × ৩ বার, বাকি নামাজের পরে × ১ বার পড়া সুন্নত।',
      count: '× ৩ বার (ফজর ও মাগরিব) | × ১ বার (অন্যান্য)', target: 3,
      ref: '📖 আবু দাউদ: ৫০৮২ | তিরমিযী: ২৯০৩ | আলবানী রহ. সহীহ | উকবা ইবন আমির (রা.) থেকে বর্ণিত'
    },
    {
      num: '৮', arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
      bn: 'আল্লাহুম্মা আইন্নী আলা যিকরিকা ওয়া শুকরিকা ওয়া হুসনি ইবাদাতিক',
      meaning: 'অর্থ: হে আল্লাহ! আপনার যিকির করতে, আপনার শুকর আদায় করতে এবং সুন্দরভাবে আপনার ইবাদত করতে আমাকে সাহায্য করুন।',
      count: '× ১ বার', target: 1,
      ref: "📖 আবু দাউদ: ১৫২২ | আলবানী রহ. সহীহ | মু'আয ইবন জাবাল (রা.) থেকে বর্ণিত"
    },
    {
      num: '৯', arabic: 'لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ يُحْيِي وَيُمِيتُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
      bn: 'লা ইলাহা ইল্লাল্লাহু ওয়াহদাহু লা শারীকালাহু, লাহুল মুলকু ওয়ালাহুল হামদু ইউহয়ী ওয়া ইউমীতু ওয়াহুয়া আলা কুল্লি শাইয়িন কাদীর',
      meaning: 'অর্থ: আল্লাহ ছাড়া কোনো সত্য ইলাহ নেই, তিনি একা। রাজত্ব তাঁর, প্রশংসা তাঁর। তিনি জীবন ও মৃত্যু দেন এবং সব কিছুর উপর ক্ষমতাবান।',
      count: '× ১০ বার (ফজর ও মাগরিবের পরে)', target: 10,
      ref: '📖 তিরমিযী: ৩৪৭৪ | আলবানী রহ. হাসান সহীহ | আবু যর (রা.) থেকে বর্ণিত'
    },
    {
      num: '১০', arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ',
      bn: 'আল্লাহুম্মা ইন্নী আসআলুকাল জান্নাতা ওয়া আউযুবিকা মিনান নার',
      meaning: 'অর্থ: হে আল্লাহ! আমি আপনার কাছে জান্নাত চাই এবং জাহান্নাম থেকে আশ্রয় চাই।',
      count: '× ৩ বার', target: 3,
      ref: '📖 আবু দাউদ: ৭৯২ | ইবন মাজাহ: ৯২৫ | আলবানী রহ. সহীহ | আনাস (রা.) থেকে বর্ণিত'
    },
    {
      num: '১১', arabic: 'رَبِّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ',
      bn: 'রাব্বি কিনী আযাবাকা ইয়াওমা তাবআসু ইবাদাক',
      meaning: "অর্থ: হে আমার রব! যেদিন আপনি আপনার বান্দাদের পুনরুত্থিত করবেন সেদিন আমাকে আপনার আযাব থেকে রক্ষা করুন।",
      count: '× ৩ বার', target: 3,
      ref: "📖 আবু দাউদ: ৫০৮০ | আলবানী রহ. সহীহ | বারা' ইবন আযিব (রা.) থেকে বর্ণিত"
    },
    {
      num: '১২', arabic: 'اللَّهُمَّ اغْفِرْ لِي مَا قَدَّمْتُ وَمَا أَخَّرْتُ وَمَا أَسْرَرْتُ وَمَا أَعْلَنْتُ وَمَا أَسْرَفْتُ وَمَا أَنْتَ أَعْلَمُ بِهِ مِنِّي، أَنْتَ الْمُقَدِّمُ وَأَنْتَ الْمُؤَخِّرُ لَا إِلَهَ إِلَّا أَنْتَ',
      bn: "আল্লাহুম্মাগফির লী মা কাদ্দামতু ওয়ামা আখখারতু ওয়ামা আসরারতু ওয়ামা আ'লানতু ওয়ামা আসরাফতু ওয়ামা আনতা আ'লামু বিহী মিন্নী, আনতাল মুকাদ্দিমু ওয়া আনতাল মুআখখিরু লা ইলাহা ইল্লা আনত",
      meaning: 'অর্থ: হে আল্লাহ! আমি যা আগে ও পরে, গোপনে ও প্রকাশ্যে করেছি, সীমা লঙ্ঘন করেছি এবং যা আপনি বেশি জানেন — সব ক্ষমা করুন। আপনিই আগে-পিছে করেন, আপনি ছাড়া কোনো ইলাহ নেই।',
      count: '× ১ বার', target: 1,
      ref: '📖 সহীহ বুখারী: ৮৩৪ | সহীহ মুসলিম: ৭৭১ | আলী (রা.) থেকে বর্ণিত'
    }
  ];

  const duaModalBody = document.getElementById('duaModalBody');

  function startDua(index){
    const d = DUA_LIST[index];
    if(!d) return;
    state.isDuaMode = true;
    state.duaIndex = index;
    state.countingMode = 'batch';
    // batchDefaultSize stays at 20 always — don't override with dua target
    selectDhikr(d.bn, d.target, d.target === 0, d.bn, true);
    duaModalOverlay.classList.remove('open');
    applyMode();
    render();
    showToast(state.lang === 'en' ? `Dua ${index+1} started` : `${d.num} নং দোয়া শুরু হয়েছে`);
  }

  function renderDuaModal(){
    const btnLabel = state.lang === 'en' ? '▶ Start Counting' : '▶ গণনা শুরু করুন';
    const nextLabel = state.lang === 'en' ? 'Next Dua ›' : 'পরের দোয়া ›';
    const doneLabel = state.lang === 'en' ? '✓ Done' : '✓ সম্পন্ন';

    const html = DUA_LIST.map((d, i) => {
      const isDone = state.isDuaMode && state.duaIndex > i;
      const isActive = state.isDuaMode && state.duaIndex === i;
      return `
      <div class="dua-card${d.highlight ? ' dua-card-tasbih' : ''}${isDone ? ' dua-done' : ''}${isActive ? ' dua-active' : ''}" id="duaCard${i}">
        <div class="dua-num">${isDone ? '✓' : d.num}</div>
        <div class="dua-content">
          <p class="dua-arabic">${d.arabic}</p>
          <p class="dua-bn">${d.bn}</p>
          <p class="dua-meaning">${d.meaning}</p>
          <p class="dua-count">${d.count}</p>
          <p class="dua-ref">${d.ref}</p>
          <div class="dua-btn-row">
            ${isDone
              ? `<span class="dua-done-label">✓ ${doneLabel}</span>`
              : `<button class="dua-start-btn" data-index="${i}">${btnLabel}</button>`
            }
            ${isDone && i + 1 < DUA_LIST.length
              ? `<button class="dua-next-btn" data-index="${i+1}">${nextLabel}</button>`
              : ''
            }
          </div>
        </div>
      </div>`;
    }).join('') + `
      <div class="dua-footer-note">
        💡 উপরের দোয়াগুলো সহীহ হাদীসে বর্ণিত। নামাজের পরে ধারাবাহিকভাবে পড়ার চেষ্টা করুন।
        আল্লাহ আমাদের সবাইকে আমল করার তাওফিক দিন। আমীন।
      </div>`;

    duaModalBody.innerHTML = html;

    // Scroll to active card
    if(state.duaIndex >= 0){
      const activeCard = document.getElementById(`duaCard${state.duaIndex}`);
      if(activeCard) setTimeout(() => activeCard.scrollIntoView({ behavior:'smooth', block:'center' }), 100);
    }

    duaModalBody.querySelectorAll('.dua-start-btn').forEach(btn => {
      btn.addEventListener('click', () => startDua(parseInt(btn.dataset.index)));
    });
    duaModalBody.querySelectorAll('.dua-next-btn').forEach(btn => {
      btn.addEventListener('click', () => startDua(parseInt(btn.dataset.index)));
    });
  }

  duaModalBtn.addEventListener('click', () => {
    renderDuaModal();
    duaModalOverlay.classList.add('open');
  });
  duaModalClose.addEventListener('click', () => duaModalOverlay.classList.remove('open'));
  duaModalOverlay.addEventListener('click', (e) => {
    if(e.target === duaModalOverlay) duaModalOverlay.classList.remove('open');
  });

  duaModalBtn.addEventListener('click', () => {
    renderDuaModal();
    duaModalOverlay.classList.add('open');
  });
  duaModalClose.addEventListener('click', () => duaModalOverlay.classList.remove('open'));
  duaModalOverlay.addEventListener('click', (e) => {
    if(e.target === duaModalOverlay) duaModalOverlay.classList.remove('open');
  });

  // ============================================================
  // Rabbana (Quranic) Dua Modal
  // ============================================================
  const RABBANA_LIST = [
    { num:'১', ref_bn:'সূরা বাকারা: ১২৭', arabic:'رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ', bn:'রাব্বানা তাকাব্বাল মিন্না ইন্নাকা আনতাস সামীউল আলীম', meaning:'অর্থ: হে আমাদের রব! আমাদের থেকে কবুল করুন। নিশ্চয়ই আপনি সর্বশ্রোতা, সর্বজ্ঞ।', context:"ইবরাহীম ও ইসমাঈল (আ.) কা'বা নির্মাণকালে এই দোয়া করেছিলেন।" },
    { num:'২', ref_bn:'সূরা বাকারা: ১২৮', arabic:'رَبَّنَا وَاجْعَلْنَا مُسْلِمَيْنِ لَكَ وَمِن ذُرِّيَّتِنَا أُمَّةً مُّسْلِمَةً لَّكَ وَأَرِنَا مَنَاسِكَنَا وَتُبْ عَلَيْنَا ۖ إِنَّكَ أَنتَ التَّوَّابُ الرَّحِيمُ', bn:'রাব্বানা ওয়াজআলনা মুসলিমাইনি লাকা ওয়ামিন যুররিয়্যাতিনা উম্মাতাম মুসলিমাতাল লাক, ওয়া আরিনা মানাসিকানা ওয়া তুব আলাইনা, ইন্নাকা আনতাত তাওওয়াবুর রাহীম', meaning:'অর্থ: হে আমাদের রব! আমাদের দুজনকে আপনার অনুগত করুন এবং আমাদের বংশ থেকে আপনার অনুগত একটি উম্মত তৈরি করুন। আমাদের ইবাদতের নিয়ম দেখিয়ে দিন এবং আমাদের তওবা কবুল করুন। নিশ্চয়ই আপনি তওবা কবুলকারী, দয়ালু।', context:'ইবরাহীম ও ইসমাঈল (আ.)-এর দোয়া।' },
    { num:'৩', ref_bn:'সূরা বাকারা: ২০১', arabic:'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', bn:'রাব্বানা আতিনা ফিদ্দুনিয়া হাসানাতাও ওয়াফিল আখিরাতি হাসানাতাও ওয়াকিনা আযাবান নার', meaning:'অর্থ: হে আমাদের রব! আমাদের দুনিয়ায় কল্যাণ দিন, আখিরাতেও কল্যাণ দিন এবং জাহান্নামের আযাব থেকে রক্ষা করুন।', context:'সর্বাধিক পঠিত কুরআনিক দোয়াগুলোর অন্যতম।' },
    { num:'৪', ref_bn:'সূরা বাকারা: ২৮৬', arabic:'رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا ۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِن قَبْلِنَا ۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنتَ مَوْلَانَا فَانصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ', bn:'রাব্বানা লা তুআখিযনা ইন নাসীনা আও আখতানা... ওয়াফু আন্না ওয়াগফির লানা ওয়ারহামনা, আনতা মাওলানা ফানসুরনা আলাল কাওমিল কাফিরীন', meaning:'অর্থ: হে আমাদের রব! ভুলে বা ভুলক্রমে কৃত পাপে পাকড়াও করবেন না। আমাদের উপর অসহ্য বোঝা চাপাবেন না। আমাদের মাফ করুন, ক্ষমা করুন, দয়া করুন — আপনিই আমাদের অভিভাবক।', context:'সূরা বাকারার শেষ আয়াতের অংশ — অত্যন্ত ফযীলতপূর্ণ।' },
    { num:'৫', ref_bn:'সূরা আলে ইমরান: ৮', arabic:'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً ۚ إِنَّكَ أَنتَ الْوَهَّابُ', bn:'রাব্বানা লা তুযিগ কুলুবানা বাআদা ইয হাদাইতানা ওয়াহাব লানা মিল্লাদুনকা রাহমাহ, ইন্নাকা আনতাল ওয়াহহাব', meaning:'অর্থ: হে আমাদের রব! হিদায়াত দেওয়ার পরে আমাদের অন্তর বাঁকা করবেন না এবং আপনার পক্ষ থেকে রহমত দিন। নিশ্চয়ই আপনিই দাতা।', context:'হিদায়াতের উপর অবিচল থাকার দোয়া।' },
    { num:'৬', ref_bn:'সূরা আলে ইমরান: ১৪৭', arabic:'رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا وَانصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ', bn:'রাব্বানাগফির লানা যুনুবানা ওয়া ইসরাফানা ফী আমরিনা ওয়া ছাব্বিত আকদামানা ওয়ানসুরনা আলাল কাওমিল কাফিরীন', meaning:'অর্থ: হে আমাদের রব! আমাদের গুনাহ এবং সীমা লঙ্ঘন মাফ করুন, পা মজবুত রাখুন এবং কাফিরদের বিরুদ্ধে সাহায্য করুন।', context:'নবীদের সাথীদের দোয়া।' },
    { num:'৭', ref_bn:'সূরা আলে ইমরান: ১৯৩-১৯৪', arabic:'رَّبَّنَا إِنَّنَا سَمِعْنَا مُنَادِيًا يُنَادِي لِلْإِيمَانِ... رَبَّنَا فَاغْفِرْ لَنَا ذُنُوبَنَا وَكَفِّرْ عَنَّا سَيِّئَاتِنَا وَتَوَفَّنَا مَعَ الْأَبْرَارِ', bn:'রাব্বানা ইন্নানা সামিনা মুনাদিয়ান... রাব্বানা ফাগফির লানা যুনুবানা ওয়া কাফফির আন্না সাইয়িআতিনা ওয়া তাওয়াফফানা মাআল আবরার', meaning:'অর্থ: হে আমাদের রব! আমরা ঈমানের আহ্বানকারীর ডাক শুনে ঈমান এনেছি। আমাদের গুনাহ মাফ করুন, পাপ দূর করুন এবং সৎ লোকদের সাথে মৃত্যু দিন।', context:'উলুল আলবাবের দোয়া।' },
    { num:'৮', ref_bn:'সূরা আল-আরাফ: ২৩', arabic:'رَبَّنَا ظَلَمْنَا أَنفُسَنَا وَإِن لَّمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ الْخَاسِرِينَ', bn:'রাব্বানা যালামনা আনফুসানা ওয়া ইল্লাম তাগফির লানা ওয়া তারহামনা লানাকুনান্না মিনাল খাসিরীন', meaning:'অর্থ: হে আমাদের রব! আমরা নিজেদের প্রতি অন্যায় করেছি। যদি ক্ষমা না করেন ও দয়া না করেন তাহলে আমরা ক্ষতিগ্রস্ত হব।', context:'আদম ও হাওয়া (আ.)-এর তওবার দোয়া।' },
    { num:'৯', ref_bn:'সূরা ইউনুস: ৮৫-৮৬', arabic:'رَبَّنَا لَا تَجْعَلْنَا فِتْنَةً لِّلْقَوْمِ الظَّالِمِينَ ۝ وَنَجِّنَا بِرَحْمَتِكَ مِنَ الْقَوْمِ الْكَافِرِينَ', bn:'রাব্বানা লা তাজআলনা ফিতনাতাল লিল কাওমিয যালিমীন, ওয়া নাজ্জিনা বিরাহমাতিকা মিনাল কাওমিল কাফিরীন', meaning:'অর্থ: আমাদেরকে যালিম কওমের ফিতনার কারণ করবেন না এবং কাফির কওম থেকে মুক্তি দিন।', context:"ফিরআউনের বিরুদ্ধে মুমিনদের দোয়া।" },
    { num:'১০', ref_bn:'সূরা ইব্রাহীম: ৪০-৪১', arabic:'رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِن ذُرِّيَّتِي ۚ رَبَّنَا وَتَقَبَّلْ دُعَاءِ ۝ رَبَّنَا اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ', bn:'রাব্বিজআলনী মুকীমাস সালাতি ওয়ামিন যুররিয়্যাতী, রাব্বানা ওয়া তাকাব্বাল দুআ, রাব্বানাগফির লী ওয়ালিওয়ালিদাইয়া ওয়ালিল মুমিনীনা ইয়াওমা ইয়াকুমুল হিসাব', meaning:'অর্থ: হে রব! আমাকে ও আমার বংশধরদের নামাজ কায়েমকারী করুন। আমার দোয়া কবুল করুন। হিসাবের দিন আমাকে, পিতামাতাকে ও সকল মুমিনদের ক্ষমা করুন।', context:'ইবরাহীম (আ.)-এর দোয়া — পিতামাতার জন্য।' },
    { num:'১১', ref_bn:'সূরা আল-কাহফ: ১০', arabic:'رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا', bn:'রাব্বানা আতিনা মিল্লাদুনকা রাহমাতাও ওয়া হাইয়্যি লানা মিন আমরিনা রাশাদা', meaning:'অর্থ: হে আমাদের রব! আপনার কাছ থেকে রহমত দান করুন এবং আমাদের কাজ সঠিকভাবে পরিচালিত করুন।', context:'আসহাবে কাহাফের দোয়া।' },
    { num:'১২', ref_bn:'সূরা আল-মুমিনুন: ৯৭-৯৮', arabic:'رَّبِّ أَعُوذُ بِكَ مِنْ هَمَزَاتِ الشَّيَاطِينِ ۝ وَأَعُوذُ بِكَ رَبِّ أَن يَحْضُرُونِ', bn:'রাব্বি আউযুবিকা মিন হামাযাতিশ শায়াতীন, ওয়া আউযুবিকা রাব্বি আই ইয়াহদুরুন', meaning:'অর্থ: হে আমার রব! শয়তানের প্ররোচনা থেকে আশ্রয় চাই এবং তাদের উপস্থিতি থেকে আশ্রয় চাই।', context:'শয়তানের ওয়াসওয়াসা থেকে রক্ষার দোয়া।' },
    { num:'১৩', ref_bn:'সূরা আল-ফুরকান: ৬৫-৬৬', arabic:'رَبَّنَا اصْرِفْ عَنَّا عَذَابَ جَهَنَّمَ ۖ إِنَّ عَذَابَهَا كَانَ غَرَامًا', bn:'রাব্বানাসরিফ আন্না আযাবা জাহান্নাম, ইন্না আযাবাহা কানা গারামা', meaning:'অর্থ: হে আমাদের রব! আমাদের থেকে জাহান্নামের শাস্তি দূর করুন। নিশ্চয়ই এর শাস্তি অবিচ্ছিন্ন।', context:"রহমানের বান্দাদের (ইবাদুর রহমান) দোয়া।" },
    { num:'১৪', ref_bn:'সূরা আল-ফুরকান: ৭৪', arabic:'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا', bn:'রাব্বানা হাবলানা মিন আযওয়াজিনা ওয়া যুররিয়্যাতিনা কুররাতা আইউনিওঁ ওয়াজআলনা লিল মুত্তাকীনা ইমামা', meaning:'অর্থ: হে আমাদের রব! স্ত্রী ও সন্তানদের মধ্য থেকে আমাদের চোখের শীতলতা দান করুন এবং আমাদের মুত্তাকীদের নেতা বানিয়ে দিন।', context:"পরিবারের জন্য সর্বোত্তম দোয়াগুলোর একটি।" },
    { num:'১৫', ref_bn:'সূরা আল-কাসাস: ১৬', arabic:'رَبِّ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي', bn:'রাব্বি ইন্নী যালামতু নাফসী ফাগফিরলী', meaning:'অর্থ: হে আমার রব! আমি নিজের প্রতি অন্যায় করেছি, তাই আমাকে ক্ষমা করুন।', context:'মূসা (আ.)-এর তওবার দোয়া।' },
    { num:'১৬', ref_bn:'সূরা আল-কাসাস: ২৪', arabic:'رَبِّ إِنِّي لِمَا أَنزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ', bn:'রাব্বি ইন্নী লিমা আনযালতা ইলাইয়া মিন খাইরিন ফাকীর', meaning:'অর্থ: হে আমার রব! আপনি আমার প্রতি যে কল্যাণ অবতীর্ণ করবেন আমি তার মুখাপেক্ষী।', context:'মূসা (আ.)-এর দোয়া — বিপদের সময়।' },
    { num:'১৭', ref_bn:'সূরা গাফির: ৭-৯', arabic:'رَبَّنَا وَسِعْتَ كُلَّ شَيْءٍ رَّحْمَةً وَعِلْمًا فَاغْفِرْ لِلَّذِينَ تَابُوا وَاتَّبَعُوا سَبِيلَكَ وَقِهِمْ عَذَابَ الْجَحِيمِ ۝ رَبَّنَا وَأَدْخِلْهُمْ جَنَّاتِ عَدْنٍ', bn:'রাব্বানা ওয়াসিতা কুল্লা শাইয়িন রাহমাতাও ওয়া ইলমান ফাগফির লিল্লাযীনা তাবু... রাব্বানা ওয়া আদখিলহুম জান্নাতি আদনিন', meaning:'অর্থ: হে আমাদের রব! তওবাকারীদের মাফ করুন, জাহান্নাম থেকে রক্ষা করুন এবং চিরস্থায়ী জান্নাতে প্রবেশ করান।', context:'আরশ বহনকারী ফেরেশতাদের দোয়া।' },
    { num:'১৮', ref_bn:'সূরা আল-আহকাফ: ১৫', arabic:'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ وَأَصْلِحْ لِي فِي ذُرِّيَّتِي', bn:'রাব্বি আওযিনী আন আশকুরা নিমাতাকাল্লাতী আনআমতা আলাইয়া ওয়া আলা ওয়ালিদাইয়া ওয়া আন আমালা সালিহান তারদাহু ওয়া আসলিহ লী ফী যুররিয়্যাতী', meaning:'অর্থ: হে রব! নিয়ামতের শুকর আদায়, সৎকাজ করা এবং সন্তানদের সংশোধনের তাওফিক দিন।', context:'পরিপক্ব বয়সে সন্তান ও পিতামাতার জন্য দোয়া।' },
    { num:'১৯', ref_bn:'সূরা আল-হাশর: ১০', arabic:'رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ وَلَا تَجْعَلْ فِي قُلُوبِنَا غِلًّا لِّلَّذِينَ آمَنُوا رَبَّنَا إِنَّكَ رَءُوفٌ رَّحِيمٌ', bn:'রাব্বানাগফির লানা ওয়ালি ইখওয়ানিনাল্লাযীনা সাবাকুনা বিল ঈমানি ওয়ালা তাজআল ফী কুলুবিনা গিল্লাল লিল্লাযীনা আমানু রাব্বানা ইন্নাকা রাউফুর রাহীম', meaning:'অর্থ: আমাদের ও আমাদের পূর্ববর্তী মুমিন ভাইদের ক্ষমা করুন এবং মুমিনদের প্রতি অন্তরে বিদ্বেষ রাখবেন না।', context:'ভ্রাতৃত্ব ও পূর্বসূরীদের জন্য দোয়া।' },
    { num:'২০', ref_bn:'সূরা আত-তাহরীম: ৮', arabic:'رَبَّنَا أَتْمِمْ لَنَا نُورَنَا وَاغْفِرْ لَنَا ۖ إِنَّكَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ', bn:'রাব্বানা আতমিম লানা নুরানা ওয়াগফির লানা, ইন্নাকা আলা কুল্লি শাইয়িন কাদীর', meaning:'অর্থ: হে আমাদের রব! আমাদের নূর পূর্ণ করুন এবং ক্ষমা করুন। নিশ্চয়ই আপনি সর্বশক্তিমান।', context:'কিয়ামতের দিন মুমিনদের দোয়া।' },
    { num:'২১', ref_bn:'সূরা আশ-শুআরা: ৮৩-৮৫', arabic:'رَبِّ هَبْ لِي حُكْمًا وَأَلْحِقْنِي بِالصَّالِحِينَ ۝ وَاجْعَل لِّي لِسَانَ صِدْقٍ فِي الْآخِرِينَ ۝ وَاجْعَلْنِي مِن وَرَثَةِ جَنَّةِ النَّعِيمِ', bn:'রাব্বি হাবলী হুকমাও ওয়া আলহিকনী বিস সালিহীন, ওয়াজআল লী লিসানা সিদকিন ফিল আখিরীন, ওয়াজআলনী মিও ওয়ারাছাতি জান্নাতিন নাঈম', meaning:'অর্থ: হে রব! প্রজ্ঞা দিন, সৎলোকদের সাথে মিলান, পরবর্তী প্রজন্মে সুনাম রাখুন এবং জান্নাতুন নাঈমের উত্তরাধিকারী করুন।', context:'ইবরাহীম (আ.)-এর দোয়া।' },
    { num:'২২', ref_bn:'সূরা আল-কাসাস: ১৬', arabic:'رَبِّ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي', bn:'রাব্বি ইন্নী যালামতু নাফসী ফাগফিরলী', meaning:'অর্থ: হে আমার রব! আমি নিজের প্রতি অন্যায় করেছি, আমাকে ক্ষমা করুন।', context:'মূসা (আ.)-এর তওবার দোয়া — সংক্ষিপ্ত ও হৃদয়গ্রাহী।' },
    { num:'২৩', ref_bn:'সূরা আলে ইমরান: ৯', arabic:'رَبَّنَا إِنَّكَ جَامِعُ النَّاسِ لِيَوْمٍ لَّا رَيْبَ فِيهِ ۚ إِنَّ اللَّهَ لَا يُخْلِفُ الْمِيعَادَ', bn:'রাব্বানা ইন্নাকা জামিউন্নাসি লি ইয়াওমিল লা রাইবা ফীহ, ইন্নাল্লাহা লা ইউখলিফুল মিআদ', meaning:'অর্থ: হে আমাদের রব! নিশ্চয়ই আপনি মানুষকে সেই দিন একত্রিত করবেন যে দিনে কোনো সন্দেহ নেই। আল্লাহ প্রতিশ্রুতি ভঙ্গ করেন না।', context:'কিয়ামতের প্রতি বিশ্বাস স্থির রাখার দোয়া।' }
  ];

  const rabbanaModalOverlay = document.getElementById('rabbanaModalOverlay');
  const rabbanaModalClose = document.getElementById('rabbanaModalClose');
  const rabbanaModalBody = document.getElementById('rabbanaModalBody');
  const rabbanaModalBtn = document.getElementById('rabbanaModalBtn');

  function renderRabbanaModal(){
    const btnLabel = state.lang === 'en' ? '▶ Start Counting' : '▶ গণনা শুরু করুন';
    rabbanaModalBody.innerHTML = RABBANA_LIST.map(d => `
      <div class="dua-card">
        <div class="dua-num">${d.num}</div>
        <div class="dua-content">
          <p class="dua-ref" style="color:var(--gold);font-weight:600;margin-bottom:4px;">📖 ${d.ref_bn}</p>
          <p class="dua-arabic">${d.arabic}</p>
          <p class="dua-bn">${d.bn}</p>
          <p class="dua-meaning">${d.meaning}</p>
          <p class="dua-meaning" style="font-style:italic;color:var(--text-faint);">${d.context}</p>
          <div class="dua-btn-row">
            <button class="dua-start-btn rabbana-start" data-name="${d.bn.replace(/"/g,'&quot;')}">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              ${btnLabel}
            </button>
          </div>
        </div>
      </div>`).join('') + `
      <div class="dua-footer-note">
        📖 এই দোয়াগুলো সরাসরি আল-কুরআন থেকে সংকলিত। নিয়মিত পড়ার অভ্যাস করুন।<br>
        আল্লাহ আমাদের কুরআনের উপর আমল করার তাওফিক দিন। আমীন।
      </div>`;

    rabbanaModalBody.querySelectorAll('.rabbana-start').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        selectDhikr(name, 1, false, name, false);
        rabbanaModalOverlay.classList.remove('open');
      });
    });
  }

  rabbanaModalBtn.addEventListener('click', () => {
    renderRabbanaModal();
    rabbanaModalOverlay.classList.add('open');
  });
  rabbanaModalClose.addEventListener('click', () => rabbanaModalOverlay.classList.remove('open'));
  rabbanaModalOverlay.addEventListener('click', (e) => {
    if(e.target === rabbanaModalOverlay) rabbanaModalOverlay.classList.remove('open');
  });
  function formatDateHeading(d){
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    if(d.toDateString() === today.toDateString()) return t('history_today');
    if(d.toDateString() === yest.toDateString()) return t('history_yesterday');
    const locale = state.lang === 'en' ? 'en-US' : 'bn-BD';
    return d.toLocaleDateString(locale, { day:'numeric', month:'long', year:'numeric' });
  }

  function renderHistory(){
    const liveCount = state.count;
    const entries = state.history.slice().sort((a,b) => b.endedAt - a.endedAt);

    if(entries.length === 0 && liveCount === 0){
      historyList.innerHTML = `<p class="history-empty">${t('history_empty')}</p>`;
      return;
    }

    let html = '';
    let lastHeading = '';

    if(liveCount > 0){
      const d = new Date(state.sessionStart);
      const heading = formatDateHeading(d);
      html += `<div class="history-date-heading">${heading}</div>`;
      lastHeading = heading;
      html += renderHistoryItem({
        name: state.dhikrName,
        nameEn: state.dhikrNameEn || state.dhikrName,
        count: liveCount,
        target: state.isFree ? 0 : state.target,
        isFree: state.isFree,
        mode: state.countingMode,
        batchSize: state.batchDefaultSize,
        endedAt: Date.now()
      }, true);
    }

    entries.forEach(item => {
      const d = new Date(item.endedAt);
      const heading = formatDateHeading(d);
      if(heading !== lastHeading){
        html += `<div class="history-date-heading">${heading}</div>`;
        lastHeading = heading;
      }
      html += renderHistoryItem(item, false);
    });

    historyList.innerHTML = html;
  }

  function renderHistoryItem(item, isLive){
    const d = new Date(item.endedAt);
    const locale = state.lang === 'en' ? 'en-US' : 'bn-BD';
    const timeStr = d.toLocaleTimeString(locale, { hour:'numeric', minute:'2-digit' });
    const targetTxt = item.isFree ? t('history_free') : `${t('history_target')} ${numFmt(item.target)}`;
    const liveTag = isLive ? `<span class="live-tag">${t('history_live_tag')}</span>` : '';
    const displayName = state.lang === 'en' && item.nameEn ? item.nameEn : item.name;

    // mode badge
    const isBatch = item.mode === 'batch';
    const modeBadge = isBatch
      ? `<span class="h-mode-badge batch">${state.lang === 'en' ? `Batch ×${item.batchSize||'?'}` : `ব্যাচ ×${numFmt(item.batchSize||0)}`}</span>`
      : `<span class="h-mode-badge single">${state.lang === 'en' ? 'Single' : 'একক'}</span>`;

    return `<div class="history-item${isLive ? ' live' : ''}">
      <div class="h-left">
        <div class="h-name">${displayName} ${liveTag}</div>
        <div class="h-meta">${timeStr} • ${targetTxt} ${modeBadge}</div>
      </div>
      <div class="h-count">${numFmt(item.count)}</div>
    </div>`;
  }

  clearHistoryBtn.addEventListener('click', () => {
    state.history = [];
    save();
    renderHistory();
  });

  // ---------- Stats rendering ----------
  const weekChart = document.getElementById('weekChart');
  const statStreak = document.getElementById('statStreak');
  const statWeekTotal = document.getElementById('statWeekTotal');
  const statBestDay = document.getElementById('statBestDay');
  const statAvgDay = document.getElementById('statAvgDay');
  const dayNamesBn = ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'];
  const dayNamesEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  function renderStats(){
    const days = [];
    for(let i = 6; i >= 0; i--){
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      days.push({ key, date: d, count: state.dayLog[key] || 0 });
    }

    const weekTotal = days.reduce((sum, d) => sum + d.count, 0);
    const maxVal = Math.max(...days.map(d => d.count), 1);
    const bestDay = Math.max(...days.map(d => d.count), 0);
    const avgDay = Math.round(weekTotal / 7);

    statStreak.textContent = numFmt(state.streak);
    statWeekTotal.textContent = numFmt(weekTotal);
    statBestDay.textContent = numFmt(bestDay);
    statAvgDay.textContent = numFmt(avgDay);

    const dayNames = state.lang === 'en' ? dayNamesEn : dayNamesBn;
    const todayKey = dateKey(new Date());
    weekChart.innerHTML = days.map(d => {
      const heightPct = Math.max((d.count / maxVal) * 100, d.count > 0 ? 6 : 2);
      const isToday = d.key === todayKey;
      const dayLabel = dayNames[d.date.getDay()];
      return `<div class="bar-col${isToday ? ' is-today' : ''}">
        ${d.count > 0 ? `<span class="bar-val">${numFmt(d.count)}</span>` : ''}
        <div class="bar-fill" style="height:${heightPct}%"></div>
        <span class="bar-day">${dayLabel}</span>
      </div>`;
    }).join('');
  }

  // ============================================================
  // Settings
  // ============================================================
  vibrateToggle.addEventListener('change', () => {
    state.vibrate = vibrateToggle.checked;
    save();
    render();
  });
  soundToggle.addEventListener('change', () => {
    state.sound = soundToggle.checked;
    soundStyleRow.style.display = state.sound ? '' : 'none';
    save();
    if(state.sound) doSound();
  });
  autoRoundToggle.addEventListener('change', () => {
    state.autoRound = autoRoundToggle.checked;
    save();
  });
  celebrateToggle.addEventListener('change', () => {
    state.celebrate = celebrateToggle.checked;
    save();
  });

  soundChips.forEach(chip => {
    chip.addEventListener('click', () => {
      state.soundStyle = chip.dataset.sound;
      soundChips.forEach(c => c.classList.toggle('active', c === chip));
      save();
      if(!state.sound){
        state.sound = true;
        soundToggle.checked = true;
        soundStyleRow.style.display = '';
      }
      doSound();
      save();
    });
  });

  themeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      state.theme = chip.dataset.theme;
      applyTheme();
      save();
    });
  });

  document.querySelectorAll('.lang-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.lang = chip.dataset.lang;
      save();
      applyI18n();
      render();
    });
  });

  dailyGoalInput.addEventListener('change', () => {
    let val = parseInt(dailyGoalInput.value, 10);
    if(isNaN(val) || val < 1) val = 1;
    if(val > 99999) val = 99999;
    dailyGoalInput.value = val;
    state.dailyGoal = val;
    checkStreak();
    save();
    render();
  });

  const batchDefaultInput = document.getElementById('batchDefaultInput');
  batchDefaultInput.addEventListener('change', () => {
    let val = parseInt(batchDefaultInput.value, 10);
    if(isNaN(val) || val < 1) val = 1;
    if(val > 999) val = 999;
    batchDefaultInput.value = val;
    state.batchDefaultSize = val;
    renderBatchBadge();
    save();
  });

  // Persist any in-progress count if the user leaves the page
  window.addEventListener('beforeunload', () => {
    if(state.count > 0){
      addHistoryEntry(state.count);
      save();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden' && state.count > 0){
      save();
    }
  });

  // ============================================================
  // Init
  // ============================================================
  function init(){
    load();
    applyI18n();
    vibrateToggle.checked = state.vibrate;
    soundToggle.checked = state.sound;
    soundStyleRow.style.display = state.sound ? '' : 'none';
    autoRoundToggle.checked = state.autoRound;
    celebrateToggle.checked = state.celebrate;
    dailyGoalInput.value = state.dailyGoal;
    batchDefaultInput.value = state.batchDefaultSize;

    soundChips.forEach(c => c.classList.toggle('active', c.dataset.sound === state.soundStyle));

    applyTheme();
    buildMilestoneDots();
    checkStreak();
    applyMode();  // sets mode buttons + shows/hides batch panel
    render();
  }

  init();
})();
