import React, { useState } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  Send, 
  AlertOctagon, 
  FileText,
  Car,
  Image as ImageIcon
} from 'lucide-react';
import { getApiUrl } from '../api';

// Predefined mock base64/SVG images representing different vehicles for simulation
// This prevents missing assets during testing!
const mockVehicleSVGs = [
  // Red Sedan
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="15%" dominant-baseline="middle" text-anchor="middle" fill="%23cbd5e1" font-size="20" font-family="sans-serif">ANPR INGESTION SIMULATOR</text><rect x="150" y="200" width="300" height="90" rx="30" fill="%23ef4444"/><rect x="190" y="140" width="220" height="80" rx="40" fill="%23ef4444"/><circle cx="210" cy="290" r="35" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><circle cx="390" cy="290" r="35" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><rect x="250" y="235" width="100" height="30" rx="4" fill="%23ffffff" stroke="%23374151" stroke-width="2"/><text x="300" y="255" dominant-baseline="middle" text-anchor="middle" fill="%23111827" font-weight="bold" font-family="monospace" font-size="14">PLATE_PLACEHOLDER</text></svg>`,
  // Blue SUV
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="15%" dominant-baseline="middle" text-anchor="middle" fill="%23cbd5e1" font-size="20" font-family="sans-serif">ANPR INGESTION SIMULATOR</text><rect x="130" y="160" width="340" height="130" rx="20" fill="%233b82f6"/><rect x="160" y="110" width="220" height="80" rx="20" fill="%233b82f6"/><circle cx="200" cy="290" r="40" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><circle cx="400" cy="290" r="40" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><rect x="250" y="220" width="100" height="30" rx="4" fill="%23ffffff" stroke="%23374151" stroke-width="2"/><text x="300" y="240" dominant-baseline="middle" text-anchor="middle" fill="%23111827" font-weight="bold" font-family="monospace" font-size="14">PLATE_PLACEHOLDER</text></svg>`,
  // Green Hatchback
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="15%" dominant-baseline="middle" text-anchor="middle" fill="%23cbd5e1" font-size="20" font-family="sans-serif">ANPR INGESTION SIMULATOR</text><rect x="140" y="190" width="320" height="100" rx="25" fill="%2310b981"/><rect x="180" y="130" width="180" height="80" rx="30" fill="%2310b981"/><circle cx="210" cy="290" r="35" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><circle cx="390" cy="290" r="35" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><rect x="250" y="235" width="100" height="30" rx="4" fill="%23ffffff" stroke="%23374151" stroke-width="2"/><text x="300" y="255" dominant-baseline="middle" text-anchor="middle" fill="%23111827" font-weight="bold" font-family="monospace" font-size="14">PLATE_PLACEHOLDER</text></svg>`,
  // Orange Sports Car
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="15%" dominant-baseline="middle" text-anchor="middle" fill="%23cbd5e1" font-size="20" font-family="sans-serif">ANPR INGESTION SIMULATOR</text><rect x="150" y="210" width="310" height="75" rx="15" fill="%23f97316"/><path d="M190,210 L250,150 L400,150 L440,210 Z" fill="%23f97316"/><circle cx="210" cy="285" r="32" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><circle cx="390" cy="285" r="32" fill="%230f172a" stroke="%23cbd5e1" stroke-width="4"/><rect x="250" y="235" width="100" height="30" rx="4" fill="%23ffffff" stroke="%23374151" stroke-width="2"/><text x="300" y="255" dominant-baseline="middle" text-anchor="middle" fill="%23111827" font-weight="bold" font-family="monospace" font-size="14">PLATE_PLACEHOLDER</text></svg>`
];

export default function SimulatorPanel({ role }) {
  const [cameraId, setCameraId] = useState('CAM-01-NORTH');
  const [plateNumber, setPlateNumber] = useState('LA-432-XYZ');
  const [confidence, setConfidence] = useState(94.2);
  const [imageIndex, setImageIndex] = useState(0);
  const [payloadFormat, setPayloadFormat] = useState('camera-native'); // 'camera-native' | 'simulator-flat'

  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState(null);
  const [errorLog, setErrorLog] = useState('');

  // Vehicle mapping for native MMR/trigger simulation
  const vehicleDetails = [
    { make: 'Toyota', model: 'Camry', category: 'Sedan', color: 'Red', speed: 68 },
    { make: 'Ford', model: 'Explorer', category: 'SUV', color: 'Blue', speed: 75 },
    { make: 'Volkswagen', model: 'Golf', category: 'Hatchback', color: 'Green', speed: 62 },
    { make: 'Porsche', model: '911', category: 'Sports Car', color: 'Orange', speed: 110 }
  ];

  // Generator for random license plates
  const handleGenerateRandom = (prefix = '') => {
    const states = ['LA', 'EK', 'AB', 'RV', 'KD', 'OY'];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    let plate = '';
    
    if (prefix === 'STOLEN') {
      plate = `STOLEN-${Math.floor(10 + Math.random() * 90)}`;
    } else if (prefix === 'SUSPECT') {
      plate = `SUSPECT-${Math.floor(10 + Math.random() * 90)}`;
    } else if (prefix === 'VIP') {
      plate = `VIP-${Math.floor(100 + Math.random() * 899)}`;
    } else if (prefix === 'STAFF') {
      plate = `STAFF-${Math.floor(10 + Math.random() * 90)}`;
    } else {
      const state = states[Math.floor(Math.random() * states.length)];
      const num = Math.floor(100 + Math.random() * 899);
      const letters = alphabet[Math.floor(Math.random() * 26)] + alphabet[Math.floor(Math.random() * 26)];
      plate = `${state}-${num}-${letters}`;
    }

    setPlateNumber(plate);
    setConfidence(parseFloat((82 + Math.random() * 18).toFixed(1)));
    setImageIndex(Math.floor(Math.random() * mockVehicleSVGs.length));
  };

  const handleTriggerIngest = async () => {
    setLoading(true);
    setResponseLog(null);
    setErrorLog('');

    try {
      // Create SVG representation with the plate text embedded
      const rawSvg = mockVehicleSVGs[imageIndex];
      const encodedSvg = rawSvg.replace('PLATE_PLACEHOLDER', plateNumber);

      let payload;
      const now = new Date();

      if (payloadFormat === 'camera-native') {
        const details = vehicleDetails[imageIndex];
        const pad = (n) => String(n).padStart(2, '0');
        const year = now.getFullYear();
        const month = pad(now.getMonth() + 1);
        const day = pad(now.getDate());
        const hours = pad(now.getHours());
        const minutes = pad(now.getMinutes());
        const seconds = pad(now.getSeconds());
        const frametime = `${year}${month}${day}T${hours}${minutes}${seconds}+0100`;

        payload = {
          result: {
            location: cameraId.toLowerCase().includes('north') ? 'HIGHWAY-NORTH' : 'HIGHWAY-SOUTH',
            cameraid: cameraId,
            ID: String(Math.floor(1000 + Math.random() * 9000)),
            image_hash: Math.random().toString(36).substring(2, 10),
            capture: {
              frametime,
              frametimems: String(now.getTime()),
              frameindex: String(Math.floor(10 + Math.random() * 100))
            },
            anpr: {
              text: plateNumber.toUpperCase(),
              type: 'normal',
              country: 'NG',
              state: 'LA',
              frame: '',
              bgcolor: 'white',
              color: 'black',
              confidence: String(confidence),
              timems: '28',
              resultcnt: '1',
              opt_speed: ''
            },
            country: {
              country_long: 'Nigeria',
              country_short: 'NG',
              state_long: 'Lagos',
              state_short: 'LA'
            },
            mmr: {
              make: details.make,
              model: details.model,
              submodel: '',
              category: details.category,
              color: details.color,
              model_conf: String((90 + Math.random() * 9).toFixed(1)),
              category_conf: String((95 + Math.random() * 4).toFixed(1)),
              color_conf: String((92 + Math.random() * 7).toFixed(1))
            },
            motdet: {
              rect: '',
              confidence: '',
              objectid: '',
              objectix: ''
            },
            trigger: {
              speed: String((details.speed + (Math.random() * 10 - 5)).toFixed(2)),
              speed_limit: '100.00',
              direction: cameraId.toLowerCase().includes('exit') ? 'backward' : 'forward',
              category: details.category.toLowerCase(),
              vclass: '',
              timems: String(now.getTime()),
              data: ''
            },
            misc: {
              gps_lat: '6.5244',
              gps_lon: '3.3792'
            },
            images: {
              normal_img: encodedSvg,
              lp_img: '',
              aux_img: ''
            }
          }
        };
      } else {
        payload = {
          camera_id: cameraId,
          plate_number: plateNumber.toUpperCase(),
          confidence: parseFloat(confidence),
          timestamp: now.toISOString(),
          image: encodedSvg
        };
      }

      const res = await fetch(getApiUrl('/api/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      
      if (!res.ok) {
        setErrorLog(data.error || 'Failed to ingest data');
      } else {
        setResponseLog(data);
      }
    } catch (err) {
      console.error(err);
      setErrorLog('Network error: Ingestion api is unreachable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Camera Simulator</h2>
        <p className="text-gray-400 text-sm">Emulate camera nodes pushing JSON packets to the backend ingestion pipeline.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Simulator Parameters Panel */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-sm text-cyan-400 font-semibold mb-4 border-b border-gray-800 pb-3">
              <Cpu className="w-4 h-4 animate-spin-slow" />
              <span>Ingestion Node Settings</span>
            </div>

            <div className="space-y-4">
              {/* Preset Shortcuts */}
              <div>
                <span className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Simulation Presets</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button 
                    onClick={() => handleGenerateRandom()} 
                    className="py-2 px-3 text-xs bg-gray-900 border border-gray-800 rounded-xl text-gray-300 hover:text-white hover:bg-gray-800/50 transition-colors cursor-pointer"
                  >
                    Random Traffic
                  </button>
                  <button 
                    onClick={() => handleGenerateRandom('STOLEN')} 
                    className="py-2 px-3 text-xs bg-red-950/20 border border-red-500/20 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer"
                  >
                    Stolen Plate
                  </button>
                  <button 
                    onClick={() => handleGenerateRandom('SUSPECT')} 
                    className="py-2 px-3 text-xs bg-amber-950/20 border border-amber-500/20 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition-colors cursor-pointer"
                  >
                    Suspicious
                  </button>
                  <button 
                    onClick={() => handleGenerateRandom('VIP')} 
                    className="py-2 px-3 text-xs bg-indigo-950/20 border border-indigo-500/20 rounded-xl text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 transition-colors cursor-pointer"
                  >
                    VIP Clear
                  </button>
                </div>
              </div>

              {/* Ingestion Payload Format selection */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Ingestion Payload Format</label>
                <select
                  value={payloadFormat}
                  onChange={e => setPayloadFormat(e.target.value)}
                  className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="camera-native">Camera Native Format (Nested - XCW-MICROCAM-02)</option>
                  <option value="simulator-flat">Simulator Flat Format (Legacy)</option>
                </select>
              </div>

              {/* Sensor Node selection */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Sensor Node ID</label>
                <select
                  value={cameraId}
                  onChange={e => setCameraId(e.target.value)}
                  className="w-full bg-gray-950/40 border border-gray-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="CAM-01-NORTH">CAM-01-NORTH (Main Expressway)</option>
                  <option value="CAM-02-SOUTH">CAM-02-SOUTH (Alternate Route)</option>
                  <option value="CAM-03-GATE">CAM-03-GATE (Office Entrance)</option>
                  <option value="CAM-04-EXIT">CAM-04-EXIT (Office Exit)</option>
                </select>
              </div>

              {/* License Plate String */}
              <div>
                <label className="block text-gray-400 text-xs font-semibold uppercase mb-1.5">Captured Plate Number</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={plateNumber}
                    onChange={e => setPlateNumber(e.target.value)}
                    placeholder="e.g. LA-123-AB"
                    className="flex-1 bg-gray-950/40 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition-colors uppercase"
                  />
                  <button
                    onClick={() => handleGenerateRandom()}
                    className="p-2.5 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors cursor-pointer"
                    title="Generate Random Details"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* OCR Confidence Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-gray-400 text-xs font-semibold uppercase">OCR Confidence Score</label>
                  <span className="text-xs font-semibold text-cyan-400">{confidence}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="0.1"
                  value={confidence}
                  onChange={e => setConfidence(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 bg-gray-850 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* Vehicle visual selection */}
              <div>
                <span className="block text-gray-400 text-xs font-semibold uppercase mb-2">Simulated Vehicle Color/Type</span>
                <div className="flex space-x-4">
                  {['Red Sedan', 'Blue SUV', 'Green Hatch', 'Orange Sports'].map((color, index) => (
                    <button
                      key={color}
                      onClick={() => setImageIndex(index)}
                      className={`flex-1 py-2 rounded-lg border text-[10px] font-semibold transition-all ${
                        imageIndex === index 
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold' 
                          : 'bg-gray-950/40 border-gray-800 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleTriggerIngest}
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 active:scale-95 text-gray-950 font-bold py-3.5 rounded-xl shadow-lg shadow-cyan-500/10 transition-all cursor-pointer flex items-center justify-center text-xs mt-6"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Ingesting Mock Event...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Dispatch Camera Payload POST
              </>
            )}
          </button>
        </div>

        {/* Live Simulator Preview & Response Logs */}
        <div className="flex flex-col space-y-6">
          
          {/* Card Preview */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md">
            <span className="block text-gray-400 text-xs font-semibold uppercase mb-3 flex items-center">
              <Car className="w-4.5 h-4.5 text-cyan-400 mr-1.5" />
              Ingestion Payload Preview
            </span>
            <div className="relative h-48 bg-[#1e293b] border border-gray-800/40 rounded-xl overflow-hidden flex items-center justify-center">
              <img 
                src={mockVehicleSVGs[imageIndex].replace('PLATE_PLACEHOLDER', plateNumber.toUpperCase())} 
                alt="Mock Ingestion Vehicle SVG" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Response Console log */}
          <div className="glass-panel p-5 rounded-2xl border border-gray-800/80 shadow-md flex-1 flex flex-col min-h-[160px]">
            <span className="block text-gray-400 text-xs font-semibold uppercase mb-3 flex items-center border-b border-gray-800 pb-2.5">
              <FileText className="w-4.5 h-4.5 text-cyan-400 mr-1.5" />
              API Response logs
            </span>

            <div className="flex-1 bg-black/60 border border-gray-850 rounded-xl p-4 font-mono text-xs text-gray-400 overflow-auto max-h-[200px]">
              {loading && <span className="text-cyan-400 animate-pulse">&gt; Waiting for API response packet...</span>}
              {!loading && !responseLog && !errorLog && <span className="text-gray-600">&gt; Console clear. Submit ingestion POST to receive packets.</span>}
              {errorLog && (
                <div className="text-red-400 space-y-1">
                  <p className="font-semibold text-red-500">&gt; INGESTION ERROR 500</p>
                  <p>{errorLog}</p>
                </div>
              )}
              {responseLog && (
                <div className="space-y-1 text-emerald-400">
                  <p className="font-semibold text-emerald-500">&gt; HTTP STATUS 201: CREATED</p>
                  <pre className="text-gray-400 text-[10px] select-all leading-normal mt-2">
                    {JSON.stringify(responseLog, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
