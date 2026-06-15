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
              className={`glass-panel rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
                event.isFlagged 
                  ? 'glow-red border-red-500/40 bg-red-950/5' 
                  : 'border-gray-800/80 hover:border-cyan-500/30'
              }`}
            >
              
              {/* Image Container */}
              <div className="relative h-44 bg-black/60 flex items-center justify-center overflow-hidden group border-b border-gray-800/80">
                {event.imageUrl && !event.imageUrl.includes('/uploads/default') ? (
                  <img 
                    src={event.imageUrl} 
                    alt="License plate capture"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1506521788723-868151859b87?q=80&w=600';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex flex-col items-center text-gray-500">
                    <FileImage className="w-10 h-10 mb-2" />
                    <span className="text-xs">No image available</span>
                  </div>
                )}
                
                {/* Timestamp overlay */}
                <div className="absolute top-3 right-3 flex items-center space-x-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 text-xs">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold text-white">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Flagged badge */}
                {event.isFlagged && (
                  <div className="absolute top-3 left-3 bg-red-600 text-white px-2.5 py-1.5 rounded-lg border border-red-500 text-[10px] font-extrabold uppercase tracking-widest flex items-center">
                    <ShieldAlert className="w-3.5 h-3.5 mr-1.5 animate-bounce" />
                    {event.flagReason}
                  </div>
                )}

                {/* Speed badge (real camera) */}
                {event.triggerSpeed != null && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 text-xs">
                    <Gauge className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300 font-bold">{event.triggerSpeed.toFixed(1)} km/h</span>
                    {event.triggerSpeedLimit && (
                      <span className="text-gray-400">/ {event.triggerSpeedLimit.toFixed(0)}</span>
                    )}
                  </div>
                )}

                {/* Direction badge */}
                {event.triggerDirection && (
                  <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/10 text-[10px] text-gray-300">
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span className="capitalize">{event.triggerDirection}</span>
                  </div>
                )}
              </div>

              {/* Data Specifications body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">

                {/* Camera ID + Confidence */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Node Sensor ID</span>
                    <p className="font-bold text-white text-sm mt-0.5">{event.cameraId}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">OCR Confidence</span>
                    <p className={`font-bold text-sm mt-0.5 ${
                      event.confidence >= 90 ? 'text-emerald-400' : event.confidence >= 75 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {event.confidence}%
                    </p>
                  </div>
                </div>

                {/* License Plate */}
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

                {/* MMR enrichment row (real camera only) */}
                {(event.mmrMake || event.mmrModel || event.mmrColor || event.mmrCategory) && (
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-950/20 border border-indigo-500/15">
                    <Car className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] min-w-0">
                      {event.mmrMake && <span className="text-indigo-300 font-semibold">{event.mmrMake}</span>}
                      {event.mmrModel && <span className="text-indigo-200">{event.mmrModel}</span>}
                      {event.mmrSubmodel && <span className="text-indigo-200/60">{event.mmrSubmodel}</span>}
                      {event.mmrColor && (
                        <span className="text-gray-400">· {event.mmrColor}</span>
                      )}
                      {event.mmrCategory && (
                        <span className="text-gray-500 ml-auto">({event.mmrCategory})</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Country / GPS row */}
                {(event.countryLong || event.location || event.gpsLat) && (
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 px-1">
                    {(event.countryLong || event.location) && (
                      <>
                        <Globe className="w-3 h-3 text-gray-600 shrink-0" />
                        <span>{[event.location, event.countryLong, event.stateLong].filter(Boolean).join(' · ')}</span>
                      </>
                    )}
                    {event.gpsLat && event.gpsLon && (
                      <a
                        href={`https://maps.google.com/?q=${event.gpsLat},${event.gpsLon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto flex items-center gap-0.5 text-cyan-600 hover:text-cyan-400 transition-colors"
                      >
                        <MapPin className="w-3 h-3" />
                        Map
                      </a>
                    )}
                  </div>
                )}

                {/* Status footer */}
                <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle className={`w-3.5 h-3.5 ${event.isFlagged ? 'text-red-400' : 'text-emerald-400'}`} />
                    <span>Status: {event.isFlagged ? 'Flagged Watchlist' : 'Verified Cleared'}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {new Date(event.timestamp).toLocaleDateString()}
                  </span>
                </div>

              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
