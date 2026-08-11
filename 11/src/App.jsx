import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import HomeTab from './components/HomeTab';
import JobSheetTab from './components/JobSheetTab';
import SalaryTab from './components/SalaryTab';
import Toast from './components/Toast';
import { supabase } from './lib/supabase';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // Fetch all jobs from Supabase with timeout protection
  const fetchJobs = useCallback(async () => {
    // Safety timeout to ensure loading spinner dismisses even on network failure
    const timer = setTimeout(() => {
      if (isMountedRef.current && loading) {
        setLoading(false);
      }
    }, 4000);

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false });

      if (error) throw error;
      if (isMountedRef.current) {
        setJobs(data || []);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      if (isMountedRef.current) {
        showToast(err.message || 'Unable to fetch jobs from database.', 'error');
      }
    } finally {
      clearTimeout(timer);
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [showToast]);

  // Realtime subscription setup
  useEffect(() => {
    fetchJobs();

    let channel;
    try {
      channel = supabase
        .channel('jobs_realtime_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'jobs' },
          (payload) => {
            if (!isMountedRef.current) return;
            if (payload.eventType === 'INSERT') {
              setJobs((prev) => [payload.new, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setJobs((prev) => prev.map((j) => (j.id === payload.new.id ? payload.new : j)));
            } else if (payload.eventType === 'DELETE') {
              setJobs((prev) => prev.filter((j) => j.id === payload.old.id));
            }
          }
        )
        .subscribe((status) => {
          if (!isMountedRef.current) return;
          if (status === 'SUBSCRIBED') {
            setIsRealtimeConnected(true);
          } else {
            setIsRealtimeConnected(false);
          }
        });
    } catch (err) {
      console.warn('Realtime channel subscription error:', err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          // ignore
        }
      }
    };
  }, [fetchJobs]);

  // Derive unique months available in jobs dataset
  const availableMonths = Array.from(
    new Set(
      (jobs || [])
        .map((j) => (j.date ? j.date.substring(0, 7) : null))
        .filter(Boolean)
    )
  ).sort((a, b) => b.localeCompare(a));

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  if (!availableMonths.includes(currentMonthStr)) {
    availableMonths.unshift(currentMonthStr);
  }

  const handleJobAdded = (newJob) => {
    fetchJobs();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col font-sans">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        monthFilter={monthFilter}
        setMonthFilter={setMonthFilter}
        availableMonths={availableMonths}
        totalJobsCount={jobs.length}
        isRealtimeConnected={isRealtimeConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-gray-400">Loading Supabase Floorplan Jobs...</p>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeTab
                jobs={jobs}
                onJobAdded={handleJobAdded}
                showToast={showToast}
                totalLifetimeJobs={jobs.length}
              />
            )}

            {activeTab === 'jobsheet' && (
              <JobSheetTab
                jobs={jobs}
                setJobs={setJobs}
                monthFilter={monthFilter}
                fetchJobs={fetchJobs}
                showToast={showToast}
                totalLifetimeJobs={jobs.length}
              />
            )}

            {activeTab === 'salary' && (
              <SalaryTab
                jobs={jobs}
                availableMonths={availableMonths}
                monthFilter={monthFilter}
                setMonthFilter={setMonthFilter}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 DraftOps Web 3.0 • High-Performance SaaS Engine</p>
          <div className="flex items-center gap-4">
            <span>React (Vite)</span>
            <span>•</span>
            <span>Tailwind CSS</span>
            <span>•</span>
            <span>Supabase Realtime</span>
          </div>
        </div>
      </footer>

      {/* Toast Notifications */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
