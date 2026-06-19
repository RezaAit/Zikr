(function(){
  'use strict';

  // ---------- Bangla numeral helper ----------
  const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  function toBn(num){
    return String(num).split('').map(ch => /[0-9]/.test(ch) ? bnDigits[ch] : ch).join('');
  }

  // ---------- State ----------
  const STORAGE_KEY = 'tajbih_counter_state_v3';

  let state = {
    count: 0,
    round: 1,
    target: 33,
    dhikrName: 'সুবহানাল্লাহ',
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
    milestonesHitThisSession: [] // [25,50] etc, reset on session close
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
  }

  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch(e){ /* storage unavailable */ }
  }

  // ---------- DOM ----------
  const countDisplay = document.getElementById('countDisplay');
  const roundLabel = document.getElementById('roundLabel');
  const targetLabel = document.getElementById('targetLabel');
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
  const themeChips = document.querySelectorAll('.theme-chip');

  const customNameInput = document.getElementById('customNameInput');
  const customTargetInputModal = document.getElementById('customTargetInputModal');
  const customSaveBtn = document.getElementById('customSaveBtn');

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
    streakText.textContent = `${toBn(state.streak)} দিনের স্ট্রিক`;
    const todayKey = dateKey(new Date());
    const todayCount = state.dayLog[todayKey] || 0;
    const met = todayCount >= state.dailyGoal;
    dailyGoalText.textContent = `আজ: ${toBn(Math.min(todayCount, state.dailyGoal))} / ${toBn(state.dailyGoal)}${met ? ' ✓' : ''}`;
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
    const label = pct === 100 ? 'সম্পূর্ণ হয়েছে! 🎉' : `${toBn(pct)}% সম্পন্ন`;
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
    countDisplay.textContent = toBn(state.count);
    roundLabel.textContent = state.isFree ? 'মুক্ত গণনা' : `রাউন্ড ${toBn(state.round)}`;
    targetLabel.textContent = (!state.isFree && state.target > 0) ? `লক্ষ্য: ${toBn(state.target)}` : 'কোনো লক্ষ্য নেই';
    activeDhikrName.textContent = state.dhikrName;
    todayTotalEl.textContent = toBn(state.todayTotal);
    grandTotalEl.textContent = toBn(state.grandTotal);

    let progress = (!state.isFree && state.target > 0) ? Math.min(state.count / state.target, 1) : 0;
    const offset = RING_CIRC * (1 - progress);
    ringFill.style.strokeDasharray = RING_CIRC;
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.opacity = state.isFree ? 0.25 : 1;
    milestoneDotsSvg.style.opacity = state.isFree ? 0 : 1;
    updateMilestoneDots(progress * 100);

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
      count: count,
      target: state.isFree ? 0 : state.target,
      isFree: state.isFree,
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

  function selectDhikr(name, target, isFree){
    closeOutCurrentSession();
    state.dhikrName = name;
    state.target = target;
    state.isFree = !!isFree;
    state.count = 0;
    state.round = 1;
    undoStack = [];
    save();
    render();
  }

  // ============================================================
  // Event listeners — core
  // ============================================================
  tapZone.addEventListener('click', increment);
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
        selectDhikr('মুক্ত গণনা', 0, true);
        return;
      }
      selectDhikr(chip.dataset.name, parseInt(chip.dataset.target, 10), false);
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
    const q = query.trim().toLowerCase();
    const filtered = q === ''
      ? ZIKIR_LIBRARY
      : ZIKIR_LIBRARY.filter(z => z.name.toLowerCase().includes(q) || (z.category || '').toLowerCase().includes(q));

    if(filtered.length === 0){
      zikirResults.innerHTML = '<p class="zikir-no-results">কোনো যিকির খুঁজে পাওয়া যায়নি। "নিজস্ব লিখুন" ট্যাবে নিজের যিকির যোগ করতে পারেন।</p>';
      return;
    }

    let html = '';
    let lastCategory = null;
    filtered.forEach(z => {
      const cat = z.category || 'অন্যান্য';
      if(cat !== lastCategory){
        html += `<div class="zikir-category-heading">${cat}</div>`;
        lastCategory = cat;
      }
      const targetTxt = z.target > 0 ? `${toBn(z.target)}x` : 'মুক্ত';
      html += `<button class="zikir-result-item" data-name="${escapeAttr(z.name)}" data-target="${z.target}">
        <span class="zr-name">${z.name}</span>
        <span class="zr-target">${targetTxt}</span>
      </button>`;
    });
    zikirResults.innerHTML = html;

    zikirResults.querySelectorAll('.zikir-result-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const target = parseInt(btn.dataset.target, 10);
        selectDhikr(name, target, target === 0);
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
  }

  historyBtn.addEventListener('click', () => { renderHistory(); openSheet(historySheet); });
  statsBtn.addEventListener('click', () => { renderStats(); openSheet(statsSheet); });
  settingsBtn.addEventListener('click', () => openSheet(settingsSheet));
  sheetBackdrop.addEventListener('click', closeSheets);

  // ---------- History rendering ----------
  function formatDateHeading(d){
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    if(d.toDateString() === today.toDateString()) return 'আজ';
    if(d.toDateString() === yest.toDateString()) return 'গতকাল';
    return d.toLocaleDateString('bn-BD', { day:'numeric', month:'long', year:'numeric' });
  }

  function renderHistory(){
    const liveCount = state.count;
    const entries = state.history.slice().sort((a,b) => b.endedAt - a.endedAt);

    if(entries.length === 0 && liveCount === 0){
      historyList.innerHTML = '<p class="history-empty">এখনও কোনো গণনার রেকর্ড নেই</p>';
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
        count: liveCount,
        target: state.isFree ? 0 : state.target,
        isFree: state.isFree,
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
    const timeStr = d.toLocaleTimeString('bn-BD', { hour:'numeric', minute:'2-digit' });
    const targetTxt = item.isFree ? 'মুক্ত গণনা' : `লক্ষ্য ${toBn(item.target)}`;
    const liveTag = isLive ? '<span class="live-tag">চলমান</span>' : '';
    return `<div class="history-item${isLive ? ' live' : ''}">
      <div>
        <div class="h-name">${item.name} ${liveTag}</div>
        <div class="h-meta">${timeStr} • ${targetTxt}</div>
      </div>
      <div class="h-count">${toBn(item.count)}</div>
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
  const dayNames = ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'];

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

    statStreak.textContent = toBn(state.streak);
    statWeekTotal.textContent = toBn(weekTotal);
    statBestDay.textContent = toBn(bestDay);
    statAvgDay.textContent = toBn(avgDay);

    const todayKey = dateKey(new Date());
    weekChart.innerHTML = days.map(d => {
      const heightPct = Math.max((d.count / maxVal) * 100, d.count > 0 ? 6 : 2);
      const isToday = d.key === todayKey;
      const dayLabel = dayNames[d.date.getDay()];
      return `<div class="bar-col${isToday ? ' is-today' : ''}">
        ${d.count > 0 ? `<span class="bar-val">${toBn(d.count)}</span>` : ''}
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
    vibrateToggle.checked = state.vibrate;
    soundToggle.checked = state.sound;
    soundStyleRow.style.display = state.sound ? '' : 'none';
    autoRoundToggle.checked = state.autoRound;
    celebrateToggle.checked = state.celebrate;
    dailyGoalInput.value = state.dailyGoal;

    soundChips.forEach(c => c.classList.toggle('active', c.dataset.sound === state.soundStyle));

    applyTheme();
    buildMilestoneDots();
    checkStreak();
    render();
  }

  init();
})();
