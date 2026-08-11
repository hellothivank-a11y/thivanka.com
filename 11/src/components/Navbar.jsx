import React from 'react';
import { LayoutDashboard, Table, DollarSign, Activity, Calendar, Layers } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, monthFilter, setMonthFilter, availableMonths, totalJobsCount, isRealtimeConnected }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">DraftOps</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  v3.0 Web3
                </span>
              </div>
              <p className="text-xs text-gray-400 font-medium">Floorplan Drafting Tracker</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-[#161b22]/70 p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'home'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview & Form</span>
            </button>

            <button
              onClick={() => setActiveTab('jobsheet')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'jobsheet'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Live Job Sheet</span>
              <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-white/20 text-white rounded-full">
                {totalJobsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('salary')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'salary'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Salary & Payroll</span>
            </button>
          </nav>

          {/* Right controls: Global Month Filter & Realtime Badge */}
          <div className="flex items-center gap-3">
            {/* Realtime Status Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <span className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`}></span>
              <span>{isRealtimeConnected ? 'Supabase Live' : 'Connecting...'}</span>
            </div>

            {/* Global Month Filter */}
            <div className="relative flex items-center">
              <Calendar className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl bg-[#161b22] border border-white/10 text-gray-200 hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                <option value="all">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
