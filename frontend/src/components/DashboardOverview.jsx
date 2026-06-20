import React, { useState, useEffect } from 'react';
import { 
  Car, 
  AlertTriangle, 
  CheckCircle, 
  Camera, 
  TrendingUp, 
  Clock, 
  Search,
  Eye,
  Activity,
  Lock,
  Coins,
  Scale,
  Truck,
  FileText
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { getApiUrl } from '../api';

// Register Chart.js modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardOverview({ role, liveEvents, setActiveTab }) {
  const [metrics, setMetrics] = useState({
    totalScanned: 0,
    totalFined: 0,
    totalDisputed: 0,
    totalClamped: 0,
    totalTowed: 0,
    totalImpounded: 0,
    totalBookings: 0,
    totalBookingHours: 0,
    totalRevenue: 0
  });

  const [hourlyTraffic, setHourlyTraffic] = useState([]);
  const [cameraActivity, setCameraActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch(getApiUrl('/api/analytics'));
      const data = await res.json();
      if (data && data.summary) {
        setMetrics(data.summary);
      }
      if (data && data.charts) {
        setHourlyTraffic(data.charts.hourlyTraffic || []);
        setCameraActivity(data.charts.cameraActivity || []);
      }
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Poll analytics every 10s to keep it fresh
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [liveEvents]); // Refetch if new live websocket events arrive

  // Hourly Traffic Chart Config
  const hourlyChartData = {
    labels: hourlyTraffic.map(h => h.label),
    datasets: [
      {
        fill: true,
        label: 'Vehicles Detected',
        data: hourlyTraffic.map(h => h.count),
        borderColor: '#06b6d4', // cyan-500
        backgroundColor: 'rgba(6, 182, 212, 0.08)',
        borderWidth: 2,
        tension: 0.4,
        pointBackgroundColor: '#06b6d4',
        pointRadius: 3,
        pointHoverRadius: 6
      }
    ]
  };

  const hourlyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(6, 182, 212, 0.2)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.05)' },
        ticks: { color: '#64748b', font: { size: 10 }, stepSize: 1 }
      }
    }
  };

  // Camera Activity Chart Config
  const cameraChartData = {
    labels: cameraActivity.map(c => c.cameraId),
    datasets: [
      {
        label: 'Total Captures',
        data: cameraActivity.map(c => c.count),
        backgroundColor: 'rgba(99, 102, 241, 0.65)', // indigo-500
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 6
      }
    ]
  };

  const cameraChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(99, 102, 241, 0.2)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.05)' },
        ticks: { color: '#64748b', font: { size: 10 }, stepSize: 2 }
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Welcome / Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">System Dashboard</h2>
          <p className="text-gray-400 text-sm">Real-time status overview of XCW-MICROCAM-02 nodes.</p>
        </div>
        
        <div className="flex items-center space-x-2 text-xs text-gray-400 bg-gray-900/40 px-3 py-1.5 rounded-lg border border-gray-800">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Bento-grid KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* KPI 1: Total Scanned */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Car className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Scanned Vehicles</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center">
              <Car className="w-4.5 h-4.5 text-cyan-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalScanned ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Total scanned plates count</span>
          </div>
        </div>

        {/* KPI 2: Vehicles Fined */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Vehicles Fined</span>
            <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalFined ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Vehicles flagged with active fines</span>
          </div>
        </div>

        {/* KPI 3: Disputed Fines */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Scale className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Disputed Fines</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-500/20 flex items-center justify-center">
              <Scale className="w-4.5 h-4.5 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalDisputed ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Fines currently under dispute</span>
          </div>
        </div>

        {/* KPI 4: Clamped Vehicles */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Lock className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Clamped Vehicles</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5 text-indigo-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalClamped ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Vehicles clamped for violations</span>
          </div>
        </div>

        {/* KPI 5: Towed Vehicles */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Truck className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Towed Vehicles</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center">
              <Truck className="w-4.5 h-4.5 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalTowed ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Vehicles towed from restriction zones</span>
          </div>
        </div>

        {/* KPI 6: Impounded Vehicles */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <FileText className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Impounded Vehicles</span>
            <div className="w-8 h-8 rounded-lg bg-rose-950/40 border border-rose-500/20 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-rose-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalImpounded ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Vehicles impounded in depots</span>
          </div>
        </div>

        {/* KPI 7: Bookings */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <CheckCircle className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Bookings</span>
            <div className="w-8 h-8 rounded-lg bg-violet-950/40 border border-violet-500/20 flex items-center justify-center">
              <CheckCircle className="w-4.5 h-4.5 text-violet-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : (metrics.totalBookings ?? 0).toLocaleString()}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Approved parking bookings count</span>
          </div>
        </div>

        {/* KPI 8: Booking Hours */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Clock className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Booking Hours</span>
            <div className="w-8 h-8 rounded-lg bg-blue-950/40 border border-blue-500/20 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : `${(metrics.totalBookingHours ?? 0).toLocaleString()} hrs`}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Aggregated parking hours</span>
          </div>
        </div>

        {/* KPI 9: Revenue */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 bottom-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
            <Coins className="w-24 h-24 text-white" />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-500/20 flex items-center justify-center">
              <Coins className="w-4.5 h-4.5 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white tracking-tight">{loading ? '...' : `₦${(metrics.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}</p>
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <span>Fines and bookings collection</span>
          </div>
        </div>

      </div>

      {/* Bento Charts Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart: Traffic Hourly Pattern */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 lg:col-span-2 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-white">Traffic Volume Pattern</h3>
              <p className="text-xs text-gray-400">Hourly aggregation of license plate captures (24-hour cycle).</p>
            </div>
            <Activity className="w-4.5 h-4.5 text-cyan-400" />
          </div>
          <div className="h-64 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading charts...</div>
            ) : hourlyTraffic.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No data recorded. Use Camera Simulator to trigger events.</div>
            ) : (
              <Line data={hourlyChartData} options={hourlyChartOptions} />
            )}
          </div>
        </div>

        {/* Sub-Chart: Camera Activity Breakdown */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-white">Camera Node Capture Rates</h3>
              <p className="text-xs text-gray-400">Relative traffic volume distribution by sensor.</p>
            </div>
            <Camera className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div className="h-64 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">Loading charts...</div>
            ) : cameraActivity.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No captures registered.</div>
            ) : (
              <Bar data={cameraChartData} options={cameraChartOptions} />
            )}
          </div>
        </div>

      </div>

      {/* Recent Activity Table Shortcut */}
      <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base text-white">Latest Live Captures</h3>
            <p className="text-xs text-gray-400">Real-time incoming vehicle captures. Click "Live Monitor Feed" for complete feed.</p>
          </div>
          <button 
            onClick={() => setActiveTab('live')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center"
          >
            <Eye className="w-3.5 h-3.5 mr-1" /> View Full Monitor
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs font-semibold uppercase">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Camera ID</th>
                <th className="py-3 px-4">Plate Number</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {liveEvents.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-gray-500 text-sm">
                    No active WebSocket events received in this session. Trigger one in the Camera Simulator!
                  </td>
                </tr>
              ) : (
                liveEvents.slice(0, 5).map((event) => (
                  <tr key={event.id} className="border-b border-gray-800/60 hover:bg-gray-900/30 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-xs text-gray-400">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">{event.cameraId}</td>
                    <td className="py-3.5 px-4">
                      <div className="euro-plate">
                        <span className="euro-blue-bar">NGR</span>
                        <span className="license-plate-font font-bold text-gray-900 px-1 text-sm">{event.plateNumber}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${
                        event.confidence >= 90 ? 'text-emerald-400' : event.confidence >= 75 ? 'text-amber-400' : 'text-red-400'
                      }`}>{event.confidence}%</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {event.isBooked && (
                          <span className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-500/20 text-blue-400 font-semibold text-[10px] uppercase">
                            Booked ({event.bookingHours}h)
                          </span>
                        )}
                        {event.isFined && (
                          <span className="px-2 py-0.5 rounded bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-[10px] uppercase">
                            Fined
                          </span>
                        )}
                        {event.isClamped && (
                          <span className="px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 font-semibold text-[10px] uppercase">
                            Clamped
                          </span>
                        )}
                        {event.isTowed && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 font-semibold text-[10px] uppercase">
                            Towed
                          </span>
                        )}
                        {event.isFlagged && (
                          <span className="px-2 py-0.5 rounded bg-red-900/50 border border-red-500/30 text-red-300 font-bold text-[10px] uppercase tracking-wider">
                            Watchlist
                          </span>
                        )}
                        {!event.isBooked && !event.isFined && !event.isClamped && !event.isTowed && !event.isFlagged && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 font-medium text-[10px] uppercase">
                            Cleared
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
