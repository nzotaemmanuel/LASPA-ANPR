import React, { useState, useEffect, useCallback } from 'react';
import {
  Webhook,
  Copy,
  CheckCheck,
  RefreshCw,
  Camera,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
  Clock,
  Wifi,
  Code2,
  FileJson,
  CircleDot,
} from 'lucide-react';
import { getApiUrl } from '../api';

// ─── tiny helpers ────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/60 text-gray-300 hover:text-white text-xs font-medium transition-all active:scale-95"
    >
      {copied ? (
        <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied!</>
      ) : (
        <><Copy className="w-3.5 h-3.5" /> {label}</>
      )}
    </button>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const ok = status.startsWith('OK');
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
      ok
        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20'
        : 'bg-red-950/40 text-red-400 border border-red-500/20'
    }`}>
      {ok ? '✓ processed' : '✗ rejected'}
    </span>
  );
}

function FormatBadge({ format }) {
  const isNative = format === 'camera-native';
  return (
    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0 ${
      isNative
        ? 'bg-indigo-950/40 text-indigo-400 border border-indigo-500/20'
        : 'bg-gray-800 text-gray-500 border border-gray-700/50'
    }`}>
      {isNative ? '📷 camera' : '🖥 simulator'}
    </span>
  );
}

function ExpandableRow({ payload, index }) {
  const [open, setOpen] = useState(false);
  const b = payload.body || {};
  const isNative = b._format === 'camera-native';

  // Display values — works for both formats
  const cameraId    = isNative ? b.camera_id : b.camera_id;
  const plateNumber = isNative ? b.plate_number : b.plate_number;
  const confidence  = b.confidence;
  const make        = b.mmr_make;
  const model       = b.mmr_model;
  const color       = b.mmr_color;
  const speed       = b.trigger_speed;
  const direction   = b.trigger_direction;
  const country     = b.country;

  return (
    <div className="border border-gray-800/60 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-900/40 transition-colors text-left"
      >
        <span className="text-[10px] font-bold text-gray-500 w-5 shrink-0">#{index + 1}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        }
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-cyan-300 truncate">{cameraId ?? '—'}</span>
          <span className="text-xs font-mono text-white font-bold">{plateNumber ?? '—'}</span>
          {confidence !== undefined && (
            <span className="text-[10px] text-amber-400">{confidence}%</span>
          )}
          {make && (
            <span className="text-[10px] text-indigo-300 truncate">{[make, model, color].filter(Boolean).join(' · ')}</span>
          )}
          {speed != null && (
            <span className="text-[10px] text-emerald-400">{speed} km/h {direction ? `↗ ${direction}` : ''}</span>
          )}
          {country && (
            <span className="text-[10px] text-gray-400">{country}</span>
          )}
          <FormatBadge format={b._format} />
          <StatusBadge status={payload.processingStatus} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-gray-500">
          <Clock className="w-3 h-3" />
          {new Date(payload.receivedAt).toLocaleTimeString()}
        </div>
        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono shrink-0">
          {payload.sourceIp}
        </span>
      </button>

      {/* Expanded JSON view */}
      {open && (
        <div className="border-t border-gray-800 bg-gray-950/60 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Full Raw Payload</span>
            <CopyButton text={JSON.stringify(payload.rawBody ?? payload, null, 2)} label="Copy JSON" />
          </div>
          <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(payload.rawBody ?? payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function WebhookPanel() {
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [payloads, setPayloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [activeScreenTab, setActiveScreenTab] = useState('license'); // 'license' | 'engine'
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const [infoRes, payloadsRes] = await Promise.all([
        fetch(getApiUrl('/api/ingest/webhook-info')),
        fetch(getApiUrl('/api/ingest/recent-payloads')),
      ]);
      const infoData = await infoRes.json();
      const payloadsData = await payloadsRes.json();
      setWebhookInfo(infoData);
      setPayloads(payloadsData.payloads || []);
      setLastRefreshed(new Date());
    } catch (err) {
      setError('Unable to reach the backend. Is the server running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchData(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const sampleJson = webhookInfo?.sampleJsonPayload
    ? JSON.stringify(webhookInfo.sampleJsonPayload, null, 2)
    : '';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Webhook className="w-6 h-6 text-cyan-400" />
            Webhook Configuration
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Configure the XCW-MICROCAM-02 at <code className="bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded text-cyan-300 text-xs">192.168.168.48</code> to push ANPR events to this endpoint.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastRefreshed.toLocaleTimeString()}
            </span>
          )}

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              autoRefresh
                ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <CircleDot className={`w-3 h-3 ${autoRefresh ? 'animate-pulse' : ''}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          {error}
        </div>
      )}

      {/* ── Section 1: Webhook Endpoint ─────────────────────────────────────── */}
      {webhookInfo && (
        <div className="glass-panel rounded-2xl border border-gray-800/80 overflow-hidden shadow-md">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/60 bg-gray-900/30">
            <Wifi className="w-4.5 h-4.5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Camera Webhook Endpoint</h3>
              <p className="text-[10px] text-gray-500">Point the ANPR camera's HTTP push URL to this address</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* URL row */}
            <div>
              <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block mb-2">
                Webhook URL (copy to camera config)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-950 border border-cyan-500/20 rounded-xl px-4 py-3 font-mono text-sm text-cyan-300 overflow-x-auto whitespace-nowrap">
                  {webhookInfo.webhookUrl}
                </div>
                <CopyButton text={webhookInfo.webhookUrl} label="Copy URL" />
              </div>
            </div>

            {/* Method + Content-Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block mb-2">HTTP Method</label>
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm font-bold text-emerald-400 font-mono inline-block">
                  {webhookInfo.method}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block mb-2">Content-Type</label>
                <div className="flex flex-col gap-1">
                  {webhookInfo.supportedContentTypes.map(ct => (
                    <code key={ct} className="text-xs bg-gray-900 border border-gray-800 text-gray-300 px-2 py-1 rounded font-mono">{ct}</code>
                  ))}
                </div>
              </div>
            </div>

            {/* Camera IP banner */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
              <Camera className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
              <div className="text-xs text-indigo-300">
                <span className="font-semibold">Target Camera:</span> XCW-MICROCAM-02 at{' '}
                <code className="font-mono bg-indigo-950/50 px-1.5 py-0.5 rounded text-indigo-200">192.168.168.48</code>
                {' '}— navigate to the camera's web interface and set the HTTP push/webhook URL above.
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              {webhookInfo.notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                  <Info className="w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5" />
                  {n}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section: ANPR Engine & Licensing Status ──────────────────────────── */}
      <div className="glass-panel rounded-2xl border border-gray-800/80 overflow-hidden shadow-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 bg-gray-900/30">
          <div className="flex items-center gap-3">
            <Camera className="w-4.5 h-4.5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-sm text-white">ANPR Engine & License Status</h3>
              <p className="text-[10px] text-gray-500">Hardware verification for device serial 1191574 (XCW-MICROCAM-02)</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
            Licensed & Active
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Metadata & Stats List */}
          <div className="space-y-4">
            <h4 className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Device Properties Summary</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-950 border border-gray-850 p-3 rounded-xl">
                <span className="text-[10px] text-gray-500 block uppercase">Device Serial</span>
                <span className="font-mono text-sm font-bold text-white">1191574</span>
              </div>
              <div className="bg-gray-950 border border-gray-850 p-3 rounded-xl">
                <span className="text-[10px] text-gray-500 block uppercase">Software Version</span>
                <span className="font-mono text-sm font-bold text-white">V3.6.r1.3861</span>
              </div>
              <div className="bg-gray-950 border border-gray-850 p-3 rounded-xl col-span-2">
                <span className="text-[10px] text-gray-500 block uppercase">Installed ANPR Engine</span>
                <span className="font-mono text-sm font-bold text-cyan-300">cmanpr-7.3.17.124:saf</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Active Licenses (Exp. 2025.12.31)</span>
              
              <div className="overflow-hidden rounded-xl border border-gray-850 bg-gray-950/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-900/60 text-gray-500 text-[10px] uppercase font-bold tracking-wider border-b border-gray-850">
                    <tr>
                      <th className="px-3 py-2">Lic ID</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: '1234846', desc: 'CARMEN Anpr ( SAF )' },
                      { id: '1234847', desc: 'CARMEN Anpr ( SAF )' },
                      { id: '1234848', desc: 'CARMEN Anpr ( SAF )' },
                      { id: '1234849', desc: 'CARMEN Anpr ( SAF )' },
                      { id: '1234850', desc: 'CARMEN Core 4' }
                    ].map(lic => (
                      <tr key={lic.id} className="border-b border-gray-900/30">
                        <td className="px-3 py-2 font-mono text-gray-400">{lic.id}</td>
                        <td className="px-3 py-2 text-gray-300 font-medium">{lic.desc}</td>
                        <td className="px-3 py-2 text-right text-emerald-400 font-semibold">Valid</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Interactive Screen Snapshots */}
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Device Config Console Snapshots</span>
              <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-850">
                <button
                  onClick={() => setActiveScreenTab('license')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                    activeScreenTab === 'license'
                      ? 'bg-cyan-500 text-gray-950'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  License Man
                </button>
                <button
                  onClick={() => setActiveScreenTab('engine')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                    activeScreenTab === 'engine'
                      ? 'bg-cyan-500 text-gray-950'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Engine Man
                </button>
              </div>
            </div>

            <div className="relative border border-gray-800 rounded-xl overflow-hidden bg-black/60 aspect-video flex justify-center items-center group">
              <img
                src={activeScreenTab === 'license' ? getApiUrl('/uploads/camera_license_snapshot.jpg') : getApiUrl('/uploads/camera_engine_snapshot.jpg')}
                alt="Camera configuration snapshot"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-[10px] font-bold text-gray-300 font-mono">
                  {activeScreenTab === 'license' ? '192.168.168.48/#anpr_licman' : '192.168.168.48/#engineman'}
                </span>
                <a
                  href={activeScreenTab === 'license' ? getApiUrl('/uploads/camera_license_snapshot.jpg') : getApiUrl('/uploads/camera_engine_snapshot.jpg')}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-cyan-500 text-gray-950 font-bold rounded-lg text-[9px] hover:bg-cyan-400 active:scale-95 transition-all"
                >
                  Open Original
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Expected Payload Schema ──────────────────────────────── */}
      {webhookInfo && (
        <div className="glass-panel rounded-2xl border border-gray-800/80 overflow-hidden shadow-md">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/60 bg-gray-900/30">
            <FileJson className="w-4.5 h-4.5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Expected JSON Payload Schema</h3>
              <p className="text-[10px] text-gray-500">Fields the backend expects the ANPR camera to send</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Field tables */}
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Required Fields</p>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-900/60 text-gray-400 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Field</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookInfo.requiredFields.map(f => (
                      <tr key={f.field} className="border-t border-gray-800/60">
                        <td className="px-4 py-3 font-mono text-cyan-300 text-xs font-bold">{f.field}</td>
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs">{f.type}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Optional Fields</p>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-900/60 text-gray-400 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Field</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookInfo.optionalFields.map(f => (
                      <tr key={f.field} className="border-t border-gray-800/60">
                        <td className="px-4 py-3 font-mono text-cyan-300 text-xs">{f.field}</td>
                        <td className="px-4 py-3 font-mono text-amber-400 text-xs">{f.type}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sample payload */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Sample JSON Payload</p>
                <CopyButton text={sampleJson} label="Copy Sample" />
              </div>
              <pre className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-[12px] font-mono text-gray-300 overflow-x-auto leading-relaxed">
                {sampleJson}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Live Payload Inspector ───────────────────────────────── */}
      <div className="glass-panel rounded-2xl border border-gray-800/80 overflow-hidden shadow-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 bg-gray-900/30">
          <div className="flex items-center gap-3">
            <Code2 className="w-4.5 h-4.5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-white">Live Payload Inspector</h3>
              <p className="text-[10px] text-gray-500">
                Last {payloads.length} raw HTTP requests received at <code className="text-gray-400">/api/ingest</code> — expand each row to see the full payload
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {payloads.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                {payloads.length} received
              </span>
            )}
            <ArrowDownToLine className="w-3.5 h-3.5 text-gray-500" />
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : payloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center">
                <Webhook className="w-7 h-7 text-gray-700" />
              </div>
              <p className="text-gray-400 font-medium">No payloads received yet</p>
              <p className="text-gray-600 text-xs max-w-xs">
                Once the camera at <code className="text-gray-500">192.168.168.48</code> is configured and triggers a detection event, the raw payload will appear here.
                You can also use the <strong className="text-gray-500">Camera Simulator</strong> to test the webhook.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {payloads.map((payload, i) => (
                <ExpandableRow key={payload.receivedAt + i} payload={payload} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
