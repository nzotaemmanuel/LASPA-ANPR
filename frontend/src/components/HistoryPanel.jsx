import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Calendar, 
  Camera, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import { getApiUrl } from '../api';

export default function HistoryPanel({ role }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [plateQuery, setPlateQuery] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFlagged, setIsFlagged] = useState('');

  // Dropdown options
  const [cameraOptions, setCameraOptions] = useState([]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Build query string
      const params = new URLSearchParams({
        page,
        limit,
        plateQuery,
        cameraId,
        startDate,
        endDate,
        ...(isFlagged !== '' && { isFlagged })
      });

      const res = await fetch(getApiUrl(`/api/events?${params.toString()}`));
      const data = await res.json();
      
      setEvents(data.events || []);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (e) {
      console.error('Failed to fetch historical events:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch unique camera list on mount to populate filter select
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await fetch(getApiUrl('/api/analytics'));
        const data = await res.json();
        if (data.charts && data.charts.cameraActivity) {
          setCameraOptions(data.charts.cameraActivity.map(c => c.cameraId));
        }
      } catch (e) {
        console.error('Failed to fetch camera list:', e);
      }
    };
    fetchCameras();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchEvents();
  };

  const handleReset = () => {
    setPlateQuery('');
    setCameraId('');
    setStartDate('');
    setEndDate('');
    setIsFlagged('');
    setPage(1);
    // Directly fetch using default state parameters
    setTimeout(fetchEvents, 0);
  };

  // CSV Exporter
  const handleExportCSV = () => {
    if (events.length === 0) return;
    
    const headers = [
      'ID', 'Timestamp', 'Camera ID', 'Plate Number', 'Confidence',
      'Make', 'Model', 'Color', 'Category',
      'Speed (km/h)', 'Speed Limit (km/h)', 'Direction',
      'Country', 'State', 'Location',
      'Flagged', 'Alert Reason'
    ];
    const rows = events.map(event => [
      event.id,
      new Date(event.timestamp).toISOString(),
      event.cameraId,
      event.plateNumber,
      `${event.confidence}%`,
      event.mmrMake || '',
      event.mmrModel || '',
      event.mmrColor || '',
      event.mmrCategory || '',
      event.triggerSpeed != null ? event.triggerSpeed.toFixed(1) : '',
      event.triggerSpeedLimit != null ? event.triggerSpeedLimit.toFixed(1) : '',
      event.triggerDirection || '',
      event.countryLong || event.countryShort || '',
      event.stateLong || event.stateShort || '',
      event.location || '',
      event.isFlagged ? 'TRUE' : 'FALSE',
      event.flagReason || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ANPR_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Historical Logs</h2>
          <p className="text-gray-400 text-sm">Query and audit vehicle ingestion database records.</p>
        </div>
        
        <button
          onClick={handleExportCSV}
          disabled={events.length === 0}
          className="bg-cyan-500 hover:bg-cyan-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100 text-gray-950 font-semibold py-2.5 px-4 rounded-xl shadow-md cursor-pointer transition-all flex items-center text-sm"
        >
          <Download className="w-4 h-4 mr-2" /> Export to CSV
        </button>
      </div>

      {/* Filter panel */}
      <form onSubmit={handleSearch} className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md">
        <div className="flex items-center space-x-2 text-sm text-cyan-400 font-semibold mb-4 border-b border-gray-800 pb-3">
          <SlidersHorizontal className="w-4 h-4" />
          <span>Search Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Plate Number search */}
          <div>
            <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Plate Number</label>
            <div className="relative">
              <input
                type="text"
                value={plateQuery}
                onChange={e => setPlateQuery(e.target.value)}
                placeholder="e.g. LA-*, *123"
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-gray-600"
              />
              <Search className="w-3.5 h-3.5 text-gray-600 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Camera ID Dropdown */}
          <div>
            <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Sensor Node</label>
            <div className="relative">
              <select
                value={cameraId}
                onChange={e => setCameraId(e.target.value)}
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="">All Sensors</option>
                {cameraOptions.map(cam => (
                  <option key={cam} value={cam}>{cam}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Start Date</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors text-gray-400"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">End Date</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors text-gray-400"
              />
            </div>
          </div>

          {/* Flagged Status */}
          <div>
            <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Security Status</label>
            <select
              value={isFlagged}
              onChange={e => setIsFlagged(e.target.value)}
              className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="">All Records</option>
              <option value="false">Cleared Only</option>
              <option value="true">Watchlist Flagged</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-5 pt-4 border-t border-gray-800/60">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 border border-gray-800 hover:bg-gray-800/40 text-gray-300 rounded-xl text-xs transition-colors flex items-center cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear Filters
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-cyan-950 text-cyan-400 hover:bg-cyan-900 border border-cyan-500/20 rounded-xl text-xs transition-colors font-bold flex items-center cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 mr-1.5" /> Apply Filter Search
          </button>
        </div>
      </form>

      {/* Results logs table */}
      <div className="glass-panel rounded-2xl border border-gray-800/80 overflow-hidden shadow-md">
        {loading ? (
          <div className="p-20 text-center text-gray-400 text-sm flex flex-col items-center">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mb-3"></div>
            <span>Fetching query results...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="p-20 text-center text-gray-500 text-sm">
            No database records found matching the filter search.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/15 text-gray-400 text-xs font-semibold uppercase">
                    <th className="py-3 px-4">Image</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Sensor Node</th>
                    <th className="py-3 px-4">Plate Number</th>
                    <th className="py-3 px-4">Vehicle</th>
                    <th className="py-3 px-4">Speed</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr 
                      key={event.id} 
                      className={`border-b border-gray-800/50 hover:bg-gray-900/20 transition-colors ${
                        event.isFlagged ? 'bg-red-950/5' : ''
                      }`}
                    >
                      {/* Thumbnail */}
                      <td className="py-3 px-4">
                        <div className="w-16 h-10 rounded-lg overflow-hidden border border-gray-800 bg-black/40 flex justify-center items-center">
                          <img 
                            src={event.imageUrl} 
                            alt="Plate crop" 
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=200'; }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 font-medium text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>

                      {/* Camera ID */}
                      <td className="py-3 px-4 font-semibold text-white text-xs">{event.cameraId}</td>

                      {/* Plate number with dynamic country code */}
                      <td className="py-3 px-4">
                        <div className="euro-plate">
                          <span className="euro-blue-bar">
                            {event.anprCountry || event.countryShort || 'NGR'}
                          </span>
                          <span className="license-plate-font font-bold text-gray-900 px-1 text-sm">{event.plateNumber}</span>
                        </div>
                      </td>

                      {/* MMR — Make / Model / Color */}
                      <td className="py-3 px-4">
                        {event.mmrMake ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-indigo-300">{event.mmrMake} {event.mmrModel}</p>
                            <p className="text-[10px] text-gray-500">{[event.mmrColor, event.mmrCategory].filter(Boolean).join(' · ')}</p>
                          </div>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Trigger speed */}
                      <td className="py-3 px-4">
                        {event.triggerSpeed != null ? (
                          <div className="space-y-0.5">
                            <p className={`text-xs font-bold ${
                              event.triggerSpeedLimit && event.triggerSpeed > event.triggerSpeedLimit
                                ? 'text-red-400' : 'text-emerald-400'
                            }`}>{event.triggerSpeed.toFixed(1)} km/h</p>
                            {event.triggerDirection && (
                              <p className="text-[10px] text-gray-500 capitalize">{event.triggerDirection}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Confidence */}
                      <td className="py-3 px-4">
                        <span className={`font-semibold text-xs ${
                          event.confidence >= 90 ? 'text-emerald-400' : event.confidence >= 75 ? 'text-amber-400' : 'text-red-400'
                        }`}>{event.confidence}%</span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-right">
                        {event.isFlagged ? (
                          <span className="px-2 py-1 rounded bg-red-950/50 border border-red-500/20 text-red-400 font-semibold text-[10px] uppercase tracking-wider flex items-center justify-end w-fit ml-auto">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {event.flagReason}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 font-medium text-[10px] uppercase">
                            Cleared
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination panel */}
            <div className="px-5 py-4 border-t border-gray-800 bg-gray-900/10 flex items-center justify-between text-xs text-gray-400">
              <div>
                Showing <span className="font-semibold text-white">{events.length}</span> of <span className="font-semibold text-white">{total}</span> records
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page <span className="font-semibold text-white">{page}</span> of {totalPages}</span>
                <button
                  onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
