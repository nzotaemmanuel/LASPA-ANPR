import React from 'react';
import { 
  Wifi, 
  WifiOff, 
  Camera, 
  ShieldAlert, 
  Clock, 
  CheckCircle,
  FileImage,
  Gauge,
  Car,
  MapPin,
  ArrowRight,
  Globe
} from 'lucide-react';

export default function LiveFeed({ liveEvents, wsStatus }) {
  return (
    <div className="space-y-6">
      
      {/* Live Monitor Header banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-900/30 border border-gray-800/80 p-5 rounded-2xl gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center">
            <span className="relative flex h-3 w-3 mr-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                wsStatus === 'connected' ? 'bg-emerald-400' : 'bg-red-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                wsStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
              }`}></span>
            </span>
            Real-Time Monitor Feed
          </h2>
          <p className="text-gray-400 text-sm mt-1">Live capture queue of active XCW-MICROCAM-02 nodes.</p>
        </div>

        <div className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center border ${
          wsStatus === 'connected' 
            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20' 
            : 'bg-red-950/20 text-red-400 border-red-500/20 animate-pulse'
        }`}>
          {wsStatus === 'connected' ? (
            <>
              <Wifi className="w-4 h-4 mr-2" />
              <span>Receiving Live Streams...</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 mr-2" />
              <span>WebSocket Reconnecting...</span>
            </>
          )}
        </div>
      </div>

      {/* Capture Grid Cards */}
      {liveEvents.length === 0 ? (
        <div className="glass-panel p-16 rounded-2xl text-center border-dashed border-gray-800 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-gray-900/80 flex items-center justify-center mb-4 border border-gray-800">
            <Camera className="w-8 h-8 text-gray-500 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-gray-300">Awaiting Ingestion Stream</h3>
          <p className="text-sm text-gray-500 max-w-sm mt-1">
            No active captures registered in this session. Go to the **Camera Simulator** tab to post a simulated capture event!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {liveEvents.map((event, idx) => (
            <div 
              key={event.id || idx}
              className={`glass-panel rounded-2xl overflow-hidden transition-all duration-300 flex flex-col p-4 space-y-3 ${
                event.isFlagged 
                  ? 'glow-red border-red-500/40 bg-red-950/5' 
                  : 'border-gray-800/80 hover:border-cyan-500/30'
              }`}
            >
              {/* Card Header: Sensor Node & Timestamp */}
              <div className="flex justify-between items-center text-xs border-b border-gray-800 pb-2">
                <div className="flex items-center space-x-1.5 text-gray-400">
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-bold text-white">{event.cameraId}</span>
                </div>
                <div className="flex items-center space-x-1 text-gray-500 font-medium">
                  <Clock className="w-3 h-3 text-cyan-500/70" />
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* License Plate Card */}
              <div className="bg-gray-950/40 p-3 rounded-xl border border-gray-800/40 flex items-center justify-center">
                <div className="euro-plate">
                  <span className="euro-blue-bar">
                    {event.anprCountry || event.countryShort || 'NGR'}
                  </span>
                  <span className="license-plate-font font-bold text-gray-900 px-2 text-lg md:text-xl py-0.5 select-all">
                    {event.plateNumber}
                  </span>
                </div>
              </div>

              {/* Confidence and GPS Location */}
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <div>
                  OCR Confidence: <span className={`font-bold ${
                    event.confidence >= 90 ? 'text-emerald-400' : event.confidence >= 75 ? 'text-amber-400' : 'text-red-400'
                  }`}>{event.confidence}%</span>
                </div>
                {event.gpsLat && event.gpsLon && (
                  <a
                    href={`https://maps.google.com/?q=${event.gpsLat},${event.gpsLon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-cyan-600 hover:text-cyan-400 transition-colors font-semibold"
                  >
                    <MapPin className="w-3 h-3" />
                    Map
                  </a>
                )}
              </div>

              {/* Status and Enforcement Badges */}
              <div className="pt-2 border-t border-gray-800/60 flex flex-wrap gap-1 justify-start">
                {event.isBooked && (
                  <span className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-500/20 text-blue-400 font-semibold text-[10px] uppercase">
                    Booked ({event.bookingHours}h)
                  </span>
                )}
                {event.isFined && (
                  <span className="px-2 py-0.5 rounded bg-red-950/40 border border-red-500/20 text-red-400 font-semibold text-[10px] uppercase">
                    Fined (₦{event.fineAmount?.toLocaleString()})
                  </span>
                )}
                {event.isDisputed && (
                  <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/20 text-amber-400 font-semibold text-[10px] uppercase">
                    Disputed
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
                {event.isImpounded && (
                  <span className="px-2 py-0.5 rounded bg-rose-950/40 border border-rose-500/20 text-rose-400 font-semibold text-[10px] uppercase">
                    Impounded
                  </span>
                )}
                {event.isFlagged && (
                  <span className="px-2 py-0.5 rounded bg-red-900/50 border border-red-500/30 text-red-300 font-semibold text-[10px] uppercase tracking-wider">
                    Watchlist: {event.flagReason}
                  </span>
                )}
                {!event.isBooked && !event.isFined && !event.isClamped && !event.isTowed && !event.isImpounded && !event.isFlagged && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 font-medium text-[10px] uppercase">
                    Cleared
                  </span>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
