const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const prisma = require('../db');

// ──────────────────────────────────────────────────────────────────────────────
// In-memory raw payload log (circular buffer, max 50)
// ──────────────────────────────────────────────────────────────────────────────
const RAW_PAYLOAD_LOG_MAX = 50;
const rawPayloadLog = [];

/**
 * Logs the raw incoming request for the Webhook Inspector panel.
 * Stores a compact summary (truncates long image strings) plus the full body.
 */
function logRawPayload(req, body) {
  // Determine which payload format we received
  const isNested = !!(body && body.result);

  // Build a compact body snapshot for quick display in the inspector
  let bodySnapshot;
  if (isNested) {
    const r = body.result;
    bodySnapshot = {
      _format: 'camera-native',
      camera_id: r.cameraid,
      plate_number: r.anpr?.text,
      confidence: r.anpr?.confidence,
      location: r.location,
      mmr_make: r.mmr?.make,
      mmr_model: r.mmr?.model,
      mmr_color: r.mmr?.color,
      trigger_speed: r.trigger?.speed,
      trigger_direction: r.trigger?.direction,
      country: r.country?.country_short,
    };
  } else {
    bodySnapshot = {
      _format: 'simulator-flat',
      camera_id: body.camera_id,
      plate_number: body.plate_number,
      confidence: body.confidence,
      timestamp: body.timestamp,
      image: body.image
        ? (typeof body.image === 'string' && body.image.length > 80
            ? body.image.substring(0, 80) + '…[truncated]'
            : body.image)
        : undefined,
    };
  }

  const entry = {
    receivedAt: new Date().toISOString(),
    sourceIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
    contentType: req.headers['content-type'] || 'unknown',
    method: req.method,
    path: req.originalUrl,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'content-length': req.headers['content-length'],
    },
    body: bodySnapshot,
    // Full raw payload – truncate any base64 blobs that are very long
    rawBody: JSON.parse(JSON.stringify(body, (key, val) => {
      if (typeof val === 'string' && val.length > 500 &&
          (key === 'normal_img' || key === 'lp_img' || key === 'aux_img' || key === 'image')) {
        return val.substring(0, 100) + '…[image truncated]';
      }
      return val;
    })),
    hasImageFile: false,
  };

  rawPayloadLog.unshift(entry);
  if (rawPayloadLog.length > RAW_PAYLOAD_LOG_MAX) {
    rawPayloadLog.pop();
  }
  return entry;
}

// ──────────────────────────────────────────────────────────────────────────────
// Payload normalizer
// Accepts EITHER the real camera native format OR the flat simulator format
// Returns a unified object consumed by the ingestion handler.
// ──────────────────────────────────────────────────────────────────────────────
function normalizePayload(body, uploadedFile) {
  // ── Real Camera Format ────────────────────────────────────────────────────
  // Detected by the presence of a top-level "result" key
  if (body && body.result) {
    const r = body.result;
    const anpr = r.anpr || {};
    const mmr = r.mmr || {};
    const trigger = r.trigger || {};
    const country = r.country || {};
    const misc = r.misc || {};
    const images = r.images || {};
    const capture = r.capture || {};

    // Parse confidence (may come as string "95.4" or number)
    const rawConf = parseFloat(anpr.confidence);
    const confidence = isNaN(rawConf) ? 100.0 : rawConf;

    // Parse timestamp from frametime or frametimems
    let timestamp = new Date();
    if (capture.frametime) {
      // Format: "20250615T143022+0100"  → ISO-ish
      try {
        // Insert colons to make it parseable: YYYYMMDDTHHMMSS+HH00
        const ft = capture.frametime
          .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(.*)$/, '$1-$2-$3T$4:$5:$6$7');
        const d = new Date(ft);
        if (!isNaN(d)) timestamp = d;
      } catch (_) { /* keep server time */ }
    }

    // Plate text (may be empty string if no ANPR result)
    const plateNumber = (anpr.text || '').trim().toUpperCase() || 'UNKNOWN';

    // Camera ID — prefer cameraid, fall back to location
    const cameraId = (r.cameraid || r.location || 'CAM-UNKNOWN').trim();

    // Image URL – images are embedded base64 or URLs from camera;
    // we store them as-is (too large to always re-save to disk)
    let imageUrl = '/uploads/default_vehicle.jpg';
    const normalImg = images.normal_img || '';
    if (normalImg && normalImg.length > 10 && !normalImg.includes('$(')) {
      // It's real image data (base64 or URL)
      if (normalImg.startsWith('http://') || normalImg.startsWith('https://')) {
        imageUrl = normalImg;
      } else if (normalImg.startsWith('data:image')) {
        imageUrl = normalImg; // store data URI
      }
    }

    // Parse speed values (camera sends them as floats already after $DMULT)
    const triggerSpeed = parseFloat(trigger.speed) || null;
    const triggerSpeedLimit = parseFloat(trigger.speed_limit) || null;

    return {
      timestamp,
      cameraId,
      plateNumber,
      confidence,
      imageUrl,
      // Enrichment
      anprType: anpr.type || null,
      anprCountry: anpr.country || null,
      anprState: anpr.state || null,
      anprBgColor: anpr.bgcolor || null,
      anprColor: anpr.color || null,
      anprResultCnt: parseInt(anpr.resultcnt) || null,
      // MMR
      mmrMake: mmr.make || null,
      mmrModel: mmr.model || null,
      mmrSubmodel: mmr.submodel || null,
      mmrCategory: mmr.category || null,
      mmrColor: mmr.color || null,
      mmrModelConf: parseFloat(mmr.model_conf) || null,
      mmrCategoryConf: parseFloat(mmr.category_conf) || null,
      mmrColorConf: parseFloat(mmr.color_conf) || null,
      // Trigger
      triggerSpeed,
      triggerSpeedLimit,
      triggerDirection: trigger.direction || null,
      triggerCategory: trigger.category || null,
      triggerVclass: trigger.vclass || null,
      // Country / location
      countryLong: country.country_long || null,
      countryShort: country.country_short || null,
      stateLong: country.state_long || null,
      stateShort: country.state_short || null,
      location: r.location || null,
      // GPS
      gpsLat: misc.gps_lat || null,
      gpsLon: misc.gps_lon || null,
      // Raw payload stored as JSON string for auditing
      rawPayload: JSON.stringify(body),
    };
  }

  // ── Flat Simulator Format ────────────────────────────────────────────────────
  const {
    timestamp,
    camera_id,
    plate_number,
    confidence,
    image,
  } = body;

  const cleanPlate = (plate_number || '').trim().toUpperCase() || 'UNKNOWN';
  const parsedConfidence = confidence ? parseFloat(confidence) : 100.0;
  const finalTimestamp = timestamp ? new Date(timestamp) : new Date();

  let imageUrl = '/uploads/default_vehicle.jpg';

  if (uploadedFile) {
    imageUrl = `/uploads/${uploadedFile.filename}`;
  } else if (image && typeof image === 'string') {
    if (image.startsWith('http://') || image.startsWith('https://')) {
      imageUrl = image;
    } else if (image.startsWith('data:image') || image.startsWith('data:image/svg')) {
      imageUrl = image;
    }
  }

  return {
    timestamp: finalTimestamp,
    cameraId: (camera_id || 'SIMULATOR').trim(),
    plateNumber: cleanPlate,
    confidence: parsedConfidence,
    imageUrl,
    rawPayload: JSON.stringify(body),
    // All enrichment fields null for simulator
    anprType: null, anprCountry: null, anprState: null,
    anprBgColor: null, anprColor: null, anprResultCnt: null,
    mmrMake: null, mmrModel: null, mmrSubmodel: null,
    mmrCategory: null, mmrColor: null,
    mmrModelConf: null, mmrCategoryConf: null, mmrColorConf: null,
    triggerSpeed: null, triggerSpeedLimit: null,
    triggerDirection: null, triggerCategory: null, triggerVclass: null,
    countryLong: null, countryShort: null, stateLong: null, stateShort: null,
    location: null, gpsLat: null, gpsLon: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Wildcard/pattern matching for FlagList
// ──────────────────────────────────────────────────────────────────────────────
function matchesPattern(plate, pattern) {
  const sanitizedPlate = plate.trim().toUpperCase();
  const sanitizedPattern = pattern.trim().toUpperCase();
  let regexStr = sanitizedPattern
    .replace(/[-\/\\^$+.()|[\]{}]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexStr}$`, 'i');
  return regex.test(sanitizedPlate);
}

// ──────────────────────────────────────────────────────────────────────────────
// Multer — for multipart/form-data uploads from the simulator
// ──────────────────────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const cameraId = req.body.camera_id || 'unknown-cam';
    const plate = req.body.plate_number || 'unknown-plate';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${timestamp}_${cameraId.replace(/[^a-zA-Z0-9]/g, '_')}_${plate.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`);
  },
});
const upload = multer({ storage });

// ──────────────────────────────────────────────────────────────────────────────
// Core ingestion handler
// ──────────────────────────────────────────────────────────────────────────────
async function handleIngestion(req, res) {
  try {
    const body = req.body;

    // 0. Log the raw payload
    const logEntry = logRawPayload(req, body);
    if (req.file) logEntry.hasImageFile = true;

    // 1. Normalize payload (handles both camera-native and flat simulator formats)
    const normalized = normalizePayload(body, req.file);

    // 2. Basic validation — we must have a camera and plate
    if (!normalized.cameraId || !normalized.plateNumber) {
      logEntry.processingStatus = 'REJECTED - missing camera_id / plate';
      return res.status(400).json({ error: 'camera_id (or cameraid) and plate_number (or anpr.text) are required' });
    }

    // 3. Flag list matching
    const flags = await prisma.flagList.findMany();
    let isFlagged = false;
    let flagReason = null;

    if (normalized.plateNumber !== 'UNKNOWN') {
      for (const flag of flags) {
        if (matchesPattern(normalized.plateNumber, flag.platePattern)) {
          isFlagged = true;
          flagReason = flag.label;
          break;
        }
      }
    }

    // 4. Save to database
    const event = await prisma.event.create({
      data: {
        timestamp:        normalized.timestamp,
        cameraId:         normalized.cameraId,
        plateNumber:      normalized.plateNumber,
        confidence:       normalized.confidence,
        imageUrl:         normalized.imageUrl,
        isFlagged,
        flagReason,
        // ANPR
        anprType:         normalized.anprType,
        anprCountry:      normalized.anprCountry,
        anprState:        normalized.anprState,
        anprBgColor:      normalized.anprBgColor,
        anprColor:        normalized.anprColor,
        anprResultCnt:    normalized.anprResultCnt,
        // MMR
        mmrMake:          normalized.mmrMake,
        mmrModel:         normalized.mmrModel,
        mmrSubmodel:      normalized.mmrSubmodel,
        mmrCategory:      normalized.mmrCategory,
        mmrColor:         normalized.mmrColor,
        mmrModelConf:     normalized.mmrModelConf,
        mmrCategoryConf:  normalized.mmrCategoryConf,
        mmrColorConf:     normalized.mmrColorConf,
        // Trigger
        triggerSpeed:     normalized.triggerSpeed,
        triggerSpeedLimit: normalized.triggerSpeedLimit,
        triggerDirection: normalized.triggerDirection,
        triggerCategory:  normalized.triggerCategory,
        triggerVclass:    normalized.triggerVclass,
        // Country / GPS
        countryLong:      normalized.countryLong,
        countryShort:     normalized.countryShort,
        stateLong:        normalized.stateLong,
        stateShort:       normalized.stateShort,
        location:         normalized.location,
        gpsLat:           normalized.gpsLat,
        gpsLon:           normalized.gpsLon,
        // Raw payload
        rawPayload:       normalized.rawPayload,
      },
    });

    const format = (body && body.result) ? 'camera-native' : 'simulator-flat';
    console.log(`[INGEST] [${format}] Plate: ${normalized.plateNumber} | Cam: ${normalized.cameraId} | Confidence: ${normalized.confidence}% | Flagged: ${isFlagged}`);

    // 5. Broadcast to WebSocket clients
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast(event);
    }

    logEntry.processingStatus = `OK - Event ID: ${event.id}`;

    return res.status(201).json({ message: 'Ingestion successful', event });
  } catch (error) {
    console.error('[INGEST] Processing failed:', error);
    return res.status(500).json({ error: 'Failed to process ingestion payload' });
  }
}

// ── GET /api/ingest/webhook-info ──────────────────────────────────────────────
router.get('/webhook-info', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers.host || `localhost:${process.env.PORT || 5000}`;
  const webhookUrl = `${protocol}://${host}/api/ingest`;

  res.json({
    webhookUrl,
    method: 'POST',
    supportedContentTypes: [
      'application/json',
      'multipart/form-data (with imageFile field)',
    ],
    cameraIp: '192.168.168.48',
    requiredFields: [
      { field: 'result.cameraid', type: 'string', description: 'Camera ID sent by the ANPR device (e.g. XCW-MICROCAM-02)' },
      { field: 'result.anpr.text', type: 'string', description: 'Recognised plate text extracted by the ANPR engine' },
    ],
    optionalFields: [
      { field: 'result.anpr.confidence', type: 'number (0-100)', description: 'OCR confidence score. Defaults to 100 if omitted.' },
      { field: 'result.capture.frametime', type: 'string (YYYYMMDDTHHmmss±HHmm)', description: 'Frame capture timestamp. Defaults to server receive time.' },
      { field: 'result.images.normal_img', type: 'string (URL or base64)', description: 'Full-frame capture image.' },
      { field: 'result.mmr.*', type: 'object', description: 'Make/Model/Recognition fields (make, model, submodel, color, category + confidence scores).' },
      { field: 'result.trigger.*', type: 'object', description: 'Trigger context: speed, speed_limit, direction, category, vclass.' },
      { field: 'result.country.*', type: 'object', description: 'Country and state (long and short forms).' },
      { field: 'result.misc.gps_lat / gps_lon', type: 'string', description: 'GPS coordinates of the camera.' },
    ],
    sampleJsonPayload: {
      result: {
        location: 'HIGHWAY-NORTH',
        cameraid: 'XCW-MICROCAM-02',
        ID: '1001',
        image_hash: 'abc123',
        capture: {
          frametime: '20250615T143022+0100',
          frametimems: '1749999022000',
          frameindex: '42',
        },
        anpr: {
          text: 'ABC123XY',
          type: 'normal',
          country: 'NG',
          state: 'LA',
          frame: '',
          bgcolor: 'white',
          color: 'black',
          confidence: '97.4',
          timems: '28',
          resultcnt: '1',
          opt_speed: '',
        },
        country: {
          country_long: 'Nigeria',
          country_short: 'NG',
          state_long: 'Lagos',
          state_short: 'LA',
        },
        mmr: {
          make: 'Toyota',
          model: 'Camry',
          submodel: '',
          category: 'Sedan',
          color: 'Silver',
          model_conf: '94.2',
          category_conf: '98.1',
          color_conf: '91.7',
        },
        trigger: {
          speed: '72.50',
          speed_limit: '100.00',
          direction: 'forward',
          category: 'car',
          vclass: '',
          timems: '1749999022000',
          data: '',
        },
        misc: {
          gps_lat: '6.5244',
          gps_lon: '3.3792',
        },
        images: {
          normal_img: 'https://your-camera-ip/snapshot.jpg',
          lp_img: '',
          aux_img: '',
        },
      },
    },
    notes: [
      'The camera at 192.168.168.48 should POST to the webhookUrl above with Content-Type: application/json.',
      'Both the native camera payload format (result.anpr.text, result.cameraid, …) and the legacy flat format (camera_id, plate_number, …) are accepted.',
      'If running behind a proxy/NAT, ensure the camera can reach this server\'s IP/hostname on the configured port.',
      'Images can also be uploaded as multipart/form-data with the field name "imageFile".',
    ],
  });
});

// ── GET /api/ingest/recent-payloads ──────────────────────────────────────────
router.get('/recent-payloads', (req, res) => {
  res.json({
    count: rawPayloadLog.length,
    payloads: rawPayloadLog,
  });
});

// ── POST /api/ingest ──────────────────────────────────────────────────────────
router.post('/', upload.single('imageFile'), handleIngestion);

module.exports = router;
