import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Award, 
  Calendar, 
  Printer, 
  TrendingUp, 
  CheckCircle2, 
  HelpCircle, 
  Plus, 
  Layers, 
  Zap,
  Gift,
  X
} from 'lucide-react';

export default function SalaryTab({ jobs, availableMonths, monthFilter, setMonthFilter }) {
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const activeMonth = monthFilter === 'all' ? currentMonthStr : monthFilter;

  // Payroll allowance editable state
  const [specialAllowance, setSpecialAllowance] = useState(5000);
  const [holidayAllowance, setHolidayAllowance] = useState(0);
  const [showPayslipModal, setShowPayslipModal] = useState(false);

  // Filter jobs for selected payroll month
  const monthJobs = useMemo(() => {
    return jobs.filter(j => j.date && j.date.startsWith(activeMonth));
  }, [jobs, activeMonth]);

  const monthlyJobCount = monthJobs.length;

  // 1. Basic Salary fixed at LKR 35,453
  const BASIC_SALARY = 35453;

  // 2. Total Job Earnings for the month
  const totalJobEarnings = useMemo(() => {
    return monthJobs.reduce((acc, j) => acc + (parseFloat(j.total) || 0), 0);
  }, [monthJobs]);

  // 3. Target Bonus: LKR 50/job if monthly jobs >= 170
  const isTargetBonusEligible = monthlyJobCount >= 170;
  const targetBonusAmount = isTargetBonusEligible ? monthlyJobCount * 50 : 0;

  // 4. Net Payable Amount
  const netPayable = BASIC_SALARY + totalJobEarnings + (parseFloat(specialAllowance) || 0) + targetBonusAmount + (parseFloat(holidayAllowance) || 0);

  // Target Bonus progress
  const targetProgress = Math.min(100, Math.round((monthlyJobCount / 170) * 100));

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header Banner & Month Selector */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <DollarSign className="w-4 h-4" />
            <span>Monthly Payroll & Payslip Engine</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Salary Statement for {activeMonth}</h2>
          <p className="text-xs text-gray-400 mt-1">
            Itemized breakdown including base pay, job earnings, target bonuses, and allowances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0d1117] border border-white/10 text-xs font-medium text-gray-300">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>Month:</span>
            <select
              value={activeMonth}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              {availableMonths.map(m => (
                <option key={m} value={m} className="bg-[#161b22] text-white">
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowPayslipModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Payslip</span>
          </button>
        </div>
      </div>

      {/* Target Bonus Threshold Progress Banner */}
      <div className="glass-panel p-6 rounded-3xl border border-white/10 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isTargetBonusEligible ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Monthly Target Bonus (LKR 50 / Job)</h3>
              <p className="text-xs text-gray-400">Target threshold: Complete 170+ jobs in {activeMonth} to qualify for LKR 50 extra per job.</p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xl font-bold font-mono ${isTargetBonusEligible ? 'text-emerald-400' : 'text-gray-400'}`}>
              {isTargetBonusEligible ? `+ LKR ${targetBonusAmount.toLocaleString()}` : 'LKR 0 Bonus'}
            </span>
            <p className="text-xs text-gray-500">{monthlyJobCount} / 170 jobs completed</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-[#0d1117] h-3 rounded-full overflow-hidden border border-white/10 p-0.5">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${isTargetBonusEligible ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/30' : 'bg-gradient-to-r from-blue-600 to-indigo-500'}`}
            style={{ width: `${targetProgress}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-[11px] font-semibold text-gray-400 mt-2">
          <span>0 Jobs</span>
          <span className={isTargetBonusEligible ? 'text-emerald-400 font-bold' : ''}>Target: 170 Jobs ({targetProgress}%)</span>
          <span>200+ Jobs</span>
        </div>
      </div>

      {/* Grid: Itemized Calculation Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Salary Components Breakdown (7 cols) */}
        <div className="lg:col-span-7 glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6">
          <h3 className="text-base font-bold text-white pb-3 border-b border-white/10 flex items-center justify-between">
            <span>Salary Earnings Breakdown</span>
            <span className="text-xs font-mono text-gray-400">{activeMonth}</span>
          </h3>

          <div className="space-y-4 text-sm">
            
            {/* Basic Salary */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0d1117] border border-white/10">
              <div>
                <span className="font-semibold text-white">Basic Salary</span>
                <p className="text-xs text-gray-400">Fixed monthly base pay</p>
              </div>
              <span className="font-mono font-bold text-white text-base">LKR {BASIC_SALARY.toLocaleString()}</span>
            </div>

            {/* Total Job Earnings */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0d1117] border border-white/10">
              <div>
                <span className="font-semibold text-white">Job Earnings ({monthlyJobCount} jobs)</span>
                <p className="text-xs text-gray-400">Sum of all floorplan payouts in {activeMonth}</p>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-base">LKR {totalJobEarnings.toLocaleString()}</span>
            </div>

            {/* Special Allowance (Editable) */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0d1117] border border-white/10">
              <div>
                <span className="font-semibold text-white">Special Allowance</span>
                <p className="text-xs text-gray-400">Adjustable bonus allowance</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">LKR</span>
                <input
                  type="number"
                  value={specialAllowance}
                  onChange={(e) => setSpecialAllowance(e.target.value)}
                  className="w-28 px-3 py-1.5 rounded-xl bg-[#161b22] border border-white/10 text-right text-white font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Target Bonus */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0d1117] border border-white/10">
              <div>
                <span className="font-semibold text-white">Target Bonus</span>
                <p className="text-xs text-gray-400">
                  {isTargetBonusEligible ? `LKR 50 x ${monthlyJobCount} jobs` : 'Requires >= 170 jobs'}
                </p>
              </div>
              <span className={`font-mono font-bold text-base ${isTargetBonusEligible ? 'text-emerald-400' : 'text-gray-500'}`}>
                LKR {targetBonusAmount.toLocaleString()}
              </span>
            </div>

            {/* Holiday Allowance (Editable) */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0d1117] border border-white/10">
              <div>
                <span className="font-semibold text-white">Holiday Allowance</span>
                <p className="text-xs text-gray-400">Adjustable holiday compensation</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">LKR</span>
                <input
                  type="number"
                  value={holidayAllowance}
                  onChange={(e) => setHolidayAllowance(e.target.value)}
                  className="w-28 px-3 py-1.5 rounded-xl bg-[#161b22] border border-white/10 text-right text-white font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Net Payable Summary Hero Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-8 rounded-3xl border border-white/10 relative overflow-hidden shadow-2xl space-y-6">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full blur-3xl opacity-20 pointer-events-none"></div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Net Payable Amount</p>
                <h2 className="text-3xl font-black text-emerald-400 font-mono mt-0.5">
                  LKR {netPayable.toLocaleString()}
                </h2>
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-300 pt-4 border-t border-white/10">
              <div className="flex justify-between">
                <span>Fixed Salary Base:</span>
                <span className="font-mono">LKR {BASIC_SALARY.toLocaleString()}</span>
              </div>
              <div className="flex justify-between"><span>Variable Job Earnings:</span><span className="font-mono">LKR {totalJobEarnings.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Bonus & Allowances:</span><span className="font-mono">LKR {( (parseFloat(specialAllowance)||0) + targetBonusAmount + (parseFloat(holidayAllowance)||0) ).toLocaleString()}</span></div>
            </div>

            <button
              onClick={() => setShowPayslipModal(true)}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Generate Printable Payslip</span>
            </button>
          </div>
        </div>

      </div>

      {/* Printable Payslip Modal */}
      {showPayslipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl bg-white text-gray-900 p-8 rounded-3xl shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">SALARY PAYSLIP</h3>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">DraftOps Drafting Services • {activeMonth}</p>
              </div>
              <button
                onClick={() => setShowPayslipModal(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payslip Items Table */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Basic Salary</span>
                <span className="font-mono font-bold">LKR {BASIC_SALARY.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Job Earnings ({monthlyJobCount} Jobs Completed)</span>
                <span className="font-mono font-bold text-emerald-700">LKR {totalJobEarnings.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Special Allowance</span>
                <span className="font-mono font-bold">LKR {(parseFloat(specialAllowance) || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Target Bonus (Threshold &gt;= 170 Jobs)</span>
                <span className="font-mono font-bold text-emerald-700">LKR {targetBonusAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Holiday Allowance</span>
                <span className="font-mono font-bold">LKR {(parseFloat(holidayAllowance) || 0).toLocaleString()}</span>
              </div>
              
              <div className="pt-4 flex justify-between items-center text-lg font-black text-gray-900 border-t-2 border-gray-900">
                <span>NET PAYABLE AMOUNT</span>
                <span className="font-mono text-xl text-emerald-600">LKR {netPayable.toLocaleString()}</span>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowPayslipModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
