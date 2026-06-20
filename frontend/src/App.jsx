import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  History, 
  Flag, 
  Cpu, 
  Shield, 
  User as UserIcon, 
  LogOut, 
  Wifi, 
  WifiOff, 
  Lock,
  Volume2,
  VolumeX,
  AlertOctagon,
  X,
  Webhook
} from 'lucide-react';

// Panels
import DashboardOverview from './components/DashboardOverview';
import LiveFeed from './components/LiveFeed';
import HistoryPanel from './components/HistoryPanel';
import FlagListPanel from './components/FlagListPanel';
import SimulatorPanel from './components/SimulatorPanel';
import WebhookPanel from './components/WebhookPanel';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('laspa_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [liveEvents, setLiveEvents] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeAlert, setActiveAlert] = useState(null);
  
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Sound effects helper
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Play a synthetic alarm sound using oscillators
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc1.start();
      osc2.start();
      
      osc1.stop(audioCtx.currentTime + 0.8);
      osc2.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.warn('AudioContext failed to play sound:', e);
    }
  };

  // Connect WebSocket with auto-reconnection
  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setWsStatus('connecting');
    
    const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackUrl = import.meta.env.DEV 
      ? `${defaultWsProtocol}//${window.location.hostname}:5000` 
      : `${defaultWsProtocol}//${window.location.host}/ws`;
      
    const socketUrl = import.meta.env.VITE_WS_BASE_URL || fallbackUrl;

    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('[WS] Connected to backend websocket');
      setWsStatus('connected');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'EVENT') {
          const newEvent = payload.data;
          
          // Prepend to liveEvents
          setLiveEvents(prev => [newEvent, ...prev].slice(0, 100)); // Limit to 100 in memory
          
          // Handle flagged alerts
          if (newEvent.isFlagged) {
            setActiveAlert(newEvent);
            playAlertSound();
          }
        }
      } catch (err) {
        console.error('[WS] Error parsing message:', err);
      }
    };

    socket.onclose = () => {
      console.log('[WS] Disconnected, attempting reconnect in 3s...');
      setWsStatus('disconnected');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
      console.error('[WS] Socket error:', err);
      socket.close();
    };
  };

  useEffect(() => {
    if (user) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [user]);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    const u = usernameInput.trim().toLowerCase();
    const p = passwordInput.trim();

    if (u === 'admin' && p === 'admin123') {
      const adminUser = { username: 'Admin User', role: 'admin' };
      setUser(adminUser);
      localStorage.setItem('laspa_user', JSON.stringify(adminUser));
    } else if (u === 'operator' && p === 'operator123') {
      const opUser = { username: 'Operator Duty', role: 'operator' };
      setUser(opUser);
      localStorage.setItem('laspa_user', JSON.stringify(opUser));
    } else {
      setLoginError('Invalid username or password. (Use admin/admin123 or operator/operator123)');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('laspa_user');
    if (wsRef.current) wsRef.current.close();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070b13] px-4 relative overflow-hidden">
        {/* Decorative lighting background circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-900/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-900/10 rounded-full blur-3xl"></div>

        <form onSubmit={handleLogin} className="w-full max-w-md glass-panel p-8 rounded-2xl glow-cyan relative z-10 transition-all duration-300">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/50 flex items-center justify-center border border-cyan-500/30 mb-4 shadow-inner">
              <Shield className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">LASPA Ingestion Portal</h2>
            <p className="text-gray-400 text-sm mt-1">ANPR Traffic Management System</p>
          </div>

          {loginError && (
            <div className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-500/30 text-red-200 text-xs flex items-start">
              <AlertOctagon className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder="e.g. admin or operator"
                required
                className="w-full bg-gray-900/70 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-gray-900/70 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-cyan-500 hover:bg-cyan-600 active:scale-95 text-gray-950 font-semibold py-3 rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center justify-center text-sm"
            >
              <Lock className="w-4 h-4 mr-2" /> Sign In Securely
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500">Demo Credentials:</p>
            <div className="flex justify-center space-x-6 mt-2 text-xs text-gray-400">
              <div>Admin: <code className="bg-gray-900 px-1 py-0.5 rounded text-cyan-400">admin / admin123</code></div>
              <div>Operator: <code className="bg-gray-900 px-1 py-0.5 rounded text-cyan-400">operator / operator123</code></div>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#070b13] text-gray-100">
      
      {/* Top Banner Alert Modal */}
      {activeAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg glass-panel rounded-2xl overflow-hidden glow-red p-6 border-red-500 relative">
            <button 
              onClick={() => setActiveAlert(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 text-red-500 mb-4">
              <AlertOctagon className="w-8 h-8 animate-bounce" />
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white">HIGH PRIORITY VEHICLE DETECTED</h3>
                <p className="text-red-400 text-xs">Flagged in security watch list</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-red-950/30 p-4 rounded-xl border border-red-500/20">
                <div>
                  <p className="text-xs text-red-400 font-medium uppercase tracking-wider">Plate Number</p>
                  <div className="euro-plate mt-1.5 scale-105 origin-left">
                    <span className="euro-blue-bar">NGR</span>
                    <span className="license-plate-font font-bold text-gray-900 px-1">{activeAlert.plateNumber}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Alert Classification</p>
                  <p className="text-lg font-bold text-red-500 mt-1">{activeAlert.flagReason}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-gray-900/50 p-4 rounded-xl">
                <div>
                  <span className="text-gray-400 text-xs">Camera Station</span>
                  <p className="font-semibold text-white mt-0.5">{activeAlert.cameraId}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Ocr Accuracy</span>
                  <p className="font-semibold text-cyan-400 mt-0.5">{activeAlert.confidence}%</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400 text-xs">Detection Timestamp</span>
                  <p className="font-medium text-white mt-0.5">
                    {new Date(activeAlert.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveAlert(null)}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-medium py-3 rounded-xl shadow-lg transition-colors cursor-pointer"
              >
                Acknowledge Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-[#070b13]/80 backdrop-blur-md border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none text-white">LASPA</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">MicroCam Portal</p>
          </div>
        </div>

        {/* System metrics & Controls */}
        <div className="flex items-center space-x-4">
          {/* WebSocket Status Indicator */}
          <div className={`flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            wsStatus === 'connected' 
              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' 
              : wsStatus === 'connecting'
              ? 'bg-amber-950/30 text-amber-400 border-amber-500/20 animate-pulse'
              : 'bg-red-950/30 text-red-400 border-red-500/20'
          }`}>
            {wsStatus === 'connected' ? (
              <Wifi className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 mr-1.5 text-red-400" />
            )}
            <span className="capitalize">{wsStatus}</span>
          </div>

          {/* Sound Toggle */}
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
            title={soundEnabled ? 'Mute Alert Sounds' : 'Unmute Alert Sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
          </button>

          {/* User Profile / Logout */}
          <div className="flex items-center space-x-3 pl-4 border-l border-gray-800">
            <div className="flex flex-col text-right">
              <span className="text-sm font-semibold text-white">{user.username}</span>
              <span className="text-[10px] text-cyan-400 uppercase font-medium">{user.role}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center">
              <UserIcon className="w-4.5 h-4.5 text-gray-400" />
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 border-r border-gray-800 bg-[#070b13]/40 p-4 flex flex-col space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <Activity className="w-4.5 h-4.5 mr-3 shrink-0" />
            Dashboard Overview
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'live'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <Wifi className="w-4.5 h-4.5 mr-3 shrink-0" />
            Live Monitor Feed
            {liveEvents.filter(e => e.isFlagged).length > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <History className="w-4.5 h-4.5 mr-3 shrink-0" />
            Historical Logs
          </button>

          <button
            onClick={() => setActiveTab('flags')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'flags'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <Flag className="w-4.5 h-4.5 mr-3 shrink-0" />
            Flag List Manager
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'simulator'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <Cpu className="w-4.5 h-4.5 mr-3 shrink-0" />
            Camera Simulator
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'webhook'
                ? 'bg-cyan-500/10 text-cyan-400 border-l-4 border-cyan-500'
                : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
            }`}
          >
            <Webhook className="w-4.5 h-4.5 mr-3 shrink-0" />
            Webhook Config
          </button>
        </aside>

        {/* Main Workspace Frame */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {activeTab === 'dashboard' && (
            <DashboardOverview 
              role={user.role} 
              liveEvents={liveEvents} 
              setActiveTab={setActiveTab} 
            />
          )}
          {activeTab === 'live' && (
            <LiveFeed 
              liveEvents={liveEvents} 
              wsStatus={wsStatus} 
            />
          )}
          {activeTab === 'history' && (
            <HistoryPanel 
              role={user.role} 
            />
          )}
          {activeTab === 'flags' && (
            <FlagListPanel 
              role={user.role} 
            />
          )}
          {activeTab === 'simulator' && (
            <SimulatorPanel 
              role={user.role} 
            />
          )}
          {activeTab === 'webhook' && (
            <WebhookPanel />
          )}
        </main>

      </div>
    </div>
  );
}
