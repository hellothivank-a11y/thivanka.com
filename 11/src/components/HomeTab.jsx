import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Clock, 
  MapPin, 
  Maximize2, 
  Globe, 
  AlertTriangle, 
  SunMoon, 
  Palette, 
  Sparkles, 
  TrendingUp, 
  CheckCircle, 
  DollarSign, 
  Award,
  Zap,
  Building
} from 'lucide-react';
import { calculatePricing, MISTAKE_TYPES, MISTAKE_DEDUCTIONS, REGIONS, CLIENT_LIST } from '../lib/pricingEngine';
import { supabase } from '../lib/supabase';

export default function HomeTab({ jobs, onJobAdded, showToast, totalLifetimeJobs }) {
  // Helper to format current SL Time (HH:mm)
  const getSLTime = () => {
    try {
      const now = new Date();
      return now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    date: todayStr,
    job_time: getSLTime(),
    client_name: CLIENT_LIST[0],
    address_title: '',
    area_sqft: '',
    region: 'Standard',
    mistake_type: 'None',
    is_color: false,
    is_night_or_weekend: false
  });

  const [submitting, setSubmitting] = useState(false);

  // Live pricing calculation preview
  const livePricing = calculatePricing(formData, totalLifetimeJobs);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.address_title.trim()) {
      showToast('Please enter an address or title for the floorplan.', 'error');
      return;
    }

    if (!formData.area_sqft || parseFloat(formData.area_sqft) <= 0) {
      showToast('Please enter a valid area in sqft.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const pricing = calculatePricing(formData, totalLifetimeJobs);
      const payload = {
        date: formData.date,
        job_time: formData.job_time,
        client_name: formData.client_name,
        address_title: formData.address_title.trim(),
        area_sqft: parseFloat(formData.area_sqft),
        region: formData.region,
        mistake_type: formData.mistake_type,
        is_color: formData.is_color,
        is_night_or_weekend: formData.is_night_or_weekend,
        price: pricing.price,
        no_mistake_amount: pricing.no_mistake_amount,
        ddt_amount: pricing.ddt_amount,
        total: pricing.total
      };

      const { data, error } = await supabase.from('jobs').insert([payload]).select();

      if (error) throw error;

      showToast('Drafting job recorded successfully!');
      
      // Reset form title and area
      setFormData(prev => ({
        ...prev,
        address_title: '',
        area_sqft: '',
        mistake_type: 'None',
        is_color: false,
        job_time: getSLTime()
      }));

      if (onJobAdded) onJobAdded(data?.[0]);
    } catch (err) {
      console.error('Insert error:', err);
      showToast(err.message || 'Failed to insert job into database.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Compute stat metrics
  const todayJobs = jobs.filter(j => j.date === todayStr);
  const todayCount = todayJobs.length;
  const todayEarnings = todayJobs.reduce((acc, j) => acc + (parseFloat(j.total) || 0), 0);

  const currentMonthPrefix = todayStr.substring(0, 7); // e.g. "2026-08"
  const monthJobs = jobs.filter(j => j.date && j.date.startsWith(currentMonthPrefix));
  const monthCount = monthJobs.length;
  const monthEarnings = monthJobs.reduce((acc, j) => acc + (parseFloat(j.total) || 0), 0);

  const zeroMistakeCount = jobs.filter(j => j.mistake_type === 'None').length;
  const accuracyRate = jobs.length > 0 ? Math.round((zeroMistakeCount / jobs.length) * 100) : 100;

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Metric Stat Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Today's Jobs */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 glass-panel-hover flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Today's Jobs</p>
            <h3 className="text-2xl font-bold text-white mt-1">{todayCount}</h3>
            <p className="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> LKR {todayEarnings.toLocaleString()} earned
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Monthly Jobs */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 glass-panel-hover flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">This Month Jobs</p>
            <h3 className="text-2xl font-bold text-white mt-1">{monthCount}</h3>
            <p className="text-xs text-blue-400 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> LKR {monthEarnings.toLocaleString()} total
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Lifetime Jobs */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 glass-panel-hover flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Lifetime Jobs</p>
            <h3 className="text-2xl font-bold text-white mt-1">{totalLifetimeJobs}</h3>
            <p className="text-xs text-indigo-400 mt-1 font-medium">
              {totalLifetimeJobs < 100 ? `${100 - totalLifetimeJobs} left in starter tier` : 'Standard/UK/AUS Tiers Active'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Quality / Accuracy */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 glass-panel-hover flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Accuracy Rate</p>
            <h3 className="text-2xl font-bold text-white mt-1">{accuracyRate}%</h3>
            <p className="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> {zeroMistakeCount} mistake-free jobs
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Main Grid: Form + Live Pricing Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Quick Job Entry Form (8 cols) */}
        <div className="lg:col-span-8 glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Quick Job Entry</h2>
              <p className="text-xs text-gray-400">Record a new completed drafting floorplan</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Row 1: Date & SL Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  SL Time (24h)
                </label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={formData.job_time}
                    onChange={(e) => setFormData({ ...formData, job_time: e.target.value })}
                    placeholder="e.g. 14:30"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Client Quick Picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wider flex items-center justify-between">
                <span>Client Name</span>
                <span className="text-[10px] text-gray-500">Select or type custom</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {CLIENT_LIST.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData({ ...formData, client_name: c })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      formData.client_name === c
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-400'
                        : 'bg-[#0d1117] text-gray-400 hover:text-white border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Building className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="Enter client name..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Row 3: Address & Area */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Address / Title
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={formData.address_title}
                    onChange={(e) => setFormData({ ...formData, address_title: e.target.value })}
                    placeholder="e.g. 42 Wallaby Way, Sydney"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Area (sqft)
                </label>
                <div className="relative">
                  <Maximize2 className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="number"
                    value={formData.area_sqft}
                    onChange={(e) => setFormData({ ...formData, area_sqft: e.target.value })}
                    placeholder="e.g. 1500"
                    step="1"
                    min="0"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Region & Mistake Dropdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Region Tier
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r} Tier {r === 'Standard' ? '(Standard Base)' : '(UK/AUS Premium Base)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
                  Mistake Deduction
                </label>
                <div className="relative">
                  <AlertTriangle className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <select
                    value={formData.mistake_type}
                    onChange={(e) => setFormData({ ...formData, mistake_type: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    {MISTAKE_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {m} {m === 'None' ? '(+LKR 25 Bonus)' : `(-LKR ${MISTAKE_DEDUCTIONS[m]})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Row 5: Switches for Night/Weekend & Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0d1117] border border-white/10">
              
              {/* Night/Weekend Toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-all ${formData.is_night_or_weekend ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400'}`}>
                    <SunMoon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-200">Night / Weekend</span>
                    <p className="text-[11px] text-gray-400">Regular tier pricing applies</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_night_or_weekend}
                  onChange={(e) => setFormData({ ...formData, is_night_or_weekend: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900 cursor-pointer"
                />
              </label>

              {/* Color Plan Toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-all ${formData.is_color ? 'bg-pink-500/20 text-pink-400' : 'bg-white/5 text-gray-400'}`}>
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-200">Color Plan Extra</span>
                    <p className="text-[11px] text-gray-400">+LKR 25 per 1000 sqft</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_color}
                  onChange={(e) => setFormData({ ...formData, is_color: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900 cursor-pointer"
                />
              </label>

            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Saving Job to Supabase...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-5 h-5" />
                  <span>Submit Drafting Job</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* Live Calculation Preview Card (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Payout Calculator</h3>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Calculation
              </span>
            </div>

            <div className="space-y-4 text-sm">
              
              {/* Base Price */}
              <div className="flex items-center justify-between text-gray-300">
                <span className="text-xs">Base Price</span>
                <span className="font-mono font-semibold text-white">LKR {livePricing.price.toFixed(2)}</span>
              </div>

              {/* Color Extra details if checked */}
              {formData.is_color && (
                <div className="flex items-center justify-between text-pink-400 text-xs">
                  <span>Color Plan Extra</span>
                  <span className="font-mono font-medium">+ LKR {(livePricing.price > 0 ? (formData.area_sqft <= 1000 ? 25 : 25 + Math.ceil((formData.area_sqft - 1000) / 1000) * 25) : 0)}</span>
                </div>
              )}

              {/* No Mistake Bonus */}
              <div className="flex items-center justify-between text-emerald-400 text-xs">
                <span>No Mistake Bonus</span>
                <span className="font-mono font-medium">+ LKR {livePricing.no_mistake_amount.toFixed(2)}</span>
              </div>

              {/* Mistake Deduction */}
              <div className="flex items-center justify-between text-red-400 text-xs">
                <span>Mistake Deduction ({formData.mistake_type})</span>
                <span className="font-mono font-medium">- LKR {livePricing.ddt_amount.toFixed(2)}</span>
              </div>

              {/* Divider */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Estimated Total</span>
                  <span className={`text-2xl font-black font-mono ${livePricing.total < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    LKR {livePricing.total.toFixed(2)}
                  </span>
                </div>
              </div>

            </div>

            {/* Pricing Logic Info Badge */}
            <div className="mt-6 p-4 rounded-xl bg-[#0d1117] border border-white/10 space-y-2">
              <p className="text-[11px] font-semibold text-gray-300 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-blue-400" /> Active Tier Rules
              </p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {totalLifetimeJobs < 100 && !formData.is_night_or_weekend
                  ? `First 100 Lifetime Jobs rule active (${totalLifetimeJobs}/100 done). Base = 0 + Color extra.`
                  : `Regular Tiers active for ${formData.region} Region (${formData.area_sqft || 0} sqft).`}
              </p>
            </div>

          </div>

          {/* Quick Help Card */}
          <div className="glass-panel p-5 rounded-2xl border border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">Mistake Penalty Reference</h4>
            <div className="text-[11px] text-gray-400 space-y-1.5">
              <div className="flex justify-between"><span>Address, North Point, Floor Label, Measurements</span><span className="text-red-400 font-mono">-300</span></div>
              <div className="flex justify-between"><span>Area</span><span className="text-red-400 font-mono">-200</span></div>
              <div className="flex justify-between"><span>Label</span><span className="text-red-400 font-mono">-100</span></div>
              <div className="flex justify-between"><span>Minor (Stair, Arrow, Door, etc.)</span><span className="text-red-400 font-mono">-25</span></div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
