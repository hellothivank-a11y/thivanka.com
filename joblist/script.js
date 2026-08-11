// --- SUPABASE SDK INITIALIZATION ---
        const SUPABASE_URL = "https://jaxzghosalfjmconowgm.supabase.co";
        const SUPABASE_KEY = "sb_publishable_eQQaWNyP0wswrsy98OD_uw_2nlFz4-e";
        const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // --- GLOBAL STATE ---
        let allJobs = [];
        let isSalaryUnlocked = false;
        let isUserNightWeekendOverridden = false;
        let isUserTimeEdited = false;
        let isUserDateEdited = false;
        let weeklyChartInstance = null;
        let monthlyTimelineChartInstance = null;
        let dayNightChartInstance = null;

        // --- ADVANCE FUZZY SEARCH HELPER ---
        function getLevenshteinDistance(a, b) {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[b.length][a.length];
        }

        function fuzzyMatch(query, targetText) {
            const qTokens = query.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
            if (qTokens.length === 0) return true;
            const targetLower = targetText.toLowerCase();
            const targetTokens = targetLower.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);

            return qTokens.every(qToken => {
                // 1. Direct substring match in target text
                if (targetLower.includes(qToken)) return true;
                // 2. Token-level fuzzy match
                return targetTokens.some(tToken => {
                    if (tToken.includes(qToken) || qToken.includes(tToken)) return true;
                    if (qToken.length > 3 && tToken.length > 3) {
                        return getLevenshteinDistance(qToken, tToken) <= 2;
                    }
                    return false;
                });
            });
        }

        // --- QUICK CLIENT MANAGEMENT ---
        const predefinedClients = [
            { name: "Criss", region: "UK" }, { name: "Peter", region: "UK" }, { name: "Scott", region: "UK" },
            { name: "Robert", region: "UK" }, { name: "Jems", region: "UK" }, { name: "Lenin", region: "UK" },
            { name: "David", region: "UK" }, { name: "Lee", region: "UK" }, { name: "Martin", region: "UK" },
            { name: "London House", region: "UK" }, { name: "Andrew", region: "AUS" }, { name: "Tonny", region: "AUS" }
        ];

        function getCustomClients() {
            try { return JSON.parse(localStorage.getItem('custom_clients') || '[]'); } catch { return []; }
        }

        function initClientGrid() {
            const grid = document.getElementById('quick_client_grid');
            if(!grid) return;
            const custom = getCustomClients();
            const allClients = [...predefinedClients, ...custom];
            
            grid.innerHTML = allClients.map(c => 
                `<button type="button" onclick="selectClient('${c.name}', '${c.region}', this)" data-client="${c.name}" 
                   class="client-btn px-3 py-2 text-xs font-medium rounded-full border border-transparent bg-[#393939] text-[#a1a1aa] hover:bg-[#3a3a3c] hover:text-[#fafafa] transition-all w-full truncate">
                    ${c.name}
                </button>`
            ).join('');
        }

        function selectClient(name, region) {
            document.getElementById('client_name').value = name;
            document.getElementById('region').value = region === 'UK' ? 'UK' : (region === 'AUS' ? 'AUS' : 'Standard');
            
            // Update active state
            document.querySelectorAll('.client-btn').forEach(btn => {
                if(btn.dataset.client === name) {
                    btn.classList.add('bg-[#0f62fe]', 'text-[#fafafa]');
                    btn.classList.remove('bg-[#393939]', 'text-[#a1a1aa]');
                } else {
                    btn.classList.remove('bg-[#0f62fe]', 'text-[#fafafa]');
                    btn.classList.add('bg-[#393939]', 'text-[#a1a1aa]');
                }
            });
        }

        function toggleCustomClientForm() {
            document.getElementById('custom_client_form').classList.toggle('hidden');
        }

        function saveCustomClient() {
            const name = document.getElementById('custom_client_input').value.trim();
            const regionStr = document.getElementById('custom_client_region').value;
            if(!name) return;
            const custom = getCustomClients();
            if(!custom.find(c => c.name.toLowerCase() === name.toLowerCase()) && !predefinedClients.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                custom.push({ name, region: regionStr });
                localStorage.setItem('custom_clients', JSON.stringify(custom));
            }
            document.getElementById('custom_client_input').value = '';
            toggleCustomClientForm();
            initClientGrid();
            selectClient(name, regionStr);
        }

        // --- UTILITY FUNCTIONS ---
        function formatCurrency(num) {
            return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            const msgEl = document.getElementById('toast_msg');
            const icon = document.getElementById('toast_icon');
            msgEl.textContent = message;
            
            if (isError) {
                toast.className = "fixed bottom-5 right-5 bg-rose-950/90 border border-rose-800/80 text-rose-200 px-6 py-4 rounded-full  flex items-center gap-4 z-50 text-xs font-medium  show";
                icon.setAttribute('data-lucide', 'alert-circle');
                icon.className = 'w-4 h-4 text-rose-400';
            } else {
                toast.className = "fixed bottom-5 right-5 bg-[#393939] border border-[#27272a] text-[#fafafa] px-6 py-4 rounded-full  flex items-center gap-4 z-50 text-xs font-medium  show";
                icon.setAttribute('data-lucide', 'check-circle-2');
                icon.className = 'w-4 h-4 text-emerald-400';
            }

            lucide.createIcons();
            setTimeout(() => { toast.classList.remove('show'); }, 3000);
        }

        // --- TAB MANAGEMENT ---
        function switchTab(tabId) {
            if (tabId === 'tab-salary' && !isSalaryUnlocked) {
                openPinModal();
                return;
            }

            document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            document.getElementById(tabId).classList.remove('hidden');
            document.getElementById(`btn-${tabId}`).classList.add('active');

            if (tabId === 'tab-analytics') {
                renderAnalyticsDashboard();
            }
        }

        function openPinModal() {
            document.getElementById('pinModal').classList.remove('hidden');
            document.getElementById('pin_input').value = '';
            document.getElementById('pin_error').classList.add('hidden');
            document.getElementById('pin_input').focus();
        }

        function closePinModal() {
            document.getElementById('pinModal').classList.add('hidden');
        }

        async function verifyPin(e) {
            e.preventDefault();
            const pin = document.getElementById('pin_input').value;
            
            // Hash the input PIN securely
            const encoder = new TextEncoder();
            const data = encoder.encode(pin);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Compare with stored hash
            if (hashHex === "3d1e557b540ac045b3b327994a351f08a443f9216f9b2b8d3a0f42b58671ac83") {
                isSalaryUnlocked = true;
                closePinModal();
                const lockIcon = document.getElementById('salary_lock_icon');
                if (lockIcon) lockIcon.classList.add('hidden');
                switchTab('tab-salary');
                calculateSalary();
                showToast("Salary Breakdown unlocked successfully.");
            } else {
                document.getElementById('pin_error').classList.remove('hidden');
            }
        }

        // --- VIEW JOB MODAL ---
        function openViewModal(id) {
            const job = allJobs.find(j => j.id === id);
            if (!job) return;

            const monthCounts = getMonthJobCounts();
            const ym = job.date ? job.date.substring(0, 7) : '';
            const bonus = (monthCounts[ym] || 0) >= 170 ? 50 : 0;
            const finalTotal = Number(job.total) + bonus;
            const dateFormatted = new Date(job.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

            const contentEl = document.getElementById('view_modal_content');
            contentEl.innerHTML = `
                <div class="bg-[#393939]/50 p-4 rounded-2xl border border-[#27272a] space-y-2">
                    <div class="text-[#a1a1aa] text-[11px] font-mono">Job ID: #${job.id}</div>
                    <div class="text-[#fafafa] text-base font-semibold">${job.address_title}</div>
                    <div class="flex items-center gap-2 text-xs text-[#a1a1aa]">
                        <span class="text-[#fafafa] font-medium">${job.client_name}</span>
                        <span>•</span>
                        <span>${dateFormatted} ${job.job_time ? 'at ' + job.job_time : ''}</span>
                        <span>•</span>
                        <span class="px-2 py-0.5 rounded-full bg-[#393939] text-[#a1a1aa] font-mono">${job.region} Tier</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-[#393939]/50 p-3.5 rounded-2xl border border-[#27272a]">
                        <span class="text-[#a1a1aa] block text-[11px]">Area (Sq.ft)</span>
                        <span class="text-[#fafafa] font-mono text-lg font-bold">${Number(job.area_sqft).toLocaleString()} sqft</span>
                        <span class="text-[#a1a1aa] block text-[10px] font-mono">${(job.area_sqft * 0.09290304).toFixed(2)} m²</span>
                    </div>
                    <div class="bg-[#393939]/50 p-3.5 rounded-2xl border border-[#27272a]">
                        <span class="text-[#a1a1aa] block text-[11px]">Job Flags</span>
                        <div class="flex flex-wrap gap-1.5 mt-1">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${job.is_color ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-[#09090b] text-[#a1a1aa]'}">
                                ${job.is_color ? 'Color Plan' : 'Standard B/W'}
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${job.is_night_or_weekend ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-[#09090b] text-[#a1a1aa]'}">
                                ${job.is_night_or_weekend ? 'Night/Weekend' : 'Day Shift'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="bg-[#393939]/50 p-4 rounded-2xl border border-[#27272a] space-y-2 font-mono text-xs">
                    <div class="flex justify-between py-1 border-b border-[#27272a]">
                        <span class="text-[#a1a1aa] font-sans">Base Price</span>
                        <span class="text-[#fafafa]">${formatCurrency(job.price)} LKR</span>
                    </div>
                    <div class="flex justify-between py-1 border-b border-[#27272a]">
                        <span class="text-[#a1a1aa] font-sans">No Mistake Allowance</span>
                        <span class="text-[#30d158]">+ ${formatCurrency(job.no_mistake_amount)} LKR</span>
                    </div>
                    <div class="flex justify-between py-1 border-b border-[#27272a]">
                        <span class="text-[#a1a1aa] font-sans">Mistake (${job.mistake_type || 'None'})</span>
                        <span class="text-[#ff9f0a]">${job.ddt_amount > 0 ? '-' + formatCurrency(job.ddt_amount) : '0.00'} LKR</span>
                    </div>
                    ${bonus > 0 ? `
                    <div class="flex justify-between py-1 border-b border-[#27272a]">
                        <span class="text-[#a1a1aa] font-sans">Target Unlocked Bonus</span>
                        <span class="text-[#30d158]">+ ${formatCurrency(bonus)} LKR</span>
                    </div>
                    ` : ''}
                    <div class="flex justify-between pt-2 text-sm font-bold font-sans">
                        <span class="text-[#fafafa]">Net Earnings</span>
                        <span class="text-[#0f62fe]">${formatCurrency(finalTotal)} LKR</span>
                    </div>
                </div>
            `;

            document.getElementById('view_modal_edit_btn').onclick = () => {
                closeViewModal();
                openEditModal(job.id);
            };

            document.getElementById('viewModal').classList.remove('hidden');
            lucide.createIcons();
        }

        function closeViewModal() {
            document.getElementById('viewModal').classList.add('hidden');
        }

        // --- BUSINESS PRICING ENGINE ---
        function calculatePricing(data, totalJobCount) {
            let basePrice = 0;
            let ddt_amount = 0;

            const is_color = data.is_color;
            const is_night_or_weekend = data.is_night_or_weekend || false;
            const area_sqft = parseFloat(data.area_sqft) || 0;
            const region = data.region;
            const mistake_type = data.mistake_type || "None";

            // ALWAYS give Rs. 25 allowance if there are NO mistakes, regardless of the job tier
            let no_mistake_amount = (mistake_type === "None") ? 25 : 0;

            // Dynamic Area-based Color Pricing
            let colorPrice = 0;
            if (is_color) {
                colorPrice = area_sqft <= 1000 ? 25 : 25 + Math.ceil((area_sqft - 1000) / 1000) * 25;
            }

            // First 100 Lifetime Jobs Rule (Weekday daytime 7AM-5PM)
            if (totalJobCount < 100 && !is_night_or_weekend) {
                basePrice = 0;
                if (is_color) basePrice += colorPrice;
                if (area_sqft > 5000) basePrice += (area_sqft - 5000) * 0.25;
            } 
            // Regular Tiers (Post-100 Jobs OR Night/Weekend)
            else {
                if (region === 'Standard') {
                    if (area_sqft <= 1000) basePrice = 200;
                    else if (area_sqft <= 2000) basePrice = 250;
                    else basePrice = 300; // Cap at 2500 tier
                } else if (region === 'UK' || region === 'AUS') {
                    if (area_sqft <= 1000) basePrice = 300;
                    else if (area_sqft <= 2000) basePrice = 350;
                    else basePrice = 400; // Cap at 2500 tier
                }

                if (is_color) basePrice += colorPrice;
                if (area_sqft > 2500) basePrice += (area_sqft - 2500) * 0.25;
            }

            // Mistake Deductions mapping
            const mistakeDeductionsMap = {
                "None": 0,
                "Address": 300,
                "North Point": 300,
                "Floor Label": 300,
                "Measurements": 300,
                "Area": 200,
                "Label": 100,
                "Under Stair RH": 25,
                "Template": 25,
                "Entrance Arrow": 25,
                "Arrow Head": 25,
                "Room Parts": 25,
                "Door & Window": 25
            };
            
            ddt_amount = mistakeDeductionsMap[mistake_type] || 0;
            const total = basePrice + no_mistake_amount - ddt_amount;

            return {
                price: basePrice,
                no_mistake_amount,
                ddt_amount,
                total
            };
        }

        // --- FILTERING & DATA FETCHING ---
        function getFilteredJobs() {
            const val = document.getElementById('globalMonthFilter')?.value || 'all';
            if (val === 'all') return allJobs;
            return allJobs.filter(j => j.date && j.date.startsWith(val));
        }

        function getMonthJobCounts() {
            const counts = {};
            allJobs.forEach(j => {
                if (j.date) {
                    const ym = j.date.substring(0, 7);
                    counts[ym] = (counts[ym] || 0) + 1;
                }
            });
            return counts;
        }

        function populateGlobalMonthFilter() {
            const select = document.getElementById('globalMonthFilter');
            if (!select) return;

            const currentVal = select.value;
            const monthsSet = new Set();
            const yearsSet = new Set();

            allJobs.forEach(j => {
                if (j.date) {
                    const ym = j.date.substring(0, 7);
                    const y = j.date.substring(0, 4);
                    if (ym.length === 7) monthsSet.add(ym);
                    if (y.length === 4) yearsSet.add(y);
                }
            });

            const monthsArr = Array.from(monthsSet).sort().reverse();
            const yearsArr = Array.from(yearsSet).sort().reverse();

            const monthOptionsHTML = monthsArr.map(m => {
                const d = new Date(m + "-01T00:00:00");
                const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return `<option value="${m}">${label}</option>`;
            }).join('');

            const yearOptionsHTML = yearsArr.map(y => {
                return `<option value="${y}">${y} Full Year</option>`;
            }).join('');

            let html = '';
            if (monthOptionsHTML) html += `<optgroup label="Months">${monthOptionsHTML}</optgroup>`;
            if (yearOptionsHTML) html += `<optgroup label="Years">${yearOptionsHTML}</optgroup>`;
            html += `<option value="all">All Time</option>`;

            select.innerHTML = html;

            const todayStr = new Date().toISOString().substring(0, 7);
            
            // Explicitly inject current month if not present
            if (!monthsSet.has(todayStr)) {
                const d = new Date(todayStr + "-01T00:00:00");
                const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                if (html.includes('<optgroup label="Months">')) {
                    html = html.replace('<optgroup label="Months">', `<optgroup label="Months"><option value="${todayStr}">${label}</option>`);
                } else {
                    html = `<optgroup label="Months"><option value="${todayStr}">${label}</option></optgroup>` + html;
                }
                select.innerHTML = html;
            }

            if (currentVal && currentVal !== 'all' && select.querySelector(`option[value="${currentVal}"]`)) {
                select.value = currentVal;
            } else if (select.querySelector(`option[value="${todayStr}"]`)) {
                select.value = todayStr;
            } else {
                select.value = 'all';
            }
        }

        function onGlobalFilterChange() {
            renderAnalyticsDashboard();
            renderJobSheet();
            renderReportsTable();
            calculateSalary();
        }

        // REQUIREMENT 4: FIX DATA SORTING (Chronological Order: date ascending, then job_time ascending)
        async function fetchAllData() {
            try {
                const { data, error } = await _supabase
                    .from('jobs')
                    .select('*')
                    .order('date', { ascending: true })
                    .order('job_time', { ascending: true });
                    
                if (error) throw error;
                
                allJobs = data || [];
                
                populateGlobalMonthFilter();
                renderAnalyticsDashboard();
                renderJobSheet();
                renderReportsTable();
                calculateSalary();

            } catch (err) {
                console.error("Fetch Error:", err);
                showToast("Failed to load data from server.", true);
            }
        }

        // --- DASHBOARD & CHARTS ---
        function renderAnalyticsDashboard() {
            const filteredJobs = getFilteredJobs();
            const monthCounts = getMonthJobCounts();

            const totalJobs = filteredJobs.length;
            const totalEarnings = filteredJobs.reduce((acc, j) => acc + Number(j.total), 0);
            const totalMistakesCount = filteredJobs.filter(j => j.mistake_type && j.mistake_type !== 'None').length;
            const totalDeductions = filteredJobs.reduce((acc, j) => acc + Number(j.ddt_amount), 0);
            const largeJobsCount = filteredJobs.filter(j => Number(j.area_sqft) > 2500).length;
            const nightJobsCount = filteredJobs.filter(j => j.is_night_or_weekend).length;

            // Calculate Daily and Monthly jobs for Home Tab
            const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
            const dailyJobsCount = filteredJobs.filter(j => j.date === todayStr).length;
            const monthlyJobsCount = filteredJobs.filter(j => j.date && j.date.startsWith(currentMonthStr)).length;

            const elTotalJobs = document.getElementById('stat_total_jobs'); if (elTotalJobs) elTotalJobs.textContent = totalJobs;
            const elTotalEarnings = document.getElementById('stat_total_earnings'); if (elTotalEarnings) elTotalEarnings.textContent = `Rs. ${formatCurrency(totalEarnings)}`;
            const elTotalMistakes = document.getElementById('stat_total_mistakes'); if (elTotalMistakes) elTotalMistakes.textContent = totalMistakesCount;
            const elTotalDeductions = document.getElementById('stat_total_deductions'); if (elTotalDeductions) elTotalDeductions.textContent = `Rs. ${formatCurrency(totalDeductions)}`;
            const elLargeJobs = document.getElementById('stat_large_jobs'); if (elLargeJobs) elLargeJobs.textContent = largeJobsCount;
            const elNightJobs = document.getElementById('stat_night_jobs'); if (elNightJobs) elNightJobs.textContent = nightJobsCount;
            
            const elHomeDaily = document.getElementById('home_daily_jobs'); if (elHomeDaily) elHomeDaily.textContent = dailyJobsCount;
            const elHomeMonthly = document.getElementById('home_monthly_jobs'); if (elHomeMonthly) elHomeMonthly.textContent = monthlyJobsCount;

            // Monthly Target Progress
            const targetProgress = document.getElementById('stat_target_progress');
            const targetBadge = document.getElementById('target_badge');
            if (targetProgress) targetProgress.textContent = `${totalJobs} / 170`;
            if (targetBadge) {
                if (totalJobs >= 170) {
                    targetBadge.classList.remove('hidden');
                } else {
                    targetBadge.classList.add('hidden');
                }
            }

            // Client Summary Grouping
            const clientCounts = {};
            filteredJobs.forEach(job => {
                const name = String(job.client_name || 'Unknown').trim();
                clientCounts[name] = (clientCounts[name] || 0) + 1;
            });
            
            const tbody = document.getElementById('client_summary_body');
            const sortedClients = Object.entries(clientCounts).sort((a,b) => b[1] - a[1]);
            const elClientCount = document.getElementById('client_summary_count');
            if (elClientCount) elClientCount.textContent = `${sortedClients.length} Clients`;

            if (tbody) {
                if (sortedClients.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="2" class="p-4 text-center text-[#a1a1aa]">No jobs in selected period.</td></tr>`;
                } else {
                    tbody.innerHTML = sortedClients.map(([name, count]) => `
                        <tr class="hover:bg-[#393939]/30 transition-all duration-150 ease-out border-b border-[#27272a]">
                            <td class="px-6 py-4 text-[#fafafa] text-sm font-sans font-medium">${name}</td>
                            <td class="px-6 py-4 text-right text-sm text-emerald-400 font-bold">${count}</td>
                        </tr>
                    `).join('');
                }
            }

            renderCharts(filteredJobs, sortedClients);
        }

        function renderCharts(jobs, sortedClients) {
            if (weeklyChartInstance) weeklyChartInstance.destroy();
            if (monthlyTimelineChartInstance) monthlyTimelineChartInstance.destroy();
            if (dayNightChartInstance) dayNightChartInstance.destroy();

            // Calculate Top Client
            const elTopClient = document.getElementById('stat_top_client');
            if (elTopClient) {
                if (sortedClients && sortedClients.length > 0) {
                    elTopClient.textContent = sortedClients[0][0];
                } else {
                    elTopClient.textContent = "None";
                }
            }

            // Calculate Accuracy
            const noMistakeCount = jobs.filter(j => !j.mistake_type || j.mistake_type === 'None').length;
            const accRate = jobs.length > 0 ? ((noMistakeCount / jobs.length) * 100).toFixed(1) : 0;
            const elAccuracy = document.getElementById('stat_accuracy');
            if (elAccuracy) elAccuracy.textContent = accRate + '%';

            const mistakeFreq = {};
            jobs.forEach(j => {
                if (j.mistake_type && j.mistake_type !== 'None') {
                    mistakeFreq[j.mistake_type] = (mistakeFreq[j.mistake_type] || 0) + 1;
                }
            });
            const topMistake = Object.entries(mistakeFreq).sort((a,b)=>b[1]-a[1])[0];
            const elFreqMistake = document.getElementById('stat_freq_mistake');
            if (elFreqMistake) elFreqMistake.textContent = topMistake ? "Top Error: " + topMistake[0] : "Perfect Accuracy!";

            // Weekly Peak Chart Data
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weekCounts = [0,0,0,0,0,0,0];
            jobs.forEach(j => {
                const d = new Date(j.date + 'T00:00:00');
                if(!isNaN(d)) weekCounts[d.getDay()]++;
            });

            // 24-Hour Peak Time Zones Data
            const hourLabels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
            const hourCounts = new Array(24).fill(0);
            jobs.forEach(j => {
                if(j.job_time) {
                    const hour = parseInt(j.job_time.split(':')[0], 10);
                    if(!isNaN(hour) && hour >= 0 && hour < 24) {
                        hourCounts[hour]++;
                    }
                }
            });

            // Day vs Night
            let dayCount = 0, nightCount = 0;
            jobs.forEach(j => {
                if(j.is_night_or_weekend) nightCount++;
                else dayCount++;
            });

            const commonOptions = { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false } 
                }, 
                scales: { 
                    y: { ticks: { color: '#a1a1aa', font: { family: "'IBM Plex Mono', monospace" } }, grid: { display: false }, border: { display: false } }, 
                    x: { ticks: { color: '#a1a1aa', font: { family: "'IBM Plex Mono', monospace" } }, grid: { display: false }, border: { display: false } } 
                } 
            };

            const wCtx = document.getElementById('weeklyChart');
            if(wCtx) {
                weeklyChartInstance = new Chart(wCtx, {
                    type: 'bar',
                    data: { labels: days, datasets: [{ label: 'Jobs', data: weekCounts, backgroundColor: '#0f62fe', borderRadius: 4, barThickness: 12 }] },
                    options: commonOptions
                });
            }

            const mCtx = document.getElementById('monthlyTimelineChart');
            if(mCtx) {
                monthlyTimelineChartInstance = new Chart(mCtx, {
                    type: 'bar',
                    data: { labels: hourLabels, datasets: [{ label: 'Jobs', data: hourCounts, backgroundColor: '#fafafa', borderRadius: 4, barThickness: 8 }] },
                    options: {
                        ...commonOptions,
                        scales: {
                            y: { ...commonOptions.scales.y, display: false },
                            x: { ...commonOptions.scales.x, ticks: { ...commonOptions.scales.x.ticks, maxTicksLimit: 8 } }
                        }
                    }
                });
            }

            const dnCtx = document.getElementById('dayNightChart');
            if(dnCtx) {
                dayNightChartInstance = new Chart(dnCtx, {
                    type: 'bar',
                    data: { 
                        labels: ['Shift'], 
                        datasets: [
                            { label: 'Day Jobs', data: [dayCount], backgroundColor: '#fafafa', barThickness: 16, borderRadius: 2 },
                            { label: 'Night/Weekend', data: [nightCount], backgroundColor: '#fbbf24', barThickness: 16, borderRadius: 2 }
                        ] 
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        indexAxis: 'y',
                        plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa', boxWidth: 8, font: { family: "'IBM Plex Sans', sans-serif", size: 10 } } } }, 
                        scales: {
                            x: { stacked: true, display: false },
                            y: { stacked: true, display: false }
                        }
                    }
                });
            }
        }

        // --- HOLIDAY SYSTEM ---
        function getHolidays() {
            try { return JSON.parse(localStorage.getItem('marked_holidays') || '[]'); } catch { return []; }
        }
        
        function renderHolidayList() {
            const container = document.getElementById('holiday_list_container');
            if (!container) return;
            const holidays = getHolidays();
            if (holidays.length === 0) {
                container.innerHTML = '<span class="text-xs text-[#a1a1aa] italic">No marked holidays</span>';
                return;
            }
            container.innerHTML = holidays.map(h => `
                <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-full text-xs font-mono">
                    <span>${h}</span>
                    <button type="button" onclick="removeHoliday('${h}')" class="text-rose-400 hover:text-rose-200 transition-colors p-0.5" title="Remove Holiday">
                        <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                </div>
            `).join('');
            lucide.createIcons();
        }

        function removeHoliday(hDate) {
            let holidays = getHolidays();
            holidays = holidays.filter(h => h !== hDate);
            localStorage.setItem('marked_holidays', JSON.stringify(holidays));
            renderHolidayList();
            calculateSalary();
            showToast('Holiday Removed', `Removed ${hDate} from marked holidays.`);
        }

        function markHoliday() {
            const hDate = document.getElementById('holiday_date_input').value;
            if(!hDate) return alert("Select a date first!");
            const holidays = getHolidays();
            if(!holidays.includes(hDate)) {
                holidays.push(hDate);
                localStorage.setItem('marked_holidays', JSON.stringify(holidays));
                renderHolidayList();
                showToast('Holiday Marked!', 'Date saved and added to Salary calculation.');
                if (isSalaryUnlocked) calculateSalary();
            } else {
                showToast('Warning', 'This holiday is already marked!', true);
            }
        }

        // --- SALARY CALCULATION ---
        function calculateSalary() {
            const filteredJobs = getFilteredJobs();
            const monthCounts = getMonthJobCounts();
            const basicSalary = 35453.00;
            
            let baseJobEarnings = 0;
            let totalBonusAmount = 0;

            filteredJobs.forEach(j => {
                const ym = j.date ? j.date.substring(0, 7) : '';
                const bonus = (monthCounts[ym] || 0) >= 170 ? 50 : 0;
                baseJobEarnings += Number(j.total);
                totalBonusAmount += bonus;
            });

            const penalties = filteredJobs.reduce((acc, j) => acc + Number(j.ddt_amount), 0);
            const totalJobEarningsWithBonus = baseJobEarnings + totalBonusAmount;
            
            let specialAllowance = totalJobEarningsWithBonus - basicSalary;
            if (specialAllowance < 0) specialAllowance = 0; 
            
            const currentFilter = document.getElementById('globalMonthFilter').value;
            let holidayDays = 0;
            const savedHolidays = getHolidays();
            if (currentFilter !== 'all') {
                holidayDays = savedHolidays.filter(h => h.startsWith(currentFilter)).length;
            } else {
                holidayDays = savedHolidays.length;
            }
            
            const holidayAllowance = holidayDays * 1772.65;

            const netSalary = basicSalary + specialAllowance + holidayAllowance - penalties;

            document.getElementById('sal_special').textContent = `Rs. ${formatCurrency(specialAllowance)}`;
            document.getElementById('sal_target_bonus').textContent = `Rs. ${formatCurrency(totalBonusAmount)}`;
            document.getElementById('sal_holiday').textContent = `Rs. ${formatCurrency(holidayAllowance)}`;
            document.getElementById('sal_penalties').textContent = `- Rs. ${formatCurrency(penalties)}`;
            document.getElementById('sal_net').textContent = `Rs. ${formatCurrency(netSalary)}`;
        }

        // JOB SHEET & REPORTS HTML GENERATOR
        function getJobRowHTML(job, isReport = false, seqNo = 1, bonus = 0) {
            const dateFormatted = new Date(job.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const finalTotal = Number(job.total) + bonus;
            
            if (isReport) {
                return `
                    <tr class="hover:bg-[#393939]/30 transition-all duration-150 ease-out border-b border-[#27272a]">
                        <td class="px-4 py-2.5 text-[#a1a1aa] font-mono text-xs">${seqNo}</td>
                        <td class="px-4 py-2.5 text-[#a1a1aa] text-xs font-mono">${dateFormatted}</td>
                        <td class="px-4 py-2.5 font-sans font-semibold text-[#fafafa] text-xs">${job.client_name}</td>
                        <td class="px-4 py-2.5 font-sans text-[#fafafa] text-xs">${job.address_title}</td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs text-[#fafafa]">${Number(job.area_sqft).toLocaleString()}</td>
                        <td class="px-4 py-2.5 font-mono text-[#a1a1aa] text-xs text-center">${job.region}</td>
                        <td class="px-4 py-2.5 text-center text-xs text-[#a1a1aa]">${job.is_color ? 'Yes' : 'No'}</td>
                        <td class="px-4 py-2.5 text-center text-xs text-[#a1a1aa]">${job.mistake_type === 'None' ? '' : job.mistake_type}</td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs text-[#a1a1aa]">${formatCurrency(job.price)}</td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs text-[#30d158]">${formatCurrency(job.no_mistake_amount)}</td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs text-[#ff9f0a]">${job.ddt_amount > 0 ? '-'+formatCurrency(job.ddt_amount) : '0.00'}</td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs font-bold text-[#fafafa]">${formatCurrency(finalTotal)}</td>
                    </tr>
                `;
            }

            return `
                <tr class="hover:bg-[#393939]/30 transition-all duration-150 ease-out border-b border-[#27272a]">
                    <td class="px-4 py-3.5 text-center text-[#a1a1aa] font-mono text-xs">${seqNo}</td>
                    <td class="px-4 py-3.5 whitespace-nowrap text-[#a1a1aa] text-xs font-mono">${dateFormatted}</td>
                    <td class="px-4 py-3.5 font-sans text-xs text-[#a1a1aa]">${job.client_name}</td>
                    <td class="px-4 py-3.5 font-sans text-base font-medium text-[#fafafa] truncate max-w-[220px]" title="${job.address_title}">${job.address_title}</td>
                    <td class="px-4 py-3.5 text-right">
                        <div class="font-mono text-[#fafafa] text-lg font-bold">${Number(job.area_sqft).toLocaleString()}</div>
                        <div class="w-full bg-[#393939] h-1 mt-1.5 rounded-full overflow-hidden">
                            <div class="bg-[#0f62fe] h-full rounded-full" style="width: ${Math.min((job.area_sqft / 5000) * 100, 100)}%"></div>
                        </div>
                    </td>
                    <td class="px-4 py-3.5 text-center text-xs font-sans text-[#a1a1aa]">${job.region}</td>
                    <td class="px-4 py-3.5 text-center">${job.is_color ? '<span class="w-2 h-2 rounded-full bg-[#bf5af2] inline-block"></span>' : '<span class="text-[#a1a1aa]">-</span>'}</td>
                    <td class="px-4 py-3.5 font-sans text-xs text-center">${job.mistake_type === 'None' ? '<span class="text-[#a1a1aa]">-</span>' : `<span class="w-2 h-2 rounded-full bg-[#ff9f0a] inline-block" title="${job.mistake_type}"></span>`}</td>
                    <td class="px-4 py-3.5 text-right font-mono text-xs text-[#a1a1aa]">${formatCurrency(job.price)}</td>
                    <td class="px-4 py-3.5 text-right font-mono text-xs text-[#30d158]">${formatCurrency(job.no_mistake_amount)}</td>
                    <td class="px-4 py-3.5 text-right font-mono text-xs text-[#ff9f0a]">${job.ddt_amount > 0 ? '-'+formatCurrency(job.ddt_amount) : '0.00'}</td>
                    <td class="px-4 py-3.5 text-right font-mono text-sm font-bold text-[#fafafa] bg-transparent">${formatCurrency(finalTotal)}</td>
                    <td class="px-4 py-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="openViewModal(${job.id})" class="text-[#a1a1aa] hover:text-[#0f62fe] p-1 transition-colors" title="View All Info">
                                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="openEditModal(${job.id})" class="text-[#a1a1aa] hover:text-[#0f62fe] p-1 transition-colors" title="Edit Job">
                                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="deleteJob(${job.id})" class="text-rose-500 hover:text-rose-400 p-1 transition-colors" title="Delete Job">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }

        function renderJobSheet() {
            const filteredJobs = getFilteredJobs();
            const monthCounts = getMonthJobCounts();
            const tbody = document.getElementById('management_table_body');
            
            if (!tbody) return;

            const searchVal = (document.getElementById('jobsheet_search')?.value || '').trim();

            let displayJobs = filteredJobs;
            if (searchVal) {
                displayJobs = filteredJobs.filter(job => {
                    const combinedTarget = `${job.address_title || ''} ${job.client_name || ''} ${job.region || ''} ${job.mistake_type || ''} ${job.date || ''} ${job.area_sqft || ''}`;
                    return fuzzyMatch(searchVal, combinedTarget);
                });
            }

            if (displayJobs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="13" class="px-4 py-12 text-center text-[#a1a1aa]">No jobs found matching search criteria.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = displayJobs.map((job, idx) => {
                const ym = job.date ? job.date.substring(0, 7) : '';
                const bonus = (monthCounts[ym] || 0) >= 170 ? 50 : 0;
                return getJobRowHTML(job, false, idx + 1, bonus);
            }).join('');

            lucide.createIcons();
        }

        // REPORTS EXPORT GROUPING
        function renderReportsTable() {
            const filteredJobs = getFilteredJobs();
            const monthCounts = getMonthJobCounts();
            const tbody = document.getElementById('reports_table_body');
            
            if (!tbody) return;

            if (filteredJobs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="12" class="px-4 py-8 text-center text-[#a1a1aa]">No jobs in selected period.</td></tr>`;
                return;
            }
            
            // Sort by date ascending, then job_time ascending
            const sortedByDate = [...filteredJobs].sort((a,b) => {
                const dateDiff = new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00');
                if (dateDiff !== 0) return dateDiff;
                return (a.job_time || '').localeCompare(b.job_time || '');
            });

            const grouped = {};
            sortedByDate.forEach(job => {
                const dateKey = job.date;
                if (!grouped[dateKey]) grouped[dateKey] = { day: [], night: [] };
                if (job.is_night_or_weekend) grouped[dateKey].night.push(job);
                else grouped[dateKey].day.push(job);
            });

            let finalHTML = '';
            let seqNo = 1;

            Object.keys(grouped).forEach(dateStr => {
                const dayGroup = grouped[dateStr].day;
                const nightGroup = grouped[dateStr].night;
                const dateDisplay = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                if (dayGroup.length > 0) {
                    finalHTML += `<tr class="bg-[#393939] border-b border-[#27272a]"><td colspan="12" class="font-bold text-[#fafafa] py-2.5 px-4 uppercase text-xs tracking-wider">${dateDisplay} - Day Jobs</td></tr>`;
                    dayGroup.forEach(job => {
                        const ym = job.date ? job.date.substring(0, 7) : '';
                        const bonus = (monthCounts[ym] || 0) >= 170 ? 50 : 0;
                        finalHTML += getJobRowHTML(job, true, seqNo++, bonus);
                    });
                }
                
                if (nightGroup.length > 0) {
                    finalHTML += `<tr class="bg-[#393939] border-b border-[#27272a]"><td colspan="12" class="font-bold text-[#fafafa] py-2.5 px-4 uppercase text-xs tracking-wider">${dateDisplay} - Night & Weekend Jobs</td></tr>`;
                    nightGroup.forEach(job => {
                        const ym = job.date ? job.date.substring(0, 7) : '';
                        const bonus = (monthCounts[ym] || 0) >= 170 ? 50 : 0;
                        finalHTML += getJobRowHTML(job, true, seqNo++, bonus);
                    });
                }
            });
            
            tbody.innerHTML = finalHTML;
        }

        function copyReportsTable() {
            const table = document.getElementById('reports_table');
            let textToCopy = '';
            
            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            textToCopy += headers.join('\t') + '\n';
            
            const rows = table.querySelectorAll('tbody tr');
            if (rows.length === 1 && rows[0].cells.length === 1) {
                showToast("No data to copy", true);
                return;
            }

            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
                textToCopy += cells.join('\t') + '\n';
            });
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast("Copied to clipboard! Ready to paste into Excel.");
            }).catch(err => {
                showToast("Failed to copy table.", true);
            });
        }

        // --- EXCEL BULK IMPORT ---
        async function handleExcelImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {raw: false});

                    if (jsonData.length === 0) {
                        showToast("The uploaded Excel sheet is empty.", true);
                        return;
                    }

                    const jobsToInsert = [];
                    let currentJobCount = allJobs.length; 

                    for (const row of jsonData) {
                        const rawDate = row['Date'] || row['date'] || '';
                        let formattedDate = rawDate;
                        if (rawDate && rawDate.includes('/')) {
                            const parts = rawDate.split('/');
                            if (parts.length === 3) {
                                const y = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
                                const m = parts[0].padStart(2, '0');
                                const d = parts[1].padStart(2, '0');
                                formattedDate = `${y}-${m}-${d}`;
                            }
                        }

                        const job_time = row['Time'] || row['time'] || row['Job Time'] || '00:00:00';
                        const client_name = row['Client Name'] || row['Client'] || row['client_name'] || '';
                        const address_title = row['Address / Title'] || row['Address'] || row['Title'] || row['address_title'] || '';
                        const area_sqft = parseFloat(row['Area Sqft'] || row['Area (Sqft)'] || row['Area'] || row['area_sqft']) || 0;
                        const region = row['Region'] || row['region'] || 'Standard';
                        const mistake_type = row['Mistake Type'] || row['Mistake'] || row['mistake_type'] || 'None';
                        
                        const colorStr = String(row['Color Plan'] || row['Color'] || row['is_color'] || '').toLowerCase();
                        const is_color = (colorStr === 'yes' || colorStr === 'true' || colorStr === '1');
                        
                        const nightStr = String(row['Night Weekend'] || row['Night / Weekend'] || row['is_night_or_weekend'] || '').toLowerCase();
                        const is_night_or_weekend = (nightStr === 'yes' || nightStr === 'true' || nightStr === '1');

                        if (!client_name || !address_title) continue;

                        const rawJobData = {
                            date: formattedDate,
                            job_time,
                            client_name,
                            address_title,
                            area_sqft,
                            region,
                            mistake_type,
                            is_color,
                            is_night_or_weekend
                        };

                        const totals = calculatePricing(rawJobData, currentJobCount);
                        jobsToInsert.push({ ...rawJobData, ...totals });
                        currentJobCount++;
                    }

                    if (jobsToInsert.length === 0) {
                        showToast("No valid job rows found to import.", true);
                        return;
                    }

                    const { error } = await _supabase.from('jobs').insert(jobsToInsert);
                    if (error) throw error;

                    showToast(`Successfully imported ${jobsToInsert.length} jobs!`);
                    document.getElementById('excelUpload').value = "";
                    await fetchAllData();

                } catch (err) {
                    console.error("Import Error:", err);
                    showToast("Failed to import Excel data.", true);
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // --- CRUD ACTIONS ---
        document.getElementById('addJobForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            btn.disabled = true; btn.classList.add('opacity-70');
            
            const clientNameInput = document.getElementById('client_name').value;
            if(!clientNameInput) {
                showToast("Please select a client from the grid.", true);
                btn.disabled = false; btn.classList.remove('opacity-70');
                return;
            }

            const rawData = {
                date: document.getElementById('date').value,
                client_name: clientNameInput,
                address_title: document.getElementById('address_title').value,
                area_sqft: document.getElementById('area_sqft').value,
                region: document.getElementById('region').value,
                mistake_type: document.getElementById('mistake_type').value,
                is_color: document.getElementById('is_color').checked,
                job_time: document.getElementById('job_time').value,
                is_night_or_weekend: document.getElementById('is_night_or_weekend').checked
            };

            const totals = calculatePricing(rawData, allJobs.length);
            const insertPayload = { ...rawData, ...totals };

            try {
                const { error } = await _supabase.from('jobs').insert([insertPayload]);
                if (error) throw error;
                
                showToast("Job added successfully!");
                document.getElementById('addJobForm').reset();
                document.getElementById('client_name').value = '';
                document.querySelectorAll('.client-btn').forEach(btn => {
                    btn.classList.remove('bg-[#0f62fe]', 'text-[#fafafa]');
                    btn.classList.add('bg-[#393939]', 'text-[#a1a1aa]');
                });
                
                isUserNightWeekendOverridden = false;
                isUserTimeEdited = false;
                isUserDateEdited = false;
                await fetchAllData();
            } catch (err) {
                showToast(err.message, true);
            } finally {
                btn.disabled = false; btn.classList.remove('opacity-70');
            }
        });

        async function deleteJob(id) {
            if (!confirm("Are you sure you want to delete Job #" + id + "?")) return;
            
            try {
                const { error } = await _supabase.from('jobs').delete().eq('id', id);
                if (error) throw error;
                showToast("Job deleted successfully.");
                await fetchAllData();
            } catch (err) {
                showToast("Failed to delete job.", true);
            }
        }

        function openEditModal(id) {
            const job = allJobs.find(j => j.id === id);
            if (!job) return;

            document.getElementById('edit_id').value = job.id;
            document.getElementById('edit_date').value = job.date;
            
            const clientSelect = document.getElementById('edit_client_name');
            // Dynamically add option if custom client isn't in predefined groups
            let optionExists = Array.from(clientSelect.options).some(opt => opt.value === job.client_name);
            if(!optionExists) {
                const newOpt = document.createElement('option');
                newOpt.value = job.client_name;
                newOpt.textContent = job.client_name;
                clientSelect.appendChild(newOpt);
            }
            clientSelect.value = job.client_name;
            
            document.getElementById('edit_address_title').value = job.address_title;
            document.getElementById('edit_area_sqft').value = job.area_sqft;
            document.getElementById('edit_region').value = job.region;
            document.getElementById('edit_mistake_type').value = job.mistake_type || 'None';
            document.getElementById('edit_is_color').checked = job.is_color;
            document.getElementById('edit_job_time').value = job.job_time || '';
            document.getElementById('edit_is_night_or_weekend').checked = job.is_night_or_weekend || false;

            document.getElementById('editModal').classList.remove('hidden');
        }

        function closeEditModal() {
            document.getElementById('editModal').classList.add('hidden');
        }

        document.getElementById('editJobForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('editSubmitBtn');
            btn.disabled = true; btn.innerText = "Saving...";

            const id = document.getElementById('edit_id').value;
            const rawData = {
                date: document.getElementById('edit_date').value,
                client_name: document.getElementById('edit_client_name').value,
                address_title: document.getElementById('edit_address_title').value,
                area_sqft: document.getElementById('edit_area_sqft').value,
                region: document.getElementById('edit_region').value,
                mistake_type: document.getElementById('edit_mistake_type').value,
                is_color: document.getElementById('edit_is_color').checked,
                job_time: document.getElementById('edit_job_time').value,
                is_night_or_weekend: document.getElementById('edit_is_night_or_weekend').checked
            };

            const totals = calculatePricing(rawData, allJobs.length);
            const updatePayload = { ...rawData, ...totals };

            try {
                const { error } = await _supabase.from('jobs').update(updatePayload).eq('id', id);
                if (error) throw error;
                
                showToast("Job updated successfully!");
                closeEditModal();
                await fetchAllData();
            } catch (err) {
                showToast(err.message, true);
            } finally {
                btn.disabled = false; btn.innerText = "Save Changes";
            }
        });

        // --- AUTOMATION & REAL-TIME CLOCK ---
        function getSriLankaDateAndTime() {
            const now = new Date();
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
            const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
            return { dateStr, timeStr };
        }

        function autoCheckNightWeekend(dateId, timeId, checkboxId, isManualInputChange = false) {
            if (isManualInputChange) {
                if (checkboxId === 'is_night_or_weekend') isUserNightWeekendOverridden = false;
                if (dateId === 'date') isUserDateEdited = true;
                if (timeId === 'job_time') isUserTimeEdited = true;
            }
            if (isUserNightWeekendOverridden && checkboxId === 'is_night_or_weekend') {
                return;
            }
            
            const dateStr = document.getElementById(dateId).value;
            const timeStr = document.getElementById(timeId).value;
            const checkbox = document.getElementById(checkboxId);
            
            if (!dateStr || !timeStr || !checkbox) return;
            
            const [year, month, day] = dateStr.split('-').map(Number);
            const d = new Date(year, month - 1, day);
            const dayOfWeek = d.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            const [hours, minutes] = timeStr.split(':').map(Number);
            const timeVal = hours + (minutes / 60);
            const isNight = (timeVal < 7 || timeVal >= 17);
            
            checkbox.checked = isWeekend || isNight;
        }

        function updateRealTimeClock() {
            const dateElem = document.getElementById('date');
            const timeElem = document.getElementById('job_time');
            const headerClock = document.getElementById('header_live_clock');
            
            const { dateStr, timeStr } = getSriLankaDateAndTime();

            if (headerClock) headerClock.textContent = timeStr;
            
            if (document.activeElement !== dateElem && dateElem && (!dateElem.value || !isUserDateEdited)) {
                dateElem.value = dateStr;
            }
            
            if (document.activeElement !== timeElem && timeElem && (!timeElem.value || !isUserTimeEdited)) {
                timeElem.value = timeStr;
            }
            
            autoCheckNightWeekend('date', 'job_time', 'is_night_or_weekend');
        }

        setInterval(updateRealTimeClock, 1000);
        updateRealTimeClock();

        // --- SMART UTILITY TOOLS ---
        function convertArea(source) {
            const sqmInput = document.getElementById('tool_sqm');
            const sqftInput = document.getElementById('tool_sqft');
            
            if (source === 'sqm') {
                const sqm = parseFloat(sqmInput.value);
                if (!isNaN(sqm)) {
                    sqftInput.value = (sqm / 0.09290304).toFixed(2);
                } else {
                    sqftInput.value = '';
                }
            } else if (source === 'sqft') {
                const sqft = parseFloat(sqftInput.value);
                if (!isNaN(sqft)) {
                    sqmInput.value = (sqft * 0.09290304).toFixed(2);
                } else {
                    sqmInput.value = '';
                }
            }
        }

        function useAreaInForm() {
            const sqft = document.getElementById('tool_sqft').value;
            if (sqft) {
                document.getElementById('area_sqft').value = sqft;
                showToast("Area applied to form.");
            } else {
                showToast("Please enter an area first.", true);
            }
        }

        // --- TITLE CASE & UK POSTCODE FORMATTING ---
        function toTitleCaseWithPostcode(str) {
            if (!str) return '';
            let result = str.toLowerCase().replace(/(?:^|\s|[(\/\-])[a-z]/g, match => match.toUpperCase());
            
            const fullPostcodeRegex = /\b([a-pr-uwyz][a-hk-y0-9][a-hjkps-uw0-9]?[a-hjkps-uw0-9]?)\s*([0-9][abd-hjlnp-uw-z]{2})\b/ig;
            result = result.replace(fullPostcodeRegex, (m, p1, p2) => `${p1.toUpperCase()} ${p2.toUpperCase()}`);

            const partialPostcodeRegex = /\b([a-pr-uwyz]{1,2}[0-9][a-hjkps-uw0-9]?)\b/ig;
            result = result.replace(partialPostcodeRegex, m => m.toUpperCase());

            return result;
        }

        function autoFormatAddressInput(inputEl) {
            if (inputEl && inputEl.value) {
                inputEl.value = toTitleCaseWithPostcode(inputEl.value);
            }
        }

        function formatAddress() {
            const inputEl = document.getElementById('tool_address');
            let addr = inputEl.value;
            if (!addr.trim()) return;

            addr = addr.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();

            const abbrMap = [
                { regex: /\b(r|rd)\b/ig, rep: "Road" },
                { regex: /\b(st)\b/ig, rep: "Street" },
                { regex: /\b(ave)\b/ig, rep: "Avenue" },
                { regex: /\b(cl)\b/ig, rep: "Close" },
                { regex: /\b(fl)\b/ig, rep: "Flat" },
                { regex: /\b(apt|apart)\b/ig, rep: "Apartment" },
                { regex: /\b(ln)\b/ig, rep: "Lane" },
                { regex: /\b(dr)\b/ig, rep: "Drive" },
                { regex: /\b(ct)\b/ig, rep: "Court" },
                { regex: /\b(cres)\b/ig, rep: "Crescent" },
                { regex: /\b(pk)\b/ig, rep: "Park" },
                { regex: /\b(gdns)\b/ig, rep: "Gardens" }
            ];
            abbrMap.forEach(item => { addr = addr.replace(item.regex, item.rep); });

            addr = addr.toLowerCase().replace(/(?:^|\s|,)[a-z]/g, match => match.toUpperCase());

            const fullPostcodeRegex = /\b([a-pr-uwyz][a-hk-y0-9][a-hjkps-uw0-9]?[a-hjkps-uw0-9]?)\s*([0-9][abd-hjlnp-uw-z]{2})\b/ig;
            addr = addr.replace(fullPostcodeRegex, (m, p1, p2) => `${p1.toUpperCase()} ${p2.toUpperCase()}`);

            const partialPostcodeRegex = /\b([a-z]{1,2}[0-9][a-z0-9]?)\b/ig;
            addr = addr.replace(partialPostcodeRegex, m => m.toUpperCase());

            let flatPrefix = '';
            const flatRegex = /\b(Flat|Apartment)\s+([A-Za-z0-9]+)\b/i;
            const flatMatch = addr.match(flatRegex);
            if (flatMatch) {
                flatPrefix = `${flatMatch[1]} ${flatMatch[2].toUpperCase()}`;
                addr = addr.replace(flatRegex, '').trim();
            }

            const streetSuffixes = "Road|Street|Avenue|Close|Lane|Drive|Court|Way|Crescent|Park|Gardens|Place|Square|Hill|Row|Terrace|Mews|Rise|Grove|Walk";
            const streetSuffixRegex = new RegExp(`\\b(${streetSuffixes})\\s+([A-Za-z]+)\\b`, "g");
            addr = addr.replace(streetSuffixRegex, "$1, $2");

            const postcodeCommaRegex = /\s*,*\s*\b([A-Z]{1,2}[0-9][A-Z0-9]?\s+[0-9][A-Z]{2}|[A-Z]{1,2}[0-9][A-Z0-9]?)\b/g;
            addr = addr.replace(postcodeCommaRegex, ", $1");

            if (flatPrefix) addr = `${flatPrefix}, ${addr}`;

            addr = addr.replace(/\s*,+\s*/g, ', ').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
            inputEl.value = toTitleCaseWithPostcode(addr);
        }

        function useAddressInForm() {
            const addr = document.getElementById('tool_address').value;
            if (addr.trim()) {
                document.getElementById('address_title').value = addr.trim();
                showToast("Address applied to form.");
            } else {
                showToast("Please format an address first.", true);
            }
        }

        function searchAddressOnGoogle() {
            const addr = document.getElementById('tool_address').value;
            if (addr.trim()) {
                const query = encodeURIComponent(addr.trim());
                window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
            } else {
                showToast("Please enter an address to search.", true);
            }
        }

        // INITIALIZE ON LOAD
        window.addEventListener('DOMContentLoaded', () => {
            initClientGrid();
            lucide.createIcons();
            fetchAllData();
            renderHolidayList();
        });