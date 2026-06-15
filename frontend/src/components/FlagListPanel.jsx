import React, { useState, useEffect } from 'react';
import { 
  Flag, 
  Trash2, 
  Plus, 
  Lock, 
  AlertTriangle,
  Info
} from 'lucide-react';
import { getApiUrl } from '../api';

export default function FlagListPanel({ role }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState('');
  const [newLabel, setNewLabel] = useState('Stolen Vehicle');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/flags'));
      const data = await res.json();
      setFlags(data || []);
    } catch (e) {
      console.error('Failed to fetch flags:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleAddFlag = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (role !== 'admin') {
      setSubmitError('Unauthorized: Admin credentials are required to modify the flag list.');
      return;
    }

    if (!newPattern.trim()) {
      setSubmitError('Pattern is required');
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/flags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platePattern: newPattern,
          label: newLabel
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to add flag pattern');
        return;
      }

      setSubmitSuccess('Pattern successfully flagged!');
      setNewPattern('');
      fetchFlags();
    } catch (err) {
      console.error(err);
      setSubmitError('API error occurred');
    }
  };

  const handleDeleteFlag = async (id) => {
    if (role !== 'admin') {
      alert('Unauthorized: Admin credentials required.');
      return;
    }

    if (!confirm('Are you sure you want to remove this watch list pattern?')) {
      return;
    }

    try {
      const res = await fetch(getApiUrl(`/api/flags/${id}`), {
        method: 'DELETE'
      });

      if (res.ok) {
        setFlags(prev => prev.filter(flag => flag.id !== id));
      } else {
        alert('Failed to delete pattern');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Security Flag List</h2>
        <p className="text-gray-400 text-sm">Manage license plate patterns categorized for alert dispatch.</p>
      </div>

      {/* Grid: Form and List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Creation Form (Disabled if Operator) */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md h-fit">
          <div className="flex items-center space-x-2 text-sm text-cyan-400 font-semibold mb-4 border-b border-gray-800 pb-3">
            <Plus className="w-4 h-4" />
            <span>Add Ingestion Rule</span>
          </div>

          {!isAdmin && (
            <div className="mb-5 p-4 rounded-xl bg-amber-950/20 border border-amber-500/25 text-amber-300 text-xs flex items-start">
              <Lock className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Operator Read-Only</span>
                <p className="mt-0.5 text-gray-400">Your role does not have authorization to add or remove security flags. Please sign in as Administrator.</p>
              </div>
            </div>
          )}

          {submitError && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/20 text-red-400 text-xs flex items-start">
              <AlertTriangle className="w-4 h-4 mr-1.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/25 text-emerald-400 text-xs">
              {submitSuccess}
            </div>
          )}

          <form onSubmit={handleAddFlag} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Plate Pattern</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={newPattern}
                onChange={e => setNewPattern(e.target.value)}
                placeholder="e.g. STOLEN-*, LA-88%"
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-40 transition-colors uppercase placeholder:normal-case"
              />
              <span className="text-[10px] text-gray-500 mt-1.5 block leading-normal">
                Supports wildcards: <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">*</code> or <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">%</code> represent any series of characters.
              </span>
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Alert Label</label>
              <select
                disabled={!isAdmin}
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-40 transition-colors"
              >
                <option value="Stolen Vehicle">Stolen Vehicle</option>
                <option value="Suspicious Vehicle">Suspicious Vehicle</option>
                <option value="VIP Clear List">VIP Clear List</option>
                <option value="Staff Vehicle">Staff Vehicle</option>
                <option value="Alert List">General Alert</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!isAdmin}
              className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-45 disabled:hover:bg-cyan-500 active:scale-95 disabled:active:scale-100 text-gray-950 font-semibold py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Register Flag Pattern
            </button>
          </form>
        </div>

        {/* Right Side: Active Rules List */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md lg:col-span-2 flex flex-col">
          <div className="flex items-center space-x-2 text-sm text-cyan-400 font-semibold mb-4 border-b border-gray-800 pb-3">
            <Flag className="w-4 h-4" />
            <span>Active Flagged Patterns ({flags.length})</span>
          </div>

          {loading ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              Loading flags...
            </div>
          ) : flags.length === 0 ? (
            <div className="py-20 text-center text-gray-500 text-sm flex flex-col items-center">
              <Info className="w-8 h-8 text-gray-600 mb-2" />
              <span>No patterns currently flagged for monitoring.</span>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[400px] space-y-3 pr-2">
              {flags.map((flag) => (
                <div 
                  key={flag.id}
                  className="flex items-center justify-between bg-gray-950/20 border border-gray-800/60 p-4 rounded-xl hover:border-gray-700/60 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="euro-plate scale-95 origin-left">
                      <span className="euro-blue-bar">FLAG</span>
                      <span className="license-plate-font font-bold text-gray-900 px-1 text-sm">{flag.platePattern}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Classification</span>
                      <p className="text-sm font-semibold text-white mt-0.5">{flag.label}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] text-gray-500">{new Date(flag.createdAt).toLocaleDateString()}</span>
                    
                    <button
                      onClick={() => handleDeleteFlag(flag.id)}
                      disabled={!isAdmin}
                      className="p-2 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 rounded-lg hover:bg-red-950/20 transition-all cursor-pointer"
                      title={isAdmin ? "Delete pattern" : "Requires Admin privileges"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
