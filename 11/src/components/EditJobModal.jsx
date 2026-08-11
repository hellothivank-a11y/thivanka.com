import React, { useState } from 'react';
import { X, Save, Clock, MapPin, Maximize2, Globe, AlertTriangle, SunMoon, Palette, Building } from 'lucide-react';
import { calculatePricing, MISTAKE_TYPES, MISTAKE_DEDUCTIONS, REGIONS, CLIENT_LIST } from '../lib/pricingEngine';
import { supabase } from '../lib/supabase';

export default function EditJobModal({ job, onClose, onJobUpdated, showToast, totalLifetimeJobs }) {
  if (!job) return null;

  const [formData, setFormData] = useState({
    date: job.date || '',
    job_time: job.job_time || '',
    client_name: job.client_name || CLIENT_LIST[0],
    address_title: job.address_title || '',
    area_sqft: job.area_sqft || '',
    region: job.region || 'Standard',
    mistake_type: job.mistake_type || 'None',
    is_color: Boolean(job.is_color),
    is_night_or_weekend: Boolean(job.is_night_or_weekend)
  });

  const [saving, setSaving] = useState(false);

  const livePricing = calculatePricing(formData, totalLifetimeJobs);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const pricing = calculatePricing(formData, totalLifetimeJobs);
      const updatePayload = {
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

      const { data, error } = await supabase
        .from('jobs')
        .update(updatePayload)
        .eq('id', job.id)
        .select();

      if (error) throw error;

      showToast('Job updated successfully!');
      if (onJobUpdated) onJobUpdated(data?.[0]);
      onClose();
    } catch (err) {
      console.error('Update error:', err);
      showToast(err.message || 'Failed to update job record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Edit Job #{job.id}</h3>
            <p className="text-xs text-gray-400">Update drafting job parameters and pricing</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          
          {/* Row 1: Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">SL Time</label>
              <input
                type="text"
                value={formData.job_time}
                onChange={(e) => setFormData({ ...formData, job_time: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Client & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Client</label>
              <input
                type="text"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Address Title</label>
              <input
                type="text"
                value={formData.address_title}
                onChange={(e) => setFormData({ ...formData, address_title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Area, Region, Mistake */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Area (sqft)</label>
              <input
                type="number"
                value={formData.area_sqft}
                onChange={(e) => setFormData({ ...formData, area_sqft: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Region</label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REGIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase">Mistake</label>
              <select
                value={formData.mistake_type}
                onChange={(e) => setFormData({ ...formData, mistake_type: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MISTAKE_TYPES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6 p-4 rounded-xl bg-[#0d1117] border border-white/10">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_color}
                onChange={(e) => setFormData({ ...formData, is_color: e.target.checked })}
                className="rounded border-gray-600 bg-gray-800 text-blue-600"
              />
              <span>Color Plan</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_night_or_weekend}
                onChange={(e) => setFormData({ ...formData, is_night_or_weekend: e.target.checked })}
                className="rounded border-gray-600 bg-gray-800 text-blue-600"
              />
              <span>Night / Weekend</span>
            </label>
          </div>

          {/* Recalculated Summary */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-xs">
            <span className="text-gray-300">New Recalculated Earnings Total:</span>
            <span className="font-mono font-bold text-emerald-400 text-base">LKR {livePricing.total.toFixed(2)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
