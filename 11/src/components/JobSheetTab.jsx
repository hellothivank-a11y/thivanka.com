import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  SunMoon, 
  Palette, 
  Globe, 
  Layers,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import EditJobModal from './EditJobModal';

export default function JobSheetTab({ jobs, setJobs, monthFilter, fetchJobs, showToast, totalLifetimeJobs }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedMistake, setSelectedMistake] = useState('all');
  const [editingJob, setEditingJob] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filter jobs based on global monthFilter, search query, region, mistake
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // 1. Global Month Filter
      if (monthFilter !== 'all' && job.date && !job.date.startsWith(monthFilter)) {
        return false;
      }

      // 2. Region Filter
      if (selectedRegion !== 'all' && job.region !== selectedRegion) {
        return false;
      }

      // 3. Mistake Filter
      if (selectedMistake !== 'all') {
        if (selectedMistake === 'Clean' && job.mistake_type !== 'None') return false;
        if (selectedMistake === 'Mistakes' && job.mistake_type === 'None') return false;
        if (selectedMistake !== 'Clean' && selectedMistake !== 'Mistakes' && job.mistake_type !== selectedMistake) return false;
      }

      // 4. Fuzzy Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const address = (job.address_title || '').toLowerCase();
        const client = (job.client_name || '').toLowerCase();
        const region = (job.region || '').toLowerCase();
        const mistake = (job.mistake_type || '').toLowerCase();
        const date = (job.date || '').toLowerCase();
        const idStr = String(job.id || '');

        return address.includes(q) || client.includes(q) || region.includes(q) || mistake.includes(q) || date.includes(q) || idStr.includes(q);
      }

      return true;
    });
  }, [jobs, monthFilter, selectedRegion, selectedMistake, searchQuery]);

  // Aggregate Metrics for filtered view
  const aggregateMetrics = useMemo(() => {
    const totalCount = filteredJobs.length;
    const totalEarnings = filteredJobs.reduce((acc, j) => acc + (parseFloat(j.total) || 0), 0);
    const totalArea = filteredJobs.reduce((acc, j) => acc + (parseFloat(j.area_sqft) || 0), 0);
    const avgArea = totalCount > 0 ? Math.round(totalArea / totalCount) : 0;
    const cleanJobsCount = filteredJobs.filter(j => j.mistake_type === 'None').length;
    const cleanPercentage = totalCount > 0 ? Math.round((cleanJobsCount / totalCount) * 100) : 100;

    return {
      totalCount,
      totalEarnings,
      totalArea,
      avgArea,
      cleanJobsCount,
      cleanPercentage
    };
  }, [filteredJobs]);

  // Delete Job Handler
  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure you want to delete Job #${id}?`)) return;

    setDeletingId(id);
    try {
      const { error } = await supabase.from('jobs').delete().eq('id', id);
      if (error) throw error;

      showToast(`Job #${id} deleted successfully.`);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      showToast(err.message || 'Failed to delete job.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // CSV Export Handler
  const exportCSV = () => {
    if (filteredJobs.length === 0) {
      showToast('No jobs available to export.', 'error');
      return;
    }

    const headers = ['ID', 'Date', 'Time', 'Client', 'Address', 'Area SqFt', 'Region', 'Mistake Type', 'Is Color', 'Night/Weekend', 'Base Price', 'No Mistake Bonus', 'Deduction', 'Total LKR'];
    const rows = filteredJobs.map(j => [
      j.id,
      j.date,
      j.job_time,
      `"${j.client_name}"`,
      `"${j.address_title}"`,
      j.area_sqft,
      j.region,
      `"${j.mistake_type}"`,
      j.is_color ? 'Yes' : 'No',
      j.is_night_or_weekend ? 'Yes' : 'No',
      j.price,
      j.no_mistake_amount,
      j.ddt_amount,
      j.total
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Floorplan_Jobs_${monthFilter === 'all' ? 'All' : monthFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV export downloaded!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-white/10">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Filtered Jobs</p>
          <p className="text-xl font-bold text-white mt-0.5">{aggregateMetrics.totalCount}</p>
        </div>
        
        <div className="glass-panel p-4 rounded-2xl border border-white/10">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Filtered Revenue</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5 font-mono">LKR {aggregateMetrics.totalEarnings.toLocaleString()}</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avg Job SqFt</p>
          <p className="text-xl font-bold text-blue-400 mt-0.5 font-mono">{aggregateMetrics.avgArea.toLocaleString()} sqft</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-white/10">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Clean Job Rate</p>
          <p className="text-xl font-bold text-indigo-400 mt-0.5">{aggregateMetrics.cleanPercentage}%</p>
        </div>
      </div>

      {/* Control Bar: Fuzzy Search + Filters + Refresh + Export */}
      <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search address, client, region, mistake..."
            className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl bg-[#0d1117] border border-white/10 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-gray-500 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Region Filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl bg-[#0d1117] border border-white/10 text-gray-300 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">All Regions</option>
            <option value="Standard">Standard Tier</option>
            <option value="UK">UK Tier</option>
            <option value="AUS">AUS Tier</option>
          </select>

          {/* Mistake Filter */}
          <select
            value={selectedMistake}
            onChange={(e) => setSelectedMistake(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-xl bg-[#0d1117] border border-white/10 text-gray-300 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">All Quality States</option>
            <option value="Clean">No Mistakes (+LKR 25)</option>
            <option value="Mistakes">With Mistakes</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={fetchJobs}
            title="Refresh jobs table"
            className="p-2 rounded-xl bg-[#0d1117] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Export CSV */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 text-xs font-semibold transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

        </div>

      </div>

      {/* Realtime Jobs Table */}
      <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0d1117]/80 text-gray-400 text-[11px] font-semibold uppercase tracking-wider border-b border-white/10">
                <th className="py-3.5 px-4">Job Info</th>
                <th className="py-3.5 px-4">Client & Address</th>
                <th className="py-3.5 px-4">Area & Region</th>
                <th className="py-3.5 px-4">Attributes</th>
                <th className="py-3.5 px-4">Mistake / Deductions</th>
                <th className="py-3.5 px-4 text-right">Net Payout</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-gray-300">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-500">
                    <p className="text-sm font-medium">No floorplan jobs match your search filters.</p>
                    <p className="text-xs text-gray-600 mt-1">Try resetting the search query or month filter.</p>
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const isClean = job.mistake_type === 'None';
                  return (
                    <tr key={job.id} className="hover:bg-white/[0.02] transition-colors group">
                      
                      {/* Job Info (ID, Date, Time) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gray-400">#{job.id}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-medium mt-0.5">
                          {job.date} • {job.job_time || 'N/A'}
                        </div>
                      </td>

                      {/* Client & Address */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-white truncate">{job.address_title}</div>
                        <div className="text-[11px] text-blue-400 font-medium mt-0.5">{job.client_name}</div>
                      </td>

                      {/* Area & Region */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-medium text-gray-200">{Number(job.area_sqft).toLocaleString()} sqft</div>
                        <div className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-semibold rounded bg-white/5 text-gray-400 border border-white/10">
                          {job.region} Tier
                        </div>
                      </td>

                      {/* Attributes (Color, Shift) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {job.is_color && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center gap-1">
                              <Palette className="w-3 h-3" /> Color
                            </span>
                          )}
                          {job.is_night_or_weekend && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <SunMoon className="w-3 h-3" /> N/W
                            </span>
                          )}
                          {!job.is_color && !job.is_night_or_weekend && (
                            <span className="text-[11px] text-gray-500">Standard</span>
                          )}
                        </div>
                      </td>

                      {/* Mistake & Deductions */}
                      <td className="py-3.5 px-4">
                        {isClean ? (
                          <span className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> No Mistake (+LKR 25)
                          </span>
                        ) : (
                          <div>
                            <span className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 inline-flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {job.mistake_type} (-LKR {job.ddt_amount})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Net Payout Total */}
                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-mono font-bold text-sm ${Number(job.total) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          LKR {Number(job.total).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          Base: {Number(job.price).toFixed(0)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditingJob(job)}
                            title="Edit Job"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(job.id)}
                            disabled={deletingId === job.id}
                            title="Delete Job"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Job Modal */}
      {editingJob && (
        <EditJobModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onJobUpdated={(updated) => {
            setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
          }}
          showToast={showToast}
          totalLifetimeJobs={totalLifetimeJobs}
        />
      )}

    </div>
  );
}
