/* ==========================================================================
   LAVIENTRA STUDIO | v2.0 Operations & Analytics Script
   ========================================================================== */

// 1. SUPABASE CREDENTIALS & INITIALIZATION
const SUPABASE_URL = "https://jaxzghosalfjmconowgm.supabase.co";
const SUPABASE_KEY = "sb_publishable_eQQaWNyP0wswrsy98OD_uw_2nlFz4-e";
const TABLE_NAME = "jobs";

let _supabase = null;
if (window.supabase) {
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Global State
let allJobs = [];
let slClockInterval = null;
let userOverrodeTime = false;
let userOverrodeDate = false;
let isShiftManuallyOverridden = false;
let toastTimer = null;

// Client Management Constants
const DEFAULT_CLIENTS = [
  { name: 'Criss', region: 'UK' },
  { name: 'Peter', region: 'UK' },
  { name: 'Scott', region: 'UK' },
  { name: 'Robert', region: 'UK' },
  { name: 'Jems', region: 'UK' },
  { name: 'Lenin', region: 'UK' },
  { name: 'David', region: 'UK' },
  { name: 'Lee', region: 'UK' },
  { name: 'Martin', region: 'UK' },
  { name: 'London House', region: 'UK' },
  { name: 'Andrew', region: 'AUS' },
  { name: 'Tonny', region: 'AUS' }
];

let clientList = [];

// 2. MISTAKE PENALTIES DICTIONARY
const MISTAKE_DEDUCTIONS_MAP = {
  "None": 0, "none": 0,
  "Address": 300, "add": 300,
  "North Point": 300, "np": 300,
  "Floor Label": 300, "fl": 300,
  "Measurements": 300, "mmnt": 300,
  "Area": 200, "area": 200,
  "Label": 100, "lbl": 100,
  "Under Stair RH": 25, "rh": 25,
  "Template": 25, "tmp": 25,
  "Entrance Arrow": 25, "earrow": 25,
  "Arrow Head": 25, "arrow": 25,
  "Room Parts": 25, "prt": 25,
  "Door & Window": 25, "dw": 25
};

// 3. SRI LANKA TIME & CLOCK HELPERS (Asia/Colombo)
function getSriLankaTimeObj() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const p = {};
  parts.forEach(pt => { p[pt.type] = pt.value; });

  const dateStr = `${p.year}-${p.month}-${p.day}`;
  const timeStr = `${p.hour}:${p.minute}`;

  const slDateObj = new Date(`${dateStr}T${timeStr}:00`);
  const dayOfWeek = isNaN(slDateObj.getDay()) ? now.getDay() : slDateObj.getDay();

  return { dateStr, timeStr, dayOfWeek };
}

function autoCheckNightWeekend() {
  if (isShiftManuallyOverridden) return;

  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('job_time');
  const shiftCheckbox = document.getElementById('is_night_or_weekend');

  if (!shiftCheckbox) return;

  const dateVal = dateInput ? dateInput.value : getSriLankaTimeObj().dateStr;
  const timeVal = timeInput ? timeInput.value : getSriLankaTimeObj().timeStr;

  let isNightOrWeekend = false;

  if (dateVal) {
    const dateObj = new Date(dateVal + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      isNightOrWeekend = true;
    } else if (timeVal) {
      const timeParts = timeVal.split(':');
      const hour = parseInt(timeParts[0], 10) || 0;
      const min = parseInt(timeParts[1], 10) || 0;
      const minutesFromMidnight = hour * 60 + min;

      const dayStartMinutes = 7 * 60;   // 07:00 AM
      const dayEndMinutes = 17 * 60;   // 05:00 PM

      isNightOrWeekend = !(minutesFromMidnight >= dayStartMinutes && minutesFromMidnight < dayEndMinutes);
    }
  }

  shiftCheckbox.checked = isNightOrWeekend;
  updateOptionToggleUI('is_night_or_weekend');
}

function updateLiveClockWidget() {
  const now = new Date();

  // 1. Live Time (12-hour format e.g. "10:50:21 AM")
  const clockTimeEl = document.getElementById('live_clock_time');
  if (clockTimeEl) {
    clockTimeEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  // 2. Live Date Header (e.g. "Thursday, August 13, 2026")
  const clockDateEl = document.getElementById('live_clock_date');
  if (clockDateEl) {
    clockDateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // 3. Market Timezones (London & Sydney)
  const tzLondonEl = document.getElementById('tz_london');
  if (tzLondonEl) {
    tzLondonEl.textContent = now.toLocaleTimeString('en-US', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const tzSydneyEl = document.getElementById('tz_sydney');
  if (tzSydneyEl) {
    tzSydneyEl.textContent = now.toLocaleTimeString('en-US', {
      timeZone: 'Australia/Sydney',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  // 4. Live Shift / Sync Badge
  const statusBadgeEl = document.getElementById('live_status_badge');
  if (statusBadgeEl) {
    const sl = getSriLankaTimeObj();
    const slHour = parseInt(sl.timeStr.split(':')[0], 10);
    const isDayShift = (slHour >= 7 && slHour < 17);
    if (isDayShift) {
      statusBadgeEl.className = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-[10px] rounded-full font-medium flex items-center gap-1.5 shrink-0";
      statusBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>DAY SHIFT ACTIVE</span>`;
    } else {
      statusBadgeEl.className = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 text-[10px] rounded-full font-medium flex items-center gap-1.5 shrink-0";
      statusBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span><span>NIGHT SHIFT ACTIVE</span>`;
    }
  }
}

function startSriLankaClock() {
  if (slClockInterval) clearInterval(slClockInterval);

  const tick = () => {
    updateLiveClockWidget();

    const sl = getSriLankaTimeObj();
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('job_time');

    if (dateInput && document.activeElement !== dateInput && !userOverrodeDate) {
      dateInput.value = sl.dateStr;
    }

    if (timeInput && document.activeElement !== timeInput && !userOverrodeTime) {
      timeInput.value = sl.timeStr;
    }

    autoCheckNightWeekend();
  };

  tick();
  slClockInterval = setInterval(tick, 1000);
}

// 4. TOGGLE BUTTONS & UI INTERACTION
function toggleOption(fieldId) {
  const checkbox = document.getElementById(fieldId);
  if (!checkbox) return;

  if (fieldId === 'is_night_or_weekend') {
    isShiftManuallyOverridden = true;
  }

  checkbox.checked = !checkbox.checked;
  updateOptionToggleUI(fieldId);
}

function updateOpContextStrip() {
  const cb = document.getElementById('is_night_or_weekend');
  const isNight = cb?.checked;

  const shiftTextEl = document.getElementById('op_shift_text');
  const rateTextEl = document.getElementById('op_rate_text');
  const shiftDotEl = document.getElementById('op_shift_dot');

  if (shiftTextEl && rateTextEl) {
    if (isNight) {
      shiftTextEl.textContent = 'NIGHT / WKND SHIFT ACTIVE';
      rateTextEl.textContent = '(Base Rate Applies)';
      if (shiftDotEl) shiftDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse';
    } else {
      shiftTextEl.textContent = 'DAY SHIFT ACTIVE';
      rateTextEl.textContent = '(Standard Office Hours)';
      if (shiftDotEl) shiftDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
    }
  }

  const lastJobEl = document.getElementById('op_last_job');
  if (lastJobEl && allJobs.length > 0) {
    const latest = allJobs[0];
    lastJobEl.textContent = `#${latest.monthlySeqNo} (${latest.address_title || 'Untitled'})`;
  }
}

function updateOptionToggleUI(fieldId) {
  const checkbox = document.getElementById(fieldId);
  if (!checkbox) return;

  let btnId = fieldId === 'is_color' ? 'toggle_color_plan' : 'toggle_night_weekend';
  const btn = document.getElementById(btnId);

  if (btn) {
    if (checkbox.checked) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  updateLivePayoutStrip(false);
  updateOpContextStrip();
}

// 5. CLIENT MANAGEMENT
function loadClients() {
  const saved = localStorage.getItem('lavientra_clients_v2');
  if (saved) {
    try {
      clientList = JSON.parse(saved);
    } catch (e) {
      clientList = DEFAULT_CLIENTS;
    }
  } else {
    clientList = DEFAULT_CLIENTS;
    saveClients();
  }
  renderQuickClientPills();
}

function saveClients() {
  localStorage.setItem('lavientra_clients_v2', JSON.stringify(clientList));
}

function renderQuickClientPills() {
  const container = document.getElementById('quick_client_pills');
  if (!container) return;

  const ukClients = clientList.filter(c => c.region === 'UK');
  const ausClients = clientList.filter(c => c.region === 'AUS');

  let html = '';

  if (ukClients.length > 0) {
    html += `
      <div class="space-y-1.5 mb-2">
        <div class="flex flex-wrap items-center gap-1.5">
          ${ukClients.map(c => `
            <button type="button" onclick="selectQuickClient('${c.name.replace(/'/g, "\\'")}', '${c.region}', this)" class="client-pill">
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (ausClients.length > 0) {
    html += `
      <div class="space-y-1.5 mb-2 border-t border-zinc-800/60 pt-2">
        <div class="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">
          <span>AUS Market</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${ausClients.map(c => `
            <button type="button" onclick="selectQuickClient('${c.name.replace(/'/g, "\\'")}', '${c.region}', this)" class="client-pill">
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function selectQuickClient(name, region, btnEl) {
  const clientInput = document.getElementById('client_name');
  const regionSelect = document.getElementById('region');
  const badgeEl = document.getElementById('selected_client_badge');

  if (clientInput) clientInput.value = name;
  if (regionSelect && region) regionSelect.value = region;

  if (badgeEl) {
    badgeEl.textContent = `${name} (${region})`;
    badgeEl.classList.remove('hidden');
  }

  document.querySelectorAll('.client-pill').forEach(b => b.classList.remove('active'));

  if (btnEl) {
    btnEl.classList.add('active');
  }

  autoCheckNightWeekend();
  updateLivePayoutStrip(false);
}

function openClientModal() {
  const modal = document.getElementById('clientModalBackdrop');
  if (modal) {
    renderModalClientList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeClientModal() {
  const modal = document.getElementById('clientModalBackdrop');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderModalClientList() {
  const listEl = document.getElementById('modal_client_list');
  if (!listEl) return;

  if (clientList.length === 0) {
    listEl.innerHTML = `<div class="p-3 text-center text-zinc-500 text-sm">No clients added.</div>`;
    return;
  }

  listEl.innerHTML = clientList.map((c, idx) => `
    <div class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/60">
      <div class="flex items-center gap-2.5">
        <span class="text-zinc-100 font-medium text-sm">${c.name}</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300">${c.region}</span>
      </div>
      <button type="button" onclick="deleteClient(${idx})" class="text-red-400 hover:text-red-300 p-1.5 transition-colors bg-red-400/10 hover:bg-red-400/20 rounded-md" title="Delete Client">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function handleAddClient(e) {
  e.preventDefault();
  const nameInput = document.getElementById('new_client_name');
  const regionSelect = document.getElementById('new_client_region');

  const name = nameInput ? nameInput.value.trim() : '';
  const region = regionSelect ? regionSelect.value : 'UK';

  if (!name) return;

  if (clientList.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast("Client already exists in list", true);
    return;
  }

  clientList.push({ name, region });
  saveClients();
  renderQuickClientPills();
  renderModalClientList();

  if (nameInput) nameInput.value = '';
  showToast(`Added client "${name}"`);
}

function deleteClient(index) {
  if (index < 0 || index >= clientList.length) return;
  const removed = clientList.splice(index, 1);
  saveClients();
  renderQuickClientPills();
  renderModalClientList();
  showToast(`Deleted client "${removed[0]?.name}"`);
}

// 6. EXACT CALCULATION ENGINE
function calculatePricing(data, totalJobCount) {
  const is_color = Boolean(data.is_color);
  const is_night_or_weekend = Boolean(data.is_night_or_weekend);
  const area_sqft = parseFloat(data.area_sqft || data.area) || 0;
  const region = (data.region || 'UK').toUpperCase();
  const mistake_type = data.mistake_type || "None";

  // 1. Color Floorplan Tiered Pricing (Applies to all jobs)
  let colorPrice = 0;
  if (is_color) {
    colorPrice = 25 + Math.floor(Math.max(0, area_sqft - 1) / 1000) * 25;
  }

  // 2. Extra Area Bonus (> 2500 sqft) (Applies to all jobs)
  let extraAreaBonus = 0;
  if (area_sqft > 2500) {
    extraAreaBonus = (area_sqft - 2500) * 0.25;
  }

  // 3. Region Base Rates (Applies to Post-100 jobs OR Night/Weekend jobs)
  // For 1-100 Daytime jobs in office time: basePrice remains 0 LKR!
  let basePrice = 0;
  const isBasePriceEligible = (totalJobCount >= 100) || is_night_or_weekend;

  if (isBasePriceEligible) {
    if (region === 'AUS') {
      if (area_sqft <= 1000) basePrice = 350;
      else if (area_sqft <= 2000) basePrice = 400;
      else basePrice = 475; // Base price caps at 475 LKR for > 2000 sqft
    } else {
      // Default UK Region
      if (area_sqft <= 1000) basePrice = 300;
      else if (area_sqft <= 2000) basePrice = 350;
      else basePrice = 400; // Base price caps at 400 LKR for > 2000 sqft
    }
  }

  // 4. No-Mistake Bonus (+25 LKR) & Deduction Penalty
  const isClean = (!mistake_type || mistake_type === 'None' || mistake_type === 'none');
  const no_mistake_amount = isClean ? 25 : 0;
  const ddt_amount = isClean ? 0 : (MISTAKE_DEDUCTIONS_MAP[mistake_type] || 0);

  // 5. Monthly Target Bonus (+50 LKR if total jobs >= 170)
  const targetBonus = totalJobCount >= 170 ? 50 : 0;

  // 6. Net Total Calculation
  const total = basePrice + colorPrice + extraAreaBonus + no_mistake_amount + targetBonus - ddt_amount;

  return {
    price: basePrice + colorPrice + extraAreaBonus,
    basePrice,
    colorPrice,
    extraAreaBonus,
    no_mistake_amount,
    ddt_amount,
    targetBonus,
    total
  };
}

// PRO GOOGLE-STYLE DATE PICKER POPOVER STATE & LOGIC
let currentGlobalDateFilter = 'current_month';
let customFilteredYear = 2026;
let customFilteredMonthIdx = 7; // 0-indexed (7 = August)
let drilldownMode = 'month'; // 'month' or 'year'

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let activeAdvDateFilterTab = null;

function toggleDatePickerPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('date_picker_popover');
  if (!popover) return;
  const isHidden = popover.classList.contains('hidden');
  if (isHidden) {
    popover.classList.remove('hidden');
    popover.classList.add('flex', 'popover-animate-in');
    setAdvancedDateFilterTab(activeAdvDateFilterTab);
  } else {
    popover.classList.add('hidden');
    popover.classList.remove('flex', 'popover-animate-in');
  }
}

function closeDatePickerPopover() {
  const popover = document.getElementById('date_picker_popover');
  if (popover) {
    popover.classList.add('hidden');
    popover.classList.remove('flex', 'popover-animate-in');
  }
}

function setAdvancedDateFilterTab(tabKey) {
  if (activeAdvDateFilterTab === tabKey && tabKey !== null) {
    // Toggling off the active tab if clicked again
    activeAdvDateFilterTab = null;
  } else {
    activeAdvDateFilterTab = tabKey;
  }

  ['year', 'month', 'date'].forEach(k => {
    const btn = document.getElementById(`adv_tab_${k}`);
    const panel = document.getElementById(`adv_panel_${k}`);
    if (!btn || !panel) return;

    if (k === activeAdvDateFilterTab) {
      btn.className = "flex-1 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm flex items-center justify-center gap-1 active:scale-95";
      if (k === 'date') {
        panel.className = "block p-1 mt-1";
      } else {
        panel.className = `grid ${k === 'year' ? 'grid-cols-2' : 'grid-cols-4'} gap-1.5 p-1 mt-1`;
      }
    } else {
      btn.className = "flex-1 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1 active:scale-95";
      panel.className = "hidden";
    }
  });

  if (activeAdvDateFilterTab === 'year') renderAdvancedYearGrid();
  if (activeAdvDateFilterTab === 'month') renderPopover12MonthGrid();
}

function renderAdvancedYearGrid() {
  const container = document.getElementById('adv_panel_year');
  if (!container) return;

  const years = [2024, 2025, 2026, 2027];
  container.innerHTML = years.map(y => {
    const isActive = (currentGlobalDateFilter === 'custom_year' && customFilteredYear === y);
    const activeClass = "py-1.5 bg-zinc-100 text-zinc-950 font-bold border border-zinc-100 text-xs rounded-lg text-center shadow-sm cursor-pointer active:scale-95";
    const normalClass = "py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-300 text-xs rounded-lg font-medium text-center cursor-pointer active:scale-95";

    return `
      <button type="button" onclick="selectAdvancedYear(${y})"
        class="${isActive ? activeClass : normalClass}">
        ${y}
      </button>
    `;
  }).join('');
}

function selectAdvancedYear(yearVal) {
  customFilteredYear = yearVal;
  currentGlobalDateFilter = 'custom_year';
  renderAdvancedYearGrid();
  updatePresetPillsUI();
  updateTriggerButtonLabel();
  updateKPICards();
  renderJobSheetTable();
  closeDatePickerPopover();
}

function renderPopover12MonthGrid() {
  const container = document.getElementById('adv_panel_month');
  if (!container) return;

  const currentSlMonth = parseInt(getSriLankaTimeObj().dateStr.substring(5, 7), 10) - 1;

  container.innerHTML = MONTH_NAMES_SHORT.map((mShort, idx) => {
    const isActive = (currentGlobalDateFilter === 'custom_month' && customFilteredMonthIdx === idx);
    const isCurrent = (currentSlMonth === idx);
    const activeClass = "bg-zinc-100 text-zinc-950 font-bold border-zinc-100 shadow-sm";
    const currentClass = "bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold";
    const normalClass = "bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-300 font-medium";

    const itemClass = isActive ? activeClass : (isCurrent ? currentClass : normalClass);

    return `
      <button type="button" onclick="selectPopoverMonth(${idx})"
        class="${itemClass} text-xs py-1.5 rounded-lg text-center active:scale-95 cursor-pointer">
        ${mShort}
      </button>
    `;
  }).join('');
}

function selectPopoverMonth(monthIdx) {
  customFilteredMonthIdx = monthIdx;
  currentGlobalDateFilter = 'custom_month';
  renderPopover12MonthGrid();
  updatePresetPillsUI();
  updateTriggerButtonLabel();
  updateKPICards();
  renderJobSheetTable();
  closeDatePickerPopover();
}

let selectedSpecificSingleDateVal = '';

function triggerNativeDatePicker() {
  const dateInput = document.getElementById('popover_specific_date_picker');
  if (dateInput) {
    if (dateInput.showPicker) {
      try { dateInput.showPicker(); } catch (e) { }
    } else {
      dateInput.focus();
    }
  }
}

function selectSpecificSingleDate(dateVal) {
  if (!dateVal) return;
  selectedSpecificSingleDateVal = dateVal;
  currentGlobalDateFilter = 'custom_single_date';
  updatePresetPillsUI();
  updateTriggerButtonLabel();
  updateKPICards();
  renderJobSheetTable();
  closeDatePickerPopover();
}

function updatePresetPillsUI() {
  const presets = ['current_month', 'last_month', 'last_3_months', 'this_year', 'all_time'];
  presets.forEach(p => {
    const btn = document.getElementById(`preset_${p}`);
    if (!btn) return;
    const checkIcon = btn.querySelector('.preset-check-icon');
    if (currentGlobalDateFilter === p) {
      btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-100 bg-zinc-900 border border-zinc-800/80 transition-all flex items-center justify-between";
      if (checkIcon) checkIcon.classList.remove('hidden');
    } else {
      btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 transition-all flex items-center justify-between";
      if (checkIcon) checkIcon.classList.add('hidden');
    }
  });
}

function updateTriggerButtonLabel() {
  const triggerLabel = document.getElementById('date_picker_trigger_label');
  if (!triggerLabel) return;

  const sl = getSriLankaTimeObj();
  const currentYearStr = sl.dateStr.substring(0, 4);

  if (currentGlobalDateFilter === 'current_month') {
    const mName = MONTH_NAMES_FULL[parseInt(sl.dateStr.substring(5, 7), 10) - 1];
    triggerLabel.textContent = `This Month (${mName} ${currentYearStr})`;
  } else if (currentGlobalDateFilter === 'last_month') {
    let year = parseInt(currentYearStr, 10);
    let monthIdx = parseInt(sl.dateStr.substring(5, 7), 10) - 2;
    if (monthIdx < 0) { monthIdx = 11; year -= 1; }
    triggerLabel.textContent = `Last Month (${MONTH_NAMES_FULL[monthIdx]} ${year})`;
  } else if (currentGlobalDateFilter === 'last_3_months') {
    triggerLabel.textContent = `Last 3 Months`;
  } else if (currentGlobalDateFilter === 'this_year') {
    triggerLabel.textContent = `This Year (${currentYearStr})`;
  } else if (currentGlobalDateFilter === 'all_time') {
    triggerLabel.textContent = `All Time`;
  } else if (currentGlobalDateFilter === 'custom_year') {
    triggerLabel.textContent = `Year ${customFilteredYear}`;
  } else if (currentGlobalDateFilter === 'custom_month') {
    triggerLabel.textContent = `${MONTH_NAMES_FULL[customFilteredMonthIdx]} ${customFilteredYear}`;
  } else if (currentGlobalDateFilter === 'custom_single_date' && selectedSpecificSingleDateVal) {
    const d = new Date(selectedSpecificSingleDateVal + 'T00:00:00');
    const formattedDate = `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    triggerLabel.textContent = `${formattedDate}`;
  }
}

function selectDatePreset(presetKey) {
  currentGlobalDateFilter = presetKey;
  renderPopover12MonthGrid();
  renderAdvancedYearGrid();
  updatePresetPillsUI();
  updateTriggerButtonLabel();
  updateKPICards();
  renderJobSheetTable();
  closeDatePickerPopover();
}

function getFilteredJobsForCurrentRange() {
  if (!allJobs || allJobs.length === 0) return [];
  const slTodayStr = getSriLankaTimeObj().dateStr;
  const currentYearStr = slTodayStr.substring(0, 4);
  const currentMonthStr = slTodayStr.substring(0, 7);

  if (currentGlobalDateFilter === 'all_time') {
    return allJobs;
  }

  if (currentGlobalDateFilter === 'current_month') {
    return allJobs.filter(j => j.date && j.date.startsWith(currentMonthStr));
  }

  if (currentGlobalDateFilter === 'last_month') {
    let year = parseInt(currentYearStr, 10);
    let month = parseInt(slTodayStr.substring(5, 7), 10) - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const lmStr = `${year}-${String(month).padStart(2, '0')}`;
    return allJobs.filter(j => j.date && j.date.startsWith(lmStr));
  }

  if (currentGlobalDateFilter === 'last_3_months') {
    const nowD = new Date(slTodayStr + 'T00:00:00');
    nowD.setMonth(nowD.getMonth() - 3);
    const cutoffStr = nowD.toISOString().substring(0, 10);
    return allJobs.filter(j => j.date && j.date >= cutoffStr);
  }

  if (currentGlobalDateFilter === 'this_year') {
    return allJobs.filter(j => j.date && j.date.startsWith(currentYearStr));
  }

  if (currentGlobalDateFilter === 'custom_year') {
    const yStr = String(customFilteredYear);
    return allJobs.filter(j => j.date && j.date.startsWith(yStr));
  }

  if (currentGlobalDateFilter === 'custom_month') {
    const padMonth = String(customFilteredMonthIdx + 1).padStart(2, '0');
    const targetMonthStr = `${customFilteredYear}-${padMonth}`;
    return allJobs.filter(j => j.date && j.date.startsWith(targetMonthStr));
  }

  if (currentGlobalDateFilter === 'custom_single_date' && selectedSpecificSingleDateVal) {
    return allJobs.filter(j => j.date === selectedSpecificSingleDateVal);
  }

  return allJobs;
}

// 7. SUPABASE FETCH & KPI RENDER
async function fetchAllData() {
  if (!_supabase) return;

  try {
    const { data, error } = await _supabase
      .from(TABLE_NAME)
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    const rawData = data || [];

    // Sort chronological (oldest to newest) to assign 1..N per month
    const chronologicalJobs = [...rawData].reverse();
    const monthJobCounts = {};
    const seqMap = new Map();

    chronologicalJobs.forEach(job => {
      const monthKey = (job.date || '').substring(0, 7) || 'general';
      monthJobCounts[monthKey] = (monthJobCounts[monthKey] || 0) + 1;
      seqMap.set(job.id, monthJobCounts[monthKey]);
    });

    allJobs = rawData.map((j) => ({
      ...j,
      monthlySeqNo: seqMap.get(j.id) || 1,
      area_sqft: Number(j.area_sqft ?? j.area ?? 0),
      is_color: Boolean(j.is_color ?? j.isColor ?? false),
      is_night_or_weekend: Boolean(j.is_night_or_weekend ?? j.is_night_weekend ?? false),
    }));

    updateKPICards();
    updateOpContextStrip();

  } catch (err) {
    console.error("Fetch Error:", err);
    showToast("Failed to connect to database");
  }
}

function updateKPICards() {
  const slTodayStr = getSriLankaTimeObj().dateStr;
  const currentMonthStr = slTodayStr.substring(0, 7);

  // 1. HOME TAB OPERATIONAL METRICS (Always fixed to Today & Current Month)
  const todayJobs = allJobs.filter(j => j.date === slTodayStr);
  const monthJobs = allJobs.filter(j => j.date && j.date.startsWith(currentMonthStr));

  const totalCount = allJobs.length;
  const monthCount = monthJobs.length;

  document.getElementById('stat_today_jobs').textContent = todayJobs.length;
  document.getElementById('stat_month_jobs').textContent = monthJobs.length;

  // Target 170 (Home Tab Hero Card)
  const targetGoal = 170;
  const targetPct = Math.min(100, Math.round((monthCount / targetGoal) * 100));
  document.getElementById('target_hero_count').textContent = monthCount;
  document.getElementById('target_percentage_label').textContent = `${targetPct}%`;
  document.getElementById('target_progress_fill').style.width = `${targetPct}%`;

  const targetBadge = document.getElementById('target_status_badge');
  if (targetBadge) {
    if (monthCount >= targetGoal) {
      targetBadge.textContent = "Unlocked";
      targetBadge.className = "px-2 py-0.5 rounded bg-zinc-100 text-zinc-950 font-bold text-[10px]";
    } else {
      targetBadge.textContent = `${monthCount} / 170`;
    }
  }

  // Shift Breakdown (Home Tab)
  let tDayCount = 0, tNightCount = 0;
  todayJobs.forEach(j => j.is_night_or_weekend ? tNightCount++ : tDayCount++);
  document.getElementById('today_day_count').textContent = tDayCount;
  document.getElementById('today_night_count').textContent = tNightCount;
  const tTotal = todayJobs.length || 1;
  document.getElementById('today_day_bar').style.width = `${(tDayCount / tTotal) * 100}%`;
  document.getElementById('today_night_bar').style.width = `${(tNightCount / tTotal) * 100}%`;

  let mDayCount = 0, mNightCount = 0;
  monthJobs.forEach(j => j.is_night_or_weekend ? mNightCount++ : mDayCount++);
  document.getElementById('month_day_count').textContent = mDayCount;
  document.getElementById('month_night_count').textContent = mNightCount;
  const mTotal = monthJobs.length || 1;
  document.getElementById('month_day_bar').style.width = `${(mDayCount / mTotal) * 100}%`;
  document.getElementById('month_night_bar').style.width = `${(mNightCount / mTotal) * 100}%`;

  // Top Client Today
  const clientCountsToday = {};
  todayJobs.forEach(j => {
    const c = j.client_name || 'Unknown';
    clientCountsToday[c] = (clientCountsToday[c] || 0) + 1;
  });
  let topClientName = 'None';
  let topClientCount = 0;
  Object.entries(clientCountsToday).forEach(([cName, cnt]) => {
    if (cnt > topClientCount) {
      topClientName = cName;
      topClientCount = cnt;
    }
  });
  document.getElementById('bento_total_area').textContent = topClientCount > 0 ? `${topClientName} (${topClientCount})` : 'None';

  // Clean Rate
  const cleanJobsCount = allJobs.filter(j => !j.mistake_type || j.mistake_type === 'None' || j.mistake_type === 'none').length;
  const cleanRate = totalCount > 0 ? Math.round((cleanJobsCount / totalCount) * 100) : 100;
  document.getElementById('bento_clean_rate').textContent = `${cleanRate}%`;

  // 2. DASHBOARD TAB & CHARTS METRICS (Dynamically updated by Global Date Filter)
  const rangeJobs = getFilteredJobsForCurrentRange();
  const rangeCount = rangeJobs.length;
  const rangeTargetPct = Math.min(100, Math.round((rangeCount / targetGoal) * 100));

  let rDayCount = 0, rNightCount = 0;
  rangeJobs.forEach(j => j.is_night_or_weekend ? rNightCount++ : rDayCount++);

  const dashTargetBadge = document.getElementById('dash_target_badge');
  if (dashTargetBadge) dashTargetBadge.textContent = `${rangeCount} / 170`;

  const dashTargetLabel = document.getElementById('dash_target_count_label');
  if (dashTargetLabel) dashTargetLabel.textContent = `${rangeCount} Jobs Completed`;

  const dashTargetPct = document.getElementById('dash_target_pct');
  if (dashTargetPct) dashTargetPct.textContent = `${rangeTargetPct}% Completed`;

  const dashTargetBar = document.getElementById('dash_target_bar');
  if (dashTargetBar) dashTargetBar.style.width = `${rangeTargetPct}%`;

  const dashTargetRem = document.getElementById('dash_target_remaining');
  if (dashTargetRem) dashTargetRem.textContent = `${Math.max(0, 170 - rangeCount)} Remaining to Goal`;

  const dashSubTotal = document.getElementById('dash_sub_total_jobs');
  if (dashSubTotal) dashSubTotal.textContent = `${rangeCount} Jobs`;

  const dashSubDay = document.getElementById('dash_sub_day_jobs');
  if (dashSubDay) dashSubDay.textContent = `${rDayCount} Jobs`;

  const dashSubNight = document.getElementById('dash_sub_night_jobs');
  if (dashSubNight) dashSubNight.textContent = `${rNightCount} Jobs`;

  // UK & AUS Market Breakdown for Dashboard
  let ukSqftTotal = 0, ausSqftTotal = 0;
  let ukJobsCount = 0, ausJobsCount = 0;

  rangeJobs.forEach(j => {
    if ((j.region || 'UK').toUpperCase() === 'AUS') {
      ausJobsCount++;
      ausSqftTotal += Number(j.area_sqft || 0);
    } else {
      ukJobsCount++;
      ukSqftTotal += Number(j.area_sqft || 0);
    }
  });

  const dashUkCnt = document.getElementById('dash_uk_jobs_cnt');
  if (dashUkCnt) dashUkCnt.textContent = `${ukJobsCount} jobs`;

  const dashUkSqft = document.getElementById('dash_uk_sqft');
  if (dashUkSqft) dashUkSqft.innerHTML = `${ukSqftTotal.toLocaleString()} <span class="text-zinc-400">Sq.Ft</span>`;

  const dashAusCnt = document.getElementById('dash_aus_jobs_cnt');
  if (dashAusCnt) dashAusCnt.textContent = `${ausJobsCount} jobs`;

  const dashAusSqft = document.getElementById('dash_aus_sqft');
  if (dashAusSqft) dashAusSqft.innerHTML = `${ausSqftTotal.toLocaleString()} <span class="text-zinc-400">Sq.Ft</span>`;

  // MoM Growth Calculation
  const now = new Date();
  const prevMonthObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = prevMonthObj.toISOString().substring(0, 7);
  const prevMonthJobs = allJobs.filter(j => j.date && j.date.startsWith(prevMonthStr));

  let momPct = 0;
  if (prevMonthJobs.length > 0) {
    momPct = Math.round(((rangeCount - prevMonthJobs.length) / prevMonthJobs.length) * 100);
  } else if (rangeCount > 0) {
    momPct = 100;
  }

  const dashMomBadge = document.getElementById('dash_mom_badge');
  if (dashMomBadge) {
    const icon = momPct >= 0 ? 'trending-up' : 'trending-down';
    const sign = momPct >= 0 ? '+' : '';
    dashMomBadge.innerHTML = `<i data-lucide="${icon}" class="w-3 h-3 text-zinc-400"></i> <span>${sign}${momPct}% vs Prev Month</span>`;
  }

  // Row 3: Card 1 (Weekly Peak Days Chart - Vertical Columns)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekCounts = [0, 0, 0, 0, 0, 0, 0];
  rangeJobs.forEach(j => {
    if (!j.date) return;
    const d = new Date(j.date + 'T00:00:00');
    const dayIdx = d.getDay();
    const convertedIdx = dayIdx === 0 ? 6 : dayIdx - 1;
    weekCounts[convertedIdx]++;
  });

  const maxWeekVal = Math.max(...weekCounts, 1);
  const weeklyChartEl = document.getElementById('dash_weekly_chart');
  if (weeklyChartEl) {
    weeklyChartEl.innerHTML = dayNames.map((name, idx) => {
      const cnt = weekCounts[idx];
      const barHeightPct = Math.max(12, Math.round((cnt / maxWeekVal) * 100));
      return `
        <div class="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group" title="${name}: ${cnt} jobs">
          <span class="text-[9px] font-bold text-zinc-400 group-hover:text-zinc-100 transition-colors">${cnt}</span>
          <div class="w-full bg-zinc-800 rounded-t-md overflow-hidden flex flex-col justify-end" style="height: ${barHeightPct}%;">
            <div class="w-full bg-zinc-200 group-hover:bg-white transition-all h-full"></div>
          </div>
          <span class="text-[10px] font-medium text-zinc-500 uppercase mt-1">${name}</span>
        </div>
      `;
    }).join('');
  }

  // Row 3: Card 2 (Monthly Peak Trends - SVG Smooth Sparkline Chart)
  const monthlyDateCounts = {};
  rangeJobs.forEach(j => {
    if (!j.date) return;
    monthlyDateCounts[j.date] = (monthlyDateCounts[j.date] || 0) + 1;
  });

  const sortedDates = Object.entries(monthlyDateCounts).sort((a, b) => a[0].localeCompare(b[0]));
  const monthlyPeaksEl = document.getElementById('dash_monthly_peaks');

  if (monthlyPeaksEl) {
    if (sortedDates.length < 2) {
      monthlyPeaksEl.innerHTML = `
        <div class="py-6 flex flex-col items-center justify-center text-center">
          <span class="text-xs text-zinc-400 font-semibold mb-1">Volume Baseline Active</span>
          <span class="text-[11px] text-zinc-500">${monthCount} jobs recorded in ${slTodayStr.substring(0, 7)}</span>
        </div>
      `;
    } else {
      const maxVal = Math.max(...sortedDates.map(d => d[1]), 1);
      const points = sortedDates.map(([dt, cnt], idx) => {
        const x = Math.round((idx / (sortedDates.length - 1)) * 260) + 20;
        const y = 60 - Math.round((cnt / maxVal) * 45);
        return { x, y, cnt, dt };
      });

      // SVG Path line construction
      let dPath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const cx = (p1.x + p2.x) / 2;
        dPath += ` C ${cx} ${p1.y}, ${cx} ${p2.y}, ${p2.x} ${p2.y}`;
      }

      const areaPath = `${dPath} L ${points[points.length - 1].x} 70 L ${points[0].x} 70 Z`;

      const topThree = [...sortedDates].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const topLabels = topThree.map(([dt, cnt]) => {
        const dObj = new Date(dt + 'T00:00:00');
        return `${dObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} (${cnt})`;
      }).join(' • ');

      monthlyPeaksEl.innerHTML = `
        <div class="relative w-full h-24 my-1">
          <svg viewBox="0 0 300 75" class="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="sparkline_grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#sparkline_grad)" />
            <path d="${dPath}" fill="none" stroke="#e4e4e7" stroke-width="2" stroke-linecap="round" />
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" class="fill-zinc-950 stroke-zinc-100 stroke-2" />`).join('')}
          </svg>
        </div>
        <div class="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
          <span class="text-zinc-500 font-medium">Peak Dates:</span>
          <span class="text-zinc-300 font-bold">${topLabels}</span>
        </div>
      `;
    }
  }

  // Row 3: Card 3 (Peak Submission Hours - Horizontal Opacity Fill Blocks)
  let morningCnt = 0, afternoonCnt = 0, eveningCnt = 0, nightCnt = 0;
  allJobs.forEach(j => {
    if (!j.job_time) return;
    const hour = parseInt(j.job_time.split(':')[0], 10) || 0;
    if (hour >= 6 && hour < 12) morningCnt++;
    else if (hour >= 12 && hour < 18) afternoonCnt++;
    else if (hour >= 18 && hour < 24) eveningCnt++;
    else nightCnt++;
  });

  const timeWindows = [
    { label: 'Morning (06:00 - 12:00)', cnt: morningCnt, fillClass: 'bg-zinc-100' },
    { label: 'Afternoon (12:00 - 18:00)', cnt: afternoonCnt, fillClass: 'bg-zinc-300' },
    { label: 'Evening (18:00 - 00:00)', cnt: eveningCnt, fillClass: 'bg-zinc-400' },
    { label: 'Night (00:00 - 06:00)', cnt: nightCnt, fillClass: 'bg-zinc-600' },
  ];

  const maxHourCnt = Math.max(...timeWindows.map(w => w.cnt), 1);
  const hourlyChartEl = document.getElementById('dash_hourly_chart');
  if (hourlyChartEl) {
    hourlyChartEl.innerHTML = timeWindows.map(w => {
      const pct = Math.max(8, Math.round((w.cnt / maxHourCnt) * 100));
      return `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-zinc-400 font-medium">${w.label}</span>
            <span class="font-bold text-zinc-100">${w.cnt} Jobs</span>
          </div>
          <div class="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div class="${w.fillClass} h-full rounded-full transition-all duration-500" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Table & Salary Statement
  renderJobSheetTable();
  calculateMonthlySalaryStatement();

  if (window.lucide) lucide.createIcons();
}

// SHIFT TYPE SPLIT HELPER LOGIC (DAY, NIGHT, WEEKEND)
function getJobShiftType(job) {
  if (job.shift_type) {
    return String(job.shift_type).toUpperCase();
  }
  if (job.date) {
    const d = new Date(job.date + 'T00:00:00');
    const day = d.getDay();
    if (day === 0 || day === 6) return 'WEEKEND';
  }
  if (job.is_night_or_weekend) return 'NIGHT';
  return 'DAY';
}

// ADVANCED TOOLBAR FILTER STATE & HANDLERS
let jobsheetMarketFilter = 'all';
let jobsheetShiftFilter = 'all';
let jobsheetMinSqftVal = 100;
let jobsheetMaxSqftVal = 20000;

function toggleAreaFilterPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('area_filter_popover');
  if (!popover) return;
  const isHidden = popover.classList.contains('hidden');
  if (isHidden) {
    popover.classList.remove('hidden');
    popover.classList.add('flex', 'popover-animate-in');
  } else {
    popover.classList.add('hidden');
    popover.classList.remove('flex', 'popover-animate-in');
  }
}

function closeAreaFilterPopover() {
  const popover = document.getElementById('area_filter_popover');
  if (popover) {
    popover.classList.add('hidden');
    popover.classList.remove('flex', 'popover-animate-in');
  }
}

function handleAreaSliderInput() {
  const minSlider = document.getElementById('jobsheet_min_sqft_slider');
  const maxSlider = document.getElementById('jobsheet_max_sqft_slider');
  if (!minSlider || !maxSlider) return;

  let minV = parseInt(minSlider.value, 10);
  let maxV = parseInt(maxSlider.value, 10);

  if (minV > maxV) {
    minV = maxV;
    minSlider.value = minV;
  }

  jobsheetMinSqftVal = minV;
  jobsheetMaxSqftVal = maxV;

  // Active filled range bar calculations
  const totalSpan = 20000 - 100;
  const leftPercent = Math.max(0, Math.min(100, ((minV - 100) / totalSpan) * 100));
  const rightPercent = Math.max(0, Math.min(100, ((maxV - 100) / totalSpan) * 100));
  const widthPercent = Math.max(0, rightPercent - leftPercent);

  const fillBar = document.getElementById('area_slider_range_bar');
  if (fillBar) {
    fillBar.style.left = `${leftPercent}%`;
    fillBar.style.width = `${widthPercent}%`;
  }

  const minLabel = document.getElementById('min_sqft_label');
  const maxLabel = document.getElementById('max_sqft_label');
  const rangeDisplay = document.getElementById('area_range_display');
  const popoverLabel = document.getElementById('area_popover_label');

  if (minLabel) minLabel.textContent = `${minV.toLocaleString()} SQFT`;
  if (maxLabel) maxLabel.textContent = `${maxV.toLocaleString()} SQFT`;
  if (rangeDisplay) rangeDisplay.textContent = `${minV.toLocaleString()} SQFT - ${maxV.toLocaleString()} SQFT`;

  if (popoverLabel) {
    if (minV === 100 && maxV === 20000) {
      popoverLabel.textContent = 'Area SQFT';
    } else {
      popoverLabel.textContent = `${minV.toLocaleString()}-${maxV.toLocaleString()} SQFT`;
    }
  }

  renderJobSheetTable();
}

function resetAreaFilter() {
  const minSlider = document.getElementById('jobsheet_min_sqft_slider');
  const maxSlider = document.getElementById('jobsheet_max_sqft_slider');
  if (minSlider) minSlider.value = 100;
  if (maxSlider) maxSlider.value = 20000;
  handleAreaSliderInput();
}

function setJobSheetMarketFilter(marketKey) {
  jobsheetMarketFilter = marketKey;
  ['all', 'uk', 'aus'].forEach(k => {
    const btn = document.getElementById(`js_market_${k}`);
    if (!btn) return;
    if (marketKey.toLowerCase() === k) {
      btn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm";
    } else {
      btn.className = "px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200";
    }
  });
  renderJobSheetTable();
}

function setJobSheetShiftFilter(shiftKey) {
  jobsheetShiftFilter = shiftKey;
  ['all', 'day', 'night', 'weekend'].forEach(k => {
    const btn = document.getElementById(`js_shift_${k}`);
    if (!btn) return;
    if (shiftKey === k) {
      btn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm";
    } else {
      btn.className = "px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200";
    }
  });
  renderJobSheetTable();
}

function handleJobSheetFilterChange() {
  renderJobSheetTable();
}

// 7.4 JOB SHEET TABLE RENDERER
let editingJobId = null;

function renderJobSheetTable() {
  const tbody = document.getElementById('jobs_table_body');
  if (!tbody) return;

  let displayJobs = getFilteredJobsForCurrentRange();

  // 1. Keyword Search Filter (Address, Client, Job No)
  const searchInput = document.getElementById('jobsheet_search_input');
  const searchKw = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (searchKw) {
    displayJobs = displayJobs.filter(j => {
      const addr = (j.address_title || '').toLowerCase();
      const client = (j.client_name || '').toLowerCase();
      const jobNoStr = `#${j.monthlySeqNo || ''}`;
      const rawSeq = String(j.monthlySeqNo || '');
      return addr.includes(searchKw) || client.includes(searchKw) || jobNoStr.includes(searchKw) || rawSeq === searchKw;
    });
  }

  // 2. SQFT Range Filter (Dual Slider)
  if (jobsheetMinSqftVal > 100 || jobsheetMaxSqftVal < 20000) {
    displayJobs = displayJobs.filter(j => {
      const sq = j.area_sqft || 0;
      return sq >= jobsheetMinSqftVal && sq <= jobsheetMaxSqftVal;
    });
  }

  // 3. Market Filter
  if (jobsheetMarketFilter !== 'all') {
    displayJobs = displayJobs.filter(j => (j.region || 'UK').toUpperCase() === jobsheetMarketFilter.toUpperCase());
  }

  // 4. Shift Filter (Day, Night, Weekend)
  if (jobsheetShiftFilter !== 'all') {
    displayJobs = displayJobs.filter(j => getJobShiftType(j).toLowerCase() === jobsheetShiftFilter.toLowerCase());
  }

  if (!displayJobs || displayJobs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-12 text-center text-xs text-zinc-500 font-medium">
          No matching floorplans found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayJobs.map((job, idx) => {
    const calc = calculatePricing(job, allJobs.length - idx);
    const dateStr = job.date || 'N/A';
    const timeStr = job.job_time || 'N/A';
    const address = job.address_title || 'Untitled Property';
    const client = job.client_name || 'Studio Client';
    const region = (job.region || 'UK').toUpperCase();
    const area = job.area_sqft || 0;
    const isClean = (!job.mistake_type || job.mistake_type === 'None' || job.mistake_type === 'none');
    const shiftType = getJobShiftType(job);
    const isColor = Boolean(job.is_color);

    // Status Badges with Split Shift Type (Day, Night, Weekend)
    let statusBadges = '';
    if (isClean) {
      statusBadges += `<span class="bg-zinc-800/70 text-zinc-200 border border-zinc-700/80 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3 text-zinc-400"></i> Clean (+Rs.25)</span> `;
    } else {
      statusBadges += `<span class="bg-zinc-900 text-zinc-400 border border-zinc-800 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3 text-zinc-500"></i> ${job.mistake_type}</span> `;
    }

    if (shiftType === 'WEEKEND') {
      statusBadges += `<span class="bg-zinc-800/80 text-zinc-100 border border-zinc-700/80 text-xs px-2.5 py-1 rounded-full font-medium shadow-sm inline-flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3 text-zinc-300"></i> Weekend Shift</span> `;
    } else if (shiftType === 'NIGHT') {
      statusBadges += `<span class="bg-zinc-800/80 text-zinc-100 border border-zinc-700/80 text-xs px-2.5 py-1 rounded-full font-medium shadow-sm inline-flex items-center gap-1"><i data-lucide="moon" class="w-3 h-3 text-zinc-300"></i> Night Shift</span> `;
    } else {
      statusBadges += `<span class="bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1"><i data-lucide="sun" class="w-3 h-3 text-zinc-400"></i> Day Shift</span> `;
    }

    if (isColor) {
      statusBadges += `<span class="bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><i data-lucide="palette" class="w-3 h-3 text-zinc-400"></i> Color</span>`;
    }

    // Sequential monthly job number (first job of month = 1, latest job of month = N)
    const jobNum = job.monthlySeqNo;

    return `
      <tr class="border-b border-zinc-800/40 hover:bg-zinc-900/50 transition-colors text-xs">
        <td class="px-4 py-3.5 font-bold text-zinc-300">#${jobNum}</td>
        <td class="px-4 py-3.5 text-zinc-300">
          <div class="font-medium">${dateStr}</div>
          <div class="text-[10px] text-zinc-500">${timeStr}</div>
        </td>
        <td class="px-4 py-3.5 font-medium text-zinc-100 max-w-[220px] truncate" title="${address}">${address}</td>
        <td class="px-4 py-3.5">
          <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-100 border border-zinc-700 text-[11px] font-semibold inline-block mb-0.5">${region}</span>
          <div class="text-zinc-400 text-xs font-medium">${client}</div>
        </td>
        <td class="px-4 py-3.5 text-zinc-300">
          <div class="text-zinc-100 font-medium text-xs">${area.toLocaleString()} <span class="text-zinc-400 text-[11px] font-normal">Sq.Ft</span></div>
        </td>
        <td class="px-4 py-3.5 font-bold text-zinc-100">
          Rs. ${calc.total.toLocaleString()}
        </td>
        <td class="px-4 py-3.5 flex items-center gap-1.5 flex-wrap">
          ${statusBadges}
        </td>
        <td class="px-4 py-3.5 text-right">
          <div class="inline-flex items-center justify-end gap-1.5">
            <button onclick="viewJobDetails('${job.id}')" class="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all" title="View Details">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="editJobRecord('${job.id}')" class="p-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all" title="Edit Record">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteJobRecord('${job.id}')" class="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-all" title="Delete Record">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// VIEW JOB DETAILS OVERLAY
function viewJobDetails(jobId) {
  const job = allJobs.find(j => String(j.id) === String(jobId));
  if (!job) return;

  const calc = calculatePricing(job, 0);
  const modal = document.getElementById('viewJobModalBackdrop');
  const body = document.getElementById('view_modal_body');

  if (body) {
    body.innerHTML = `
      <div class="space-y-3">
        <div class="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Property Address</span>
            <span class="font-bold text-zinc-100 text-sm">${job.address_title}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Date & Time</span>
            <span class="text-zinc-300 font-mono">${job.date} ${job.job_time}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Client & Market</span>
            <span class="text-zinc-200 font-semibold">${job.client_name} (${job.region})</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Total Area</span>
            <span class="text-zinc-200 font-semibold">${job.area_sqft.toLocaleString()} <span class="text-zinc-400 font-normal text-xs">Sq.Ft</span></span>
          </div>
        </div>

        <div class="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Base Price</span>
            <span class="text-zinc-300">Rs. ${calc.price.toLocaleString()}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Clean Allowance</span>
            <span class="text-zinc-300">+Rs. ${calc.no_mistake_amount}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-zinc-500">Deduction Penalty</span>
            <span class="text-zinc-400">-Rs. ${calc.ddt_amount}</span>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-zinc-800">
            <span class="font-semibold text-zinc-200">Total Net Revenue</span>
            <span class="font-bold text-zinc-100 text-sm">Rs. ${calc.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  if (window.lucide) lucide.createIcons();
}

function closeViewJobModal() {
  const modal = document.getElementById('viewJobModalBackdrop');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// EDIT JOB RECORD HANDLER
function editJobRecord(jobId) {
  const job = allJobs.find(j => String(j.id) === String(jobId));
  if (!job) return;

  editingJobId = jobId;

  document.getElementById('modal_date').value = job.date || '';
  document.getElementById('modal_job_time').value = job.job_time || '';
  document.getElementById('modal_address_title').value = job.address_title || '';
  document.getElementById('modal_area_sqft').value = job.area_sqft || '';
  document.getElementById('modal_client_name').value = job.client_name || '';
  document.getElementById('modal_region').value = job.region || 'UK';
  document.getElementById('modal_mistake_type').value = job.mistake_type || 'None';

  const colorCb = document.getElementById('modal_is_color');
  const nightCb = document.getElementById('modal_is_night_or_weekend');
  const colorBtn = document.getElementById('modal_toggle_color_plan');
  const nightBtn = document.getElementById('modal_toggle_night_weekend');

  if (colorCb) colorCb.checked = Boolean(job.is_color);
  if (nightCb) nightCb.checked = Boolean(job.is_night_or_weekend);

  if (colorBtn) colorCb.checked ? colorBtn.classList.add('active') : colorBtn.classList.remove('active');
  if (nightBtn) nightCb.checked ? nightBtn.classList.add('active') : nightBtn.classList.remove('active');

  const submitBtn = document.getElementById('modalSubmitBtn');
  if (submitBtn) {
    submitBtn.querySelector('span').textContent = "Update Floorplan Record";
  }

  const modal = document.getElementById('addJobModalBackdrop');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  renderModalClientPills();
  if (window.lucide) lucide.createIcons();
}

async function deleteJobRecord(jobId) {
  if (!confirm("Are you sure you want to delete this floorplan record?")) return;
  if (!_supabase) return;

  try {
    const { error } = await _supabase.from(TABLE_NAME).delete().eq('id', jobId);
    if (error) throw error;
    showToast("Floorplan record deleted");
    await fetchAllData();
  } catch (err) {
    console.error("Delete Error:", err);
    showToast("Failed to delete record");
  }
}

// 7.5 TAB SWITCHING LOGIC
let isSalaryTabUnlocked = false;

function switchTab(tabName) {
  if (tabName === 'salary' && !isSalaryTabUnlocked) {
    openSalaryPinModal('tab');
    return;
  }
  performTabSwitch(tabName);
}

function performTabSwitch(tabName) {
  const tabs = ['home', 'dashboard', 'jobsheet', 'salary'];
  tabs.forEach(t => {
    const content = document.getElementById(`tab_content_${t}`);
    const btn = document.getElementById(`tab_btn_${t}`);

    if (content) {
      if (t === tabName) {
        content.classList.remove('hidden');
        content.classList.add('block');
      } else {
        content.classList.add('hidden');
        content.classList.remove('block');
      }
    }

    if (btn) {
      if (t === tabName) {
        btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm flex items-center gap-2";
      } else {
        btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-2";
      }
    }
  });

  if (tabName === 'salary') {
    calculateMonthlySalaryStatement();
  }

  // Toggle Header Lock Tab Button (Only visible while viewing Salary Tab)
  const headerLockBtn = document.getElementById('header_lock_salary_btn');
  if (headerLockBtn) {
    if (tabName === 'salary') {
      headerLockBtn.classList.remove('hidden');
      headerLockBtn.classList.add('flex');
    } else {
      headerLockBtn.classList.add('hidden');
      headerLockBtn.classList.remove('flex');
    }
  }

  if (window.lucide) lucide.createIcons();
}

// 7.6 MONTHLY SALARY STATEMENT & PAYSLIP ENGINE (SHA-256 ENCRYPTED)
const SALARY_TAB_PIN_HASH = "3d1e557b540ac045b3b327994a351f08a443f9216f9b2b8d3a0f42b58671ac83";
let isBasicSalaryUnlocked = false;
let pendingSalaryPinAction = 'tab'; // 'tab' | 'basic'

async function hashPin(pinString) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pinString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function openSalaryPinModal(target = 'tab') {
  pendingSalaryPinAction = target;
  const modal = document.getElementById('salaryPinModalBackdrop');
  const pinInput = document.getElementById('salary_pin_input');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 50);
    }
    if (window.lucide) lucide.createIcons();
  }
}

function closeSalaryPinModal() {
  const modal = document.getElementById('salaryPinModalBackdrop');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function lockSalaryTab() {
  isSalaryTabUnlocked = false;
  isBasicSalaryUnlocked = false;

  const input = document.getElementById('salary_base_amount');
  if (input) {
    input.readOnly = true;
    input.classList.add('cursor-not-allowed', 'opacity-90');
    input.classList.remove('border-emerald-500/60', 'ring-1', 'ring-emerald-500/30');
  }

  const icon = document.getElementById('salary_lock_icon');
  if (icon) icon.setAttribute('data-lucide', 'lock');

  const editBtn = document.getElementById('salary_edit_btn');
  if (editBtn) {
    editBtn.innerHTML = '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>';
    editBtn.title = "Unlock Basic Salary";
  }

  // Switch to jobsheet tab
  performTabSwitch('jobsheet');

  if (window.lucide) lucide.createIcons();
  showToast("Salary tab locked");
}

function handleUnlockBasicSalaryClick() {
  const input = document.getElementById('salary_base_amount');
  if (isBasicSalaryUnlocked) {
    // Re-lock on second click
    isBasicSalaryUnlocked = false;
    if (input) {
      input.readOnly = true;
      input.classList.add('cursor-not-allowed', 'opacity-90');
      input.classList.remove('border-emerald-500/60', 'ring-1', 'ring-emerald-500/30');
    }
    const icon = document.getElementById('salary_lock_icon');
    if (icon) icon.setAttribute('data-lucide', 'lock');
    const editBtn = document.getElementById('salary_edit_btn');
    if (editBtn) {
      editBtn.innerHTML = '<i data-lucide="pencil" class="w-3.5 h-3.5"></i>';
      editBtn.title = "Unlock Basic Salary";
    }
    if (window.lucide) lucide.createIcons();
    showToast("Basic Salary locked");
    return;
  }

  openSalaryPinModal('basic');
}

let isVerifyingSalaryPin = false;

async function verifySalaryPin(pinVal) {
  if (isVerifyingSalaryPin) return;
  isVerifyingSalaryPin = true;

  const pinInput = document.getElementById('salary_pin_input');
  const enteredHash = await hashPin(pinVal);

  if (enteredHash === SALARY_TAB_PIN_HASH) {
    isSalaryTabUnlocked = true;
    closeSalaryPinModal();

    if (pendingSalaryPinAction === 'tab') {
      performTabSwitch('salary');
      showToast("Salary Statement unlocked");
    } else if (pendingSalaryPinAction === 'basic') {
      isBasicSalaryUnlocked = true;
      const input = document.getElementById('salary_base_amount');
      if (input) {
        input.readOnly = false;
        input.classList.remove('cursor-not-allowed', 'opacity-90');
        input.classList.add('border-emerald-500/60', 'ring-1', 'ring-emerald-500/30');
        input.focus();
        input.select();
      }
      const icon = document.getElementById('salary_lock_icon');
      if (icon) icon.setAttribute('data-lucide', 'unlock');
      const editBtn = document.getElementById('salary_edit_btn');
      if (editBtn) {
        editBtn.innerHTML = '<i data-lucide="lock" class="w-3.5 h-3.5 text-emerald-400"></i>';
        editBtn.title = "Lock Basic Salary";
      }
      if (window.lucide) lucide.createIcons();
      showToast("Basic Salary unlocked for editing");
    }
  } else {
    showToast("Unauthorized PIN code");
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
  }

  isVerifyingSalaryPin = false;
}

function handleSalaryPinInput(e) {
  const pinInput = e?.target || document.getElementById('salary_pin_input');
  const pinVal = pinInput?.value?.trim() || '';

  // Auto-verify and log in immediately when 4th digit is typed
  if (pinVal.length === 4) {
    verifySalaryPin(pinVal);
  }
}

async function handleSalaryPinSubmit(e) {
  if (e) e.preventDefault();
  const pinInput = document.getElementById('salary_pin_input');
  const pinVal = pinInput?.value?.trim() || '';
  if (pinVal.length >= 4) {
    verifySalaryPin(pinVal);
  }
}

function calculateMonthlySalaryStatement() {
  const rangeJobs = getFilteredJobsForCurrentRange();
  const totalCount = rangeJobs.length;

  let totalSpecialAllowance = 0;
  let totalCleanBonus = 0;
  let totalShiftBase = 0;
  let totalColorAndArea = 0;
  let totalPenalties = 0;

  rangeJobs.forEach(job => {
    const calc = calculatePricing(job, totalCount);
    totalSpecialAllowance += calc.total;
    totalCleanBonus += calc.no_mistake_amount;
    totalShiftBase += calc.basePrice;
    totalColorAndArea += (calc.colorPrice + calc.extraAreaBonus);
    totalPenalties += calc.ddt_amount;
  });

  // Inputs
  const baseSalaryInput = document.getElementById('salary_base_amount');
  const baseSalary = parseFloat(baseSalaryInput?.value) || 35453.00;

  const holidaysInput = document.getElementById('salary_holidays_count');
  const holidaysCount = Math.max(0, parseInt(holidaysInput?.value, 10) || 0);

  // Dynamic Formulas based on Basic Salary
  const dailyHolidayRate = (baseSalary / 20); // 1/20th or 5% of Basic Salary
  const totalHolidayAllowance = holidaysCount * dailyHolidayRate;
  const etfVal = (baseSalary * 0.08); // ETF Rate 8%

  // Net Salary Automated Total
  const netSalary = baseSalary + totalSpecialAllowance + totalHolidayAllowance;

  // Period label from date picker trigger
  const triggerLabel = document.getElementById('date_picker_label')?.textContent || 'Current Period';
  const periodBadge = document.getElementById('salary_period_badge');
  if (periodBadge) periodBadge.textContent = triggerLabel;

  const subtitle = document.getElementById('salary_statement_subtitle');
  if (subtitle) subtitle.textContent = `Period: ${triggerLabel}`;

  // Currency helper
  const fmtLKR = (num) => `LKR ${Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Update Payslip UI
  const basicEl = document.getElementById('payslip_basic_salary');
  if (basicEl) basicEl.textContent = fmtLKR(baseSalary);

  const specialEl = document.getElementById('payslip_special_allowance');
  if (specialEl) specialEl.textContent = fmtLKR(totalSpecialAllowance);

  const subCleanEl = document.getElementById('salary_sub_clean_bonus');
  if (subCleanEl) subCleanEl.textContent = `+${fmtLKR(totalCleanBonus)}`;

  const subShiftsEl = document.getElementById('salary_sub_shifts');
  if (subShiftsEl) subShiftsEl.textContent = `+${fmtLKR(totalShiftBase)}`;

  const subColorAreaEl = document.getElementById('salary_sub_color_area');
  if (subColorAreaEl) subColorAreaEl.textContent = `+${fmtLKR(totalColorAndArea)}`;

  const subPenaltiesEl = document.getElementById('salary_sub_penalties');
  if (subPenaltiesEl) subPenaltiesEl.textContent = `-${fmtLKR(totalPenalties)}`;

  const holidayCalcLabel = document.getElementById('payslip_holiday_calc_label');
  if (holidayCalcLabel) holidayCalcLabel.textContent = `(${holidaysCount} day${holidaysCount === 1 ? '' : 's'} × ${fmtLKR(dailyHolidayRate)})`;

  const holidayAllowanceEl = document.getElementById('payslip_holiday_allowance');
  if (holidayAllowanceEl) holidayAllowanceEl.textContent = fmtLKR(totalHolidayAllowance);

  const netSalaryEl = document.getElementById('payslip_net_salary');
  if (netSalaryEl) netSalaryEl.textContent = fmtLKR(netSalary);

  // Statutory Reference Cards
  const jobCountEl = document.getElementById('statutory_job_count');
  if (jobCountEl) jobCountEl.textContent = totalCount;

  const etfEl = document.getElementById('statutory_etf_amount');
  if (etfEl) etfEl.textContent = fmtLKR(etfVal);

  const holidayRateEl = document.getElementById('statutory_holiday_rate');
  if (holidayRateEl) holidayRateEl.textContent = fmtLKR(dailyHolidayRate);

  const penaltyEl = document.getElementById('statutory_penalty_amount');
  if (penaltyEl) penaltyEl.textContent = fmtLKR(totalPenalties);
}

// 8. FORM SUBMISSION
document.getElementById('addJobForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!_supabase) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');

  const dateVal = document.getElementById('date').value;
  const isNightVal = document.getElementById('is_night_or_weekend').checked;
  const dObj = new Date(dateVal + 'T00:00:00');
  const day = dObj.getDay();
  const shiftTypeVal = (day === 0 || day === 6) ? 'WEEKEND' : (isNightVal ? 'NIGHT' : 'DAY');

  const data = {
    date: dateVal,
    job_time: document.getElementById('job_time').value,
    client_name: document.getElementById('client_name').value || 'Studio Client',
    address_title: document.getElementById('address_title').value,
    area_sqft: parseFloat(document.getElementById('area_sqft').value) || 0,
    region: document.getElementById('region').value,
    mistake_type: document.getElementById('mistake_type').value,
    is_color: document.getElementById('is_color').checked,
    is_night_or_weekend: isNightVal,
    shift_type: shiftTypeVal
  };

  try {
    const calc = calculatePricing(data, allJobs.length);
    const finalData = {
      ...data,
      price: calc.price,
      no_mistake_amount: calc.no_mistake_amount,
      ddt_amount: calc.ddt_amount,
      total: calc.total
    };

    const { error } = await _supabase.from(TABLE_NAME).insert([finalData]);
    if (error) throw error;

    showToast("Floorplan saved successfully!");

    // Reset partial form
    document.getElementById('address_title').value = '';
    document.getElementById('area_sqft').value = '';
    updateLivePayoutStrip(false);

    await fetchAllData();
  } catch (err) {
    console.error("Save Error:", err);
    showToast("Error saving floorplan");
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// Toast System
function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast_msg');
  if (toast && toastMsg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// 10. ADD JOB MODAL OVERLAY LOGIC
function openAddJobModal() {
  const modal = document.getElementById('addJobModalBackdrop');
  if (!modal) return;

  editingJobId = null;
  const submitBtn = document.getElementById('modalSubmitBtn');
  if (submitBtn) {
    submitBtn.querySelector('span').textContent = "Save Floorplan Record";
  }

  const slObj = getSriLankaTimeObj();
  const dateInput = document.getElementById('modal_date');
  const timeInput = document.getElementById('modal_job_time');

  if (dateInput && !dateInput.value) {
    dateInput.value = slObj.dateStr;
  }

  if (timeInput && !timeInput.value) {
    timeInput.value = slObj.timeStr;
  }

  renderModalClientPills();
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (window.lucide) lucide.createIcons();
}

function closeAddJobModal() {
  const modal = document.getElementById('addJobModalBackdrop');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  editingJobId = null;
  const submitBtn = document.getElementById('modalSubmitBtn');
  if (submitBtn) {
    submitBtn.querySelector('span').textContent = "Save Floorplan Record";
  }
}

function renderModalClientPills() {
  const container = document.getElementById('modal_quick_client_pills');
  if (!container) return;

  if (clientList.length === 0) {
    container.innerHTML = `<span class="text-xs text-zinc-500">No clients configured. Click settings to add.</span>`;
    return;
  }

  const ukClients = clientList.filter(c => c.region === 'UK');
  const ausClients = clientList.filter(c => c.region === 'AUS');

  let html = '';

  if (ukClients.length > 0) {
    html += `
      <div class="space-y-1.5 mb-2 w-full">
        <div class="flex flex-wrap items-center gap-1.5">
          ${ukClients.map(c => `
            <button type="button" onclick="selectModalClient('${c.name.replace(/'/g, "\\'")}', '${c.region}', this)" class="client-pill">
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (ausClients.length > 0) {
    html += `
      <div class="space-y-1.5 mb-2 border-t border-zinc-800/60 pt-2 w-full">
        <div class="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">
          <span>AUS Market</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${ausClients.map(c => `
            <button type="button" onclick="selectModalClient('${c.name.replace(/'/g, "\\'")}', '${c.region}', this)" class="client-pill">
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function selectModalClient(clientName, clientRegion, el) {
  document.getElementById('modal_client_name').value = clientName;
  document.getElementById('modal_region').value = clientRegion;

  const badge = document.getElementById('modal_selected_client_badge');
  if (badge) {
    badge.textContent = `Selected: ${clientName} (${clientRegion})`;
    badge.classList.remove('hidden');
  }

  const container = document.getElementById('modal_quick_client_pills');
  if (container) {
    container.querySelectorAll('.client-pill').forEach(btn => btn.classList.remove('active'));
  }
  if (el) el.classList.add('active');
  updateLivePayoutStrip(true);
}

function toggleModalOption(checkboxId) {
  const cb = document.getElementById(checkboxId);
  if (!cb) return;
  cb.checked = !cb.checked;

  let btnId = '';
  if (checkboxId === 'modal_is_color') btnId = 'modal_toggle_color_plan';
  if (checkboxId === 'modal_is_night_or_weekend') btnId = 'modal_toggle_night_weekend';

  const btn = document.getElementById(btnId);
  if (btn) {
    if (cb.checked) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
  updateLivePayoutStrip(true);
}

// Modal Form Submission Handler (Create or Edit)
document.getElementById('modalAddJobForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!_supabase) return;

  const btn = document.getElementById('modalSubmitBtn');
  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');

  const modalDateVal = document.getElementById('modal_date').value;
  const modalIsNightVal = document.getElementById('modal_is_night_or_weekend').checked;
  const modalDObj = new Date(modalDateVal + 'T00:00:00');
  const modalDay = modalDObj.getDay();
  const modalShiftTypeVal = (modalDay === 0 || modalDay === 6) ? 'WEEKEND' : (modalIsNightVal ? 'NIGHT' : 'DAY');

  const data = {
    date: modalDateVal,
    job_time: document.getElementById('modal_job_time').value,
    client_name: document.getElementById('modal_client_name').value || 'Studio Client',
    address_title: document.getElementById('modal_address_title').value,
    area_sqft: parseFloat(document.getElementById('modal_area_sqft').value) || 0,
    region: document.getElementById('modal_region').value,
    mistake_type: document.getElementById('modal_mistake_type').value,
    is_color: document.getElementById('modal_is_color').checked,
    is_night_or_weekend: modalIsNightVal,
    shift_type: modalShiftTypeVal
  };

  try {
    const calc = calculatePricing(data, allJobs.length);
    const finalData = {
      ...data,
      price: calc.price,
      no_mistake_amount: calc.no_mistake_amount,
      ddt_amount: calc.ddt_amount,
      total: calc.total
    };

    if (editingJobId) {
      const { error } = await _supabase.from(TABLE_NAME).update(finalData).eq('id', editingJobId);
      if (error) throw error;
      showToast("Floorplan record updated!");
      editingJobId = null;
    } else {
      const { error } = await _supabase.from(TABLE_NAME).insert([finalData]);
      if (error) throw error;
      showToast("Floorplan record saved successfully!");
    }

    closeAddJobModal();

    // Reset modal form input fields
    document.getElementById('modal_address_title').value = '';
    document.getElementById('modal_area_sqft').value = '';
    updateLivePayoutStrip(true);

    await fetchAllData();
  } catch (err) {
    console.error("Modal Save Error:", err);
    showToast("Error saving floorplan record");
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// REAL-TIME LIVE PAYOUT STRIP UPDATER
function updateLivePayoutStrip(isModal = false) {
  const prefix = isModal ? 'modal_' : '';

  const addressInput = document.getElementById(`${prefix}address_title`);
  const areaInput = document.getElementById(`${prefix}area_sqft`);
  const clientInput = document.getElementById(`${prefix}client_name`);
  const regionSelect = document.getElementById(`${prefix}region`);
  const mistakeSelect = document.getElementById(`${prefix}mistake_type`);
  const colorCb = document.getElementById(`${prefix}is_color`);
  const nightCb = document.getElementById(`${prefix}is_night_or_weekend`);

  const addressVal = addressInput?.value?.trim() || '';
  const areaVal = parseFloat(areaInput?.value) || 0;
  const clientVal = clientInput?.value?.trim() || '';

  const totalEl = document.getElementById(`${prefix}payout_total_val`);
  const badgesContainer = document.getElementById(`${prefix}payout_breakdown_badges`);
  const stripContainer = document.getElementById(`${prefix}payout_strip_container`);

  // Activate calculation ONLY after user starts entering job details (e.g. area, address, or client)
  const hasJobDetails = (areaVal > 0 || addressVal.length > 0 || clientVal.length > 0);

  if (!hasJobDetails) {
    if (totalEl) {
      totalEl.textContent = '--';
      totalEl.classList.add('text-zinc-400');
      totalEl.classList.remove('text-zinc-100');
    }
    if (badgesContainer) {
      badgesContainer.innerHTML = `
        <span class="text-zinc-500 text-[11px] font-medium flex items-center gap-1.5">
          <i data-lucide="info" class="w-3.5 h-3.5 text-zinc-600"></i> Enter job details to calculate payout
        </span>
      `;
    }
    if (stripContainer) {
      stripContainer.classList.add('opacity-60', 'border-dashed');
      stripContainer.classList.remove('opacity-100', 'border-solid');
    }
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Active state styling
  if (totalEl) {
    totalEl.classList.remove('text-zinc-400');
    totalEl.classList.add('text-zinc-100');
  }
  if (stripContainer) {
    stripContainer.classList.remove('opacity-60', 'border-dashed');
    stripContainer.classList.add('opacity-100', 'border-solid');
  }

  const formData = {
    area_sqft: areaVal,
    region: regionSelect?.value || 'UK',
    mistake_type: mistakeSelect?.value || 'None',
    is_color: colorCb?.checked || false,
    is_night_or_weekend: nightCb?.checked || false,
  };

  // STRICTLY REUSE existing calculatePricing function!
  const calc = calculatePricing(formData, allJobs.length);

  if (totalEl) {
    totalEl.textContent = `Rs. ${calc.total.toLocaleString()}`;
  }

  if (badgesContainer) {
    let badgesHtml = '';

    // 1. Base Price Badge / Night Shift Base Badge
    if (formData.is_night_or_weekend) {
      if (calc.basePrice > 0) {
        badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="moon" class="w-3 h-3 text-zinc-400"></i> Night/Wknd Base (Rs. ${calc.basePrice})</span> `;
      } else {
        badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="moon" class="w-3 h-3 text-zinc-400"></i> Night/Wknd Shift</span> `;
      }
    } else if (calc.basePrice > 0) {
      badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="layers" class="w-3 h-3 text-zinc-400"></i> Base Rate: Rs. ${calc.basePrice}</span> `;
    }

    // 2. Clean Job Badge
    if (calc.no_mistake_amount > 0) {
      badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3 text-zinc-400"></i> Clean (+Rs. 25)</span> `;
    }

    // 3. Color Plan Badge
    if (calc.colorPrice > 0) {
      badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="palette" class="w-3 h-3 text-zinc-400"></i> Color Tier (+Rs. ${calc.colorPrice})</span> `;
    }

    // 4. Extra Area (> 2500 sqft) Calculation Badge
    if (calc.extraAreaBonus > 0) {
      badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="maximize" class="w-3 h-3 text-zinc-400"></i> Area >2500 (+Rs. ${calc.extraAreaBonus})</span> `;
    }

    // 5. Deduction Penalty Badge (if applicable)
    if (calc.ddt_amount > 0) {
      badgesHtml += `<span class="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-medium inline-flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3 text-zinc-500"></i> Penalty (-Rs. ${calc.ddt_amount})</span> `;
    }

    if (!badgesHtml) {
      badgesHtml = `<span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium inline-flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3 text-zinc-400"></i> Clean (+Rs. 25)</span>`;
    }

    badgesContainer.innerHTML = badgesHtml;
    if (window.lucide) lucide.createIcons();
  }
}

// EXCEL EXPORT & TSV GENERATION LOGIC (3-TIER EXCEL NUMBERING RULE)
function formatExcelDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).substring(2);
  return `${day}-${month}-${year}`;
}

function formatJobToExcelTSVRow(job, jobNo) {
  const formattedDate = formatExcelDate(job.date);
  const address = (job.address_title || '').replace(/[\t\n\r]/g, ' ');
  const area = job.area_sqft || 0;
  const market = (job.region || 'uk').toLowerCase() === 'aus' ? 'aus' : 'uk';
  const colorPlan = job.is_color ? 'Color' : '';

  // Col H: Mistake Title (empty string if clean job)
  const hasMistake = job.mistake_type && job.mistake_type !== 'None' && job.mistake_type !== 'none';
  const mistakeTitle = hasMistake ? job.mistake_type : '';

  // Col J: Deduction penalty amount (empty string if 0 or no penalty)
  const penaltyVal = hasMistake ? (MISTAKE_DEDUCTIONS_MAP[job.mistake_type] || 0) : 0;
  const ddtAmountStr = penaltyVal > 0 ? penaltyVal : '';

  // 11 Columns: A:JobNo, B:Date, C:Address, D:Area, E:Market, F:Color, G:Price, H:Mistake, I:NoMistakeAmt, J:DdtAmt, K:Total
  return `${jobNo}\t${formattedDate}\t${address}\t${area}\t${market}\t${colorPlan}\t\t${mistakeTitle}\t\t${ddtAmountStr}\t`;
}

function generateExcelTSVData() {
  const jobsToExport = getFilteredJobsForCurrentRange();
  if (!jobsToExport || jobsToExport.length === 0) return '';

  // Sort chronological (oldest to newest)
  const sortedAll = [...jobsToExport].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const dayJobs = sortedAll.filter(j => !j.is_night_or_weekend);
  const nightJobs = sortedAll.filter(j => j.is_night_or_weekend);

  const dayJobsTier1 = dayJobs.slice(0, 100);
  const dayJobsTier3 = dayJobs.slice(100);

  const tsvRows = [];

  // TIER 1: Day Jobs #1 to #100
  dayJobsTier1.forEach((job, idx) => {
    tsvRows.push(formatJobToExcelTSVRow(job, idx + 1));
  });

  // TIER 2: Night / Weekend Jobs #101 onwards (#101 to #175)
  nightJobs.forEach((job, idx) => {
    tsvRows.push(formatJobToExcelTSVRow(job, 101 + idx));
  });

  // TIER 3: Remaining Day Jobs (#176+)
  dayJobsTier3.forEach((job, idx) => {
    tsvRows.push(formatJobToExcelTSVRow(job, 176 + idx));
  });

  return tsvRows.join('\n');
}

async function copyExcelFormattedData() {
  const tsvText = generateExcelTSVData();
  if (!tsvText) {
    showToast("No records available to export");
    return;
  }

  try {
    await navigator.clipboard.writeText(tsvText);
    showToast("Copied! Open Excel and press Ctrl+V at Cell A2.");
  } catch (err) {
    console.error("Clipboard Error:", err);
    const textArea = document.createElement("textarea");
    textArea.value = tsvText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showToast("Copied! Open Excel and press Ctrl+V at Cell A2.");
  }
}

function downloadCSVData() {
  const tsvText = generateExcelTSVData();
  if (!tsvText) {
    showToast("No records available to download");
    return;
  }

  const csvHeader = "Job No,Date,Property Address,Area SQFT,AUS Market,Color Plan,Price,Mistake,No Mistake Amount,Ddt Amount,Total\n";
  const csvRows = tsvText.split('\n').map(line => {
    const cols = line.split('\t');
    return cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
  }).join('\n');

  const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Jobsheet_Excel_Export_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Downloaded CSV file successfully!");
}

// EXCEL PREVIEW MODAL & TAB SWITCH LOGIC
let activeExcelPreviewTabMode = 'all';

function openExcelPreviewModal() {
  const backdrop = document.getElementById('excelPreviewModalBackdrop');
  if (backdrop) {
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    renderExcelPreviewTable(activeExcelPreviewTabMode);
  }
}

function closeExcelPreviewModal() {
  const backdrop = document.getElementById('excelPreviewModalBackdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.classList.remove('flex');
  }
}

function switchExcelPreviewTab(mode) {
  activeExcelPreviewTabMode = mode;

  const tabAll = document.getElementById('excel_tab_all');
  const tabNight = document.getElementById('excel_tab_night');

  if (mode === 'night') {
    tabNight?.classList.add('bg-zinc-800', 'text-zinc-100', 'border', 'border-zinc-700', 'shadow-sm', 'font-semibold');
    tabNight?.classList.remove('text-zinc-400', 'font-medium');

    tabAll?.classList.remove('bg-zinc-800', 'text-zinc-100', 'border', 'border-zinc-700', 'shadow-sm', 'font-semibold');
    tabAll?.classList.add('text-zinc-400', 'font-medium');
  } else {
    tabAll?.classList.add('bg-zinc-800', 'text-zinc-100', 'border', 'border-zinc-700', 'shadow-sm', 'font-semibold');
    tabAll?.classList.remove('text-zinc-400', 'font-medium');

    tabNight?.classList.remove('bg-zinc-800', 'text-zinc-100', 'border', 'border-zinc-700', 'shadow-sm', 'font-semibold');
    tabNight?.classList.add('text-zinc-400', 'font-medium');
  }

  renderExcelPreviewTable(mode);
}

function renderExcelPreviewTable(mode = 'all') {
  const tbody = document.getElementById('excel_preview_table_body');
  const badge = document.getElementById('excel_preview_count_badge');
  if (!tbody) return;

  const tsvText = generateExcelTSVData();
  if (!tsvText) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="px-6 py-12 text-center text-xs text-zinc-500 font-sans font-medium">
          No records available to display in Excel sheet preview.
        </td>
      </tr>
    `;
    if (badge) badge.textContent = "0 Rows";
    return;
  }

  const lines = tsvText.split('\n').filter(l => l.trim().length > 0);

  // Filter by mode if 'night' selected (#101+)
  const filteredLines = lines.filter(line => {
    const cols = line.split('\t');
    const jobNo = parseInt(cols[0], 10) || 0;
    if (mode === 'night') {
      return jobNo >= 101 && jobNo <= 175;
    }
    return true;
  });

  if (badge) badge.textContent = `${filteredLines.length} Rows (${mode === 'night' ? 'Night Block' : 'All Jobs'})`;

  tbody.innerHTML = filteredLines.map(line => {
    const cols = line.split('\t');
    const jobNo = cols[0] || '';
    const date = cols[1] || '';
    const address = cols[2] || '';
    const area = cols[3] || '';
    const market = cols[4] || '';
    const color = cols[5] || '';
    const price = cols[6] || '';
    const mistake = cols[7] || '';
    const noMistake = cols[8] || '';
    const ddt = cols[9] || '';
    const total = cols[10] || '';

    const isNightRow = (parseInt(jobNo, 10) >= 101 && parseInt(jobNo, 10) <= 175);

    return `
      <tr class="hover:bg-zinc-900/60 transition-colors ${isNightRow ? 'bg-indigo-950/20' : ''}">
        <td class="py-2 px-3 border-r border-zinc-800/50 text-center font-bold ${isNightRow ? 'text-indigo-400' : 'text-zinc-200'}">${jobNo}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-zinc-300">${date}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-zinc-200 font-sans font-medium">${address}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-right text-zinc-300">${area}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-center text-zinc-300 font-bold">${market}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-center ${color ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}">${color || '-'}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-right text-zinc-600 font-mono">[Auto]</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 ${mistake ? 'text-amber-400 font-semibold' : 'text-zinc-500'}">${mistake || '-'}</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-right text-zinc-600 font-mono">[Auto]</td>
        <td class="py-2 px-3 border-r border-zinc-800/50 text-right ${ddt ? 'text-rose-400 font-bold' : 'text-zinc-500'}">${ddt ? `-${ddt}` : '-'}</td>
        <td class="py-2 px-3 text-right text-zinc-600 font-mono">[Auto]</td>
      </tr>
    `;
  }).join('');
}

// 9. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  document.getElementById('preview-sheet-btn')?.addEventListener('click', () => openExcelPreviewModal());
  document.getElementById('date')?.addEventListener('input', () => { userOverrodeDate = true; autoCheckNightWeekend(); updateLivePayoutStrip(false); });
  document.getElementById('job_time')?.addEventListener('input', () => { userOverrodeTime = true; autoCheckNightWeekend(); updateLivePayoutStrip(false); });

  // Attach live calculation listeners to main form & modal form
  ['address_title', 'area_sqft', 'client_name', 'region', 'mistake_type'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => updateLivePayoutStrip(false));
    document.getElementById(id)?.addEventListener('change', () => updateLivePayoutStrip(false));

    document.getElementById(`modal_${id}`)?.addEventListener('input', () => updateLivePayoutStrip(true));
    document.getElementById(`modal_${id}`)?.addEventListener('change', () => updateLivePayoutStrip(true));
  });

  window.addEventListener('click', (e) => {
    const popover = document.getElementById('date_picker_popover');
    const triggerBtn = document.getElementById('date_picker_trigger_btn');
    if (popover && !popover.contains(e.target) && triggerBtn && !triggerBtn.contains(e.target)) {
      closeDatePickerPopover();
    }

    const areaPopover = document.getElementById('area_filter_popover');
    const areaTriggerBtn = document.getElementById('area_popover_trigger_btn');
    if (areaPopover && !areaPopover.contains(e.target) && areaTriggerBtn && !areaTriggerBtn.contains(e.target)) {
      closeAreaFilterPopover();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAddJobModal();
      closeClientModal();
      closeViewJobModal();
      closeExcelPreviewModal();
      closeDatePickerPopover();
      closeAreaFilterPopover();
    }
  });

  loadClients();
  startSriLankaClock();
  fetchAllData();
  updateLivePayoutStrip(false);
  updateLivePayoutStrip(true);
});
