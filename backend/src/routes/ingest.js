const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const prisma = require('../db');

// In-memory registries to match split camera JSON and JPEG requests
const recentJSONs = new Map();
const pendingJPEGs = new Map();

function getCleanIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (ip && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}

// ──────────────────────────────────────────────────────────────────────────────
// Ingestion forwarding helper (for secure relay to remote Render backend)
// ──────────────────────────────────────────────────────────────────────────────
async function forwardRequest(req) {
  const targetUrl = process.env.FORWARD_TO_URL;
  if (!targetUrl) return null;

  console.log(`[FORWARDER] Relaying camera request to remote HTTPS server: ${targetUrl}`);

  const headers = { ...req.headers };
  delete headers['host'];
  delete headers['connection'];
  delete headers['content-length'];

  let fetchBody;
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    fetchBody = JSON.stringify(req.body);
  } else if (contentType.includes('multipart/form-data')) {
    const form = new globalThis.FormData();

    if (req.body) {
      for (const [key, value] of Object.entries(req.body)) {
        form.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileBuffer = fs.readFileSync(file.path);
        const blob = new globalThis.Blob([fileBuffer], { type: file.mimetype });
        form.append(file.fieldname, blob, file.originalname);
      }
    }
    fetchBody = form;
    delete headers['content-type'];
  } else {
    fetchBody = req.body ? JSON.stringify(req.body) : undefined;
  }

  // Abort relay if remote doesn't respond within 50 seconds (gives Render time to wake up)
  const controller = new AbortController();
  const relayTimeout = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: fetchBody,
      signal: controller.signal
    });
    clearTimeout(relayTimeout);

    const resContentType = response.headers.get('content-type') || '';
    const data = resContentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return {
      status: response.status,
      data: data
    };
  } catch (err) {
    clearTimeout(relayTimeout);
    const reason = err.name === 'AbortError' ? 'timed out after 50s' : err.message;
    console.error(`[FORWARDER] Relay to remote server failed: ${reason}`);
    throw err;
  }
}


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
/**
 * Sanitizes template strings uploaded by the camera.
 * 1. Returns null if the template variable was NOT replaced (e.g. contains "$(" syntax).
 * 2. Strips any trailing semicolon if it is present.
 * 3. Returns null for empty strings.
 */
function sanitizeCameraValue(val) {
  if (val === undefined || val === null) return null;

  // If it's a number, convert to string for uniform processing
  let strVal = String(val).trim();

  // If the placeholder is unreplaced, return null
  if (strVal.includes('$(') || strVal.includes('$FormatTime') || strVal.includes('$DB2JSON') || strVal.includes('$DMULT')) {
    return null;
  }

  // Strip trailing semicolon
  if (strVal.endsWith(';')) {
    strVal = strVal.slice(0, -1).trim();
  }

  return strVal === '' ? null : strVal;
}

/**
 * Decodes a base64 encoded image string and saves it to the uploads directory.
 * Returns the relative static asset path or null if saving fails.
 */
function saveBase64Image(base64Str, prefix = 'image') {
  if (!base64Str || typeof base64Str !== 'string') return null;

  try {
    // Strip trailing semicolon if present (due to template format)
    let cleanBase64 = base64Str.trim();
    if (cleanBase64.endsWith(';')) {
      cleanBase64 = cleanBase64.slice(0, -1).trim();
    }

    // Check if it starts with standard data URI scheme
    const dataUriMatch = cleanBase64.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    let ext = 'jpg';
    let rawData = cleanBase64;

    if (dataUriMatch && dataUriMatch.length === 3) {
      ext = dataUriMatch[1];
      rawData = dataUriMatch[2];
    } else {
      // Determine file extension from base64 signature
      if (cleanBase64.startsWith('/9j/')) ext = 'jpg';
      else if (cleanBase64.startsWith('iVBORw0KG')) ext = 'png';
      else if (cleanBase64.startsWith('PHN2Zy')) ext = 'svg+xml';
    }

    // Convert raw base64 data to binary buffer
    const buffer = Buffer.from(rawData, 'base64');
    if (buffer.length < 10) {
      // Not a valid image file, too small
      return null;
    }

    const filename = `${Date.now()}_${prefix}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    // Ensure uploads directory exists (just in case)
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  } catch (error) {
    console.error('[IMAGE-DECODE] Failed to decode/save base64 image:', error);
    return null;
  }
}

function normalizePayloadRaw(body, files = []) {
  // Find uploaded files by name if multipart form was sent
  let uploadedNormalImg = null;
  let uploadedLpImg = null;
  let uploadedAuxImg = null;
  let uploadedImageFile = null;

  if (Array.isArray(files)) {
    for (const file of files) {
      if (file.fieldname === 'normal_img') uploadedNormalImg = file;
      else if (file.fieldname === 'lp_img') uploadedLpImg = file;
      else if (file.fieldname === 'aux_img') uploadedAuxImg = file;
      else if (file.fieldname === 'imageFile') uploadedImageFile = file;
    }
  }

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

    // Parse confidence
    const sanitizedConf = sanitizeCameraValue(anpr.confidence);
    const confidence = sanitizedConf ? (parseFloat(sanitizedConf) || 100.0) : 100.0;

    // Parse timestamp from frametime or frametimems
    let timestamp = new Date();
    const frametime = sanitizeCameraValue(capture.frametime);
    const frametimems = sanitizeCameraValue(capture.frametimems);

    if (frametime) {
      try {
        // Format: "20250615T143022+0100"  → ISO-ish
        // Insert colons to make it parseable: YYYYMMDDTHHMMSS+HH00
        const ft = frametime
          .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(.*)$/, '$1-$2-$3T$4:$5:$6$7');
        const d = new Date(ft);
        if (!isNaN(d)) timestamp = d;
      } catch (_) { /* keep server time */ }
    } else if (frametimems) {
      const ms = parseInt(frametimems);
      if (!isNaN(ms)) timestamp = new Date(ms);
    }

    // Plate text (may be empty string if no ANPR result)
    const plateText = sanitizeCameraValue(anpr.text);
    const plateNumber = plateText ? plateText.toUpperCase() : 'UNKNOWN';

    // Camera ID — prefer cameraid, fall back to location
    const cameraVal = sanitizeCameraValue(r.cameraid) || sanitizeCameraValue(r.location);
    const cameraId = cameraVal ? cameraVal.trim() : 'CAM-UNKNOWN';

    // Resolve images
    let imageUrl = '/uploads/default_vehicle.jpg';

    // 1. Resolve normal_img
    if (uploadedNormalImg) {
      imageUrl = `/uploads/${uploadedNormalImg.filename}`;
    } else {
      const normalImgStr = images.normal_img;
      if (normalImgStr && normalImgStr.length > 10) {
        const cleanNormalImg = sanitizeCameraValue(normalImgStr);
        if (cleanNormalImg) {
          if (cleanNormalImg.startsWith('http://') || cleanNormalImg.startsWith('https://')) {
            imageUrl = cleanNormalImg;
          } else {
            const savedPath = saveBase64Image(cleanNormalImg, 'normal_img');
            if (savedPath) imageUrl = savedPath;
          }
        }
      }
    }

    // 2. Resolve lp_img
    if (imageUrl === '/uploads/default_vehicle.jpg') {
      if (uploadedLpImg) {
        imageUrl = `/uploads/${uploadedLpImg.filename}`;
      } else {
        const lpImgStr = images.lp_img;
        if (lpImgStr && lpImgStr.length > 10) {
          const cleanLpImg = sanitizeCameraValue(lpImgStr);
          if (cleanLpImg) {
            const savedPath = saveBase64Image(cleanLpImg, 'lp_img');
            if (savedPath) imageUrl = savedPath;
          }
        }
      }
    }

    // 3. Fallback to imageFile (from simulator multipart form)
    if (imageUrl === '/uploads/default_vehicle.jpg' && uploadedImageFile) {
      imageUrl = `/uploads/${uploadedImageFile.filename}`;
    }

    // 4. Fallback to any uploaded image file in files array (regardless of field name)
    if (imageUrl === '/uploads/default_vehicle.jpg' && Array.isArray(files)) {
      const imgFile = files.find(f =>
        f.mimetype && f.mimetype.startsWith('image/')
      );
      if (imgFile) {
        imageUrl = `/uploads/${imgFile.filename}`;
      }
    }

    // Speed values (after $DMULT)
    const triggerSpeedStr = sanitizeCameraValue(trigger.speed);
    const triggerSpeedLimitStr = sanitizeCameraValue(trigger.speed_limit);
    const triggerSpeed = triggerSpeedStr ? parseFloat(triggerSpeedStr) : null;
    const triggerSpeedLimit = triggerSpeedLimitStr ? parseFloat(triggerSpeedLimitStr) : null;

    return {
      timestamp,
      cameraId,
      plateNumber,
      confidence,
      imageUrl,
      // Enrichment
      anprType: sanitizeCameraValue(anpr.type),
      anprCountry: sanitizeCameraValue(anpr.country),
      anprState: sanitizeCameraValue(anpr.state),
      anprBgColor: sanitizeCameraValue(anpr.bgcolor),
      anprColor: sanitizeCameraValue(anpr.color),
      anprResultCnt: anpr.resultcnt ? (parseInt(sanitizeCameraValue(anpr.resultcnt)) || null) : null,
      // MMR
      mmrMake: sanitizeCameraValue(mmr.make),
      mmrModel: sanitizeCameraValue(mmr.model),
      mmrSubmodel: sanitizeCameraValue(mmr.submodel),
      mmrCategory: sanitizeCameraValue(mmr.category),
      mmrColor: sanitizeCameraValue(mmr.color),
      mmrModelConf: mmr.model_conf ? (parseFloat(sanitizeCameraValue(mmr.model_conf)) || null) : null,
      mmrCategoryConf: mmr.category_conf ? (parseFloat(sanitizeCameraValue(mmr.category_conf)) || null) : null,
      mmrColorConf: mmr.color_conf ? (parseFloat(sanitizeCameraValue(mmr.color_conf)) || null) : null,
      // Trigger
      triggerSpeed,
      triggerSpeedLimit,
      triggerDirection: sanitizeCameraValue(trigger.direction),
      triggerCategory: sanitizeCameraValue(trigger.category),
      triggerVclass: sanitizeCameraValue(trigger.vclass),
      // Country / location
      countryLong: sanitizeCameraValue(country.country_long),
      countryShort: sanitizeCameraValue(country.country_short),
      stateLong: sanitizeCameraValue(country.state_long),
      stateShort: sanitizeCameraValue(country.state_short),
      location: sanitizeCameraValue(r.location),
      // GPS
      gpsLat: sanitizeCameraValue(misc.gps_lat),
      gpsLon: sanitizeCameraValue(misc.gps_lon),
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

  if (uploadedImageFile) {
    imageUrl = `/uploads/${uploadedImageFile.filename}`;
  } else if (image && typeof image === 'string') {
    if (image.startsWith('http://') || image.startsWith('https://')) {
      imageUrl = image;
    } else if (image.startsWith('data:image') || image.startsWith('data:image/svg')) {
      imageUrl = image;
    } else {
      const savedPath = saveBase64Image(image, 'flat_img');
      if (savedPath) imageUrl = savedPath;
    }
  }

  // Fallback to any uploaded image file in files array (regardless of field name)
  if (imageUrl === '/uploads/default_vehicle.jpg' && Array.isArray(files)) {
    const imgFile = files.find(f =>
      f.mimetype && f.mimetype.startsWith('image/')
    );
    if (imgFile) {
      imageUrl = `/uploads/${imgFile.filename}`;
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

function normalizePayload(body, files = []) {
  const resultObj = normalizePayloadRaw(body, files);

  // Extract enforcement metrics
  const getBool = (k) => {
    if (body[k] !== undefined) return body[k] === true || body[k] === 'true';
    if (body.result && body.result[k] !== undefined) return body.result[k] === true || body.result[k] === 'true';
    return undefined;
  };

  const getFloat = (k) => {
    if (body[k] !== undefined) return parseFloat(body[k]);
    if (body.result && body.result[k] !== undefined) return parseFloat(body.result[k]);
    return undefined;
  };

  const isFinedVal = getBool('isFined');
  const isBookedVal = getBool('isBooked');

  const hasEnforcementFields = isFinedVal !== undefined || isBookedVal !== undefined;

  let finalIsFined = false;
  let finalFineAmount = 0.0;
  let finalIsDisputed = false;
  let finalIsClamped = false;
  let finalIsTowed = false;
  let finalIsImpounded = false;
  let finalIsBooked = false;
  let finalBookingHours = 0.0;
  let finalRevenue = 0.0;

  if (hasEnforcementFields) {
    finalIsFined = isFinedVal ?? false;
    finalFineAmount = getFloat('fineAmount') ?? 0.0;
    finalIsDisputed = getBool('isDisputed') ?? false;
    finalIsClamped = getBool('isClamped') ?? false;
    finalIsTowed = getBool('isTowed') ?? false;
    finalIsImpounded = getBool('isImpounded') ?? false;
    finalIsBooked = isBookedVal ?? false;
    finalBookingHours = getFloat('bookingHours') ?? 0.0;
    finalRevenue = getFloat('revenue') ?? 0.0;
  } else {
    // Dynamic fallback generation based on speed or random probabilities
    const speed = resultObj.triggerSpeed;
    const limit = resultObj.triggerSpeedLimit;
    if (speed && limit && speed > limit) {
      finalIsFined = true;
      finalFineAmount = 25000;
      finalIsDisputed = Math.random() < 0.2;
      finalIsClamped = Math.random() < 0.1;
      finalIsTowed = Math.random() < 0.05;
      finalIsImpounded = Math.random() < 0.02;
    } else {
      if (Math.random() < 0.08) {
        finalIsFined = true;
        finalFineAmount = 15000;
        finalIsDisputed = Math.random() < 0.15;
        finalIsClamped = Math.random() < 0.3;
        finalIsTowed = finalIsClamped && Math.random() < 0.4;
        finalIsImpounded = finalIsTowed && Math.random() < 0.3;
      }
    }

    if (Math.random() < 0.15 && !finalIsFined) {
      finalIsBooked = true;
      finalBookingHours = parseFloat((1 + Math.random() * 7).toFixed(1));
    }

    let rev = 0;
    if (finalIsBooked) {
      rev += finalBookingHours * 500;
    }
    if (finalIsFined && !finalIsDisputed) {
      rev += finalFineAmount;
    }
    if (finalIsClamped) rev += 10000;
    if (finalIsTowed) rev += 20000;
    if (finalIsImpounded) rev += 35000;
    finalRevenue = rev;
  }

  return {
    ...resultObj,
    isFined: finalIsFined,
    fineAmount: finalFineAmount,
    isDisputed: finalIsDisputed,
    isClamped: finalIsClamped,
    isTowed: finalIsTowed,
    isImpounded: finalIsImpounded,
    isBooked: finalIsBooked,
    bookingHours: finalBookingHours,
    revenue: finalRevenue
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
    let cameraId = 'unknown-cam';
    let plate = 'unknown-plate';

    // Parse body if it has been parsed or check fields
    if (req.body) {
      if (req.body.camera_id) {
        cameraId = req.body.camera_id;
      } else if (req.body.result && req.body.result.cameraid) {
        cameraId = req.body.result.cameraid;
      } else if (req.body.cameraid) {
        cameraId = req.body.cameraid;
      }

      if (req.body.plate_number) {
        plate = req.body.plate_number;
      } else if (req.body.result && req.body.result.anpr && req.body.result.anpr.text) {
        plate = req.body.result.anpr.text;
      }
    }

    // Clean values
    cameraId = cameraId.replace(/[^a-zA-Z0-9]/g, '_');
    plate = plate.replace(/[^a-zA-Z0-9]/g, '_');
    if (cameraId.endsWith('_')) cameraId = cameraId.slice(0, -1);
    if (plate.endsWith('_')) plate = plate.slice(0, -1);

    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${timestamp}_${cameraId}_${plate}${ext}`);
  },
});
const upload = multer({ storage });

// ──────────────────────────────────────────────────────────────────────────────
// Core ingestion handler
// ──────────────────────────────────────────────────────────────────────────────
async function handleIngestion(req, res) {
  try {
    let body = req.body;

    // Handle multipart uploads where JSON template might be sent in a string field named "json" or "UploadInfo"
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) { /* ignore */ }
    } else if (body && typeof body.json === 'string') {
      try {
        body = JSON.parse(body.json);
      } catch (e) { /* ignore */ }
    } else if (body && typeof body.UploadInfo === 'string') {
      try {
        body = JSON.parse(body.UploadInfo);
      } catch (e) { /* ignore */ }
    }

    // Extract JSON payload from uploaded files if req.body is empty (for cameras uploading JSON as a file attachment)
    if ((!body || Object.keys(body).length === 0) && req.files && req.files.length > 0) {
      const jsonFile = req.files.find(f =>
        (f.originalname && f.originalname.toLowerCase().endsWith('.json')) ||
        f.mimetype === 'application/json' ||
        f.fieldname === 'json' ||
        f.fieldname === 'UploadInfo'
      );
      if (jsonFile) {
        try {
          const fileContent = fs.readFileSync(jsonFile.path, 'utf8');
          body = JSON.parse(fileContent);
          console.log(`[INGEST] Successfully extracted JSON payload from uploaded file: ${jsonFile.originalname}`);
        } catch (e) {
          console.error('[INGEST] Failed to parse uploaded JSON file:', e.message);
        }
      }
    }
    const sourceIp = getCleanIp(req);
    const isCameraJson = !!(body && body.result);
    const isSplitJpeg = !isCameraJson && (!body || !body.camera_id) && req.files && req.files.length > 0;

    let pendingResolver = null;

    if (isSplitJpeg) {
      const firstFile = req.files[0];
      console.log(`[INGEST] Received potential split JPEG request from IP: ${sourceIp}, file: ${firstFile.filename}`);

      // Check if we recently processed a JSON request from this IP
      const recentJson = recentJSONs.get(sourceIp);
      if (recentJson && (Date.now() - recentJson.timestamp < 5000)) {
        // Found a recent JSON request from this IP
        console.log(`[INGEST] Found matching recent JSON event ${recentJson.eventId} for IP ${sourceIp}`);

        if (recentJson.imageUrl &&
          recentJson.imageUrl !== '/uploads/default_vehicle.jpg' &&
          !recentJson.imageUrl.startsWith('http://') &&
          !recentJson.imageUrl.startsWith('https://')) {
          // The JSON request already had the image (base64) and saved it
          console.log(`[INGEST] JSON event already has image: ${recentJson.imageUrl}. Deleting duplicate upload.`);
          try {
            if (fs.existsSync(firstFile.path)) {
              fs.unlinkSync(firstFile.path);
            }
          } catch (err) {
            console.error('[INGEST] Error deleting duplicate file:', err.message);
          }
          return res.status(200).json({ message: 'Image upload processed (deduplicated)' });
        } else {
          // The JSON request did NOT have the image. We must associate this uploaded file with the event!
          const updatedImageUrl = `/uploads/${firstFile.filename}`;
          const updatedEvent = await prisma.event.update({
            where: { id: recentJson.eventId },
            data: { imageUrl: updatedImageUrl }
          });
          console.log(`[INGEST] Updated Event ${recentJson.eventId} with uploaded JPEG image: ${updatedImageUrl}`);

          const broadcast = req.app.get('broadcast');
          if (broadcast) {
            broadcast(updatedEvent);
          }
          return res.status(200).json({ message: 'Image associated with event successfully', event: updatedEvent });
        }
      } else {
        // No recent JSON metadata found yet. The JPEG might have arrived first.
        // We will wait for the JSON metadata up to 3000ms using a Promise delay.
        console.log(`[INGEST] No recent JSON found for IP ${sourceIp}. Waiting up to 3000ms for metadata...`);
        let resolvedEvent = null;

        await new Promise((resolve) => {
          let resolved = false;
          pendingJPEGs.set(sourceIp, {
            filename: firstFile.filename,
            timestamp: Date.now(),
            resolve: (evt) => {
              resolved = true;
              resolve(evt);
            }
          });

          setTimeout(() => {
            if (!resolved) {
              pendingJPEGs.delete(sourceIp);
              resolve(null);
            }
          }, 3000);
        }).then((evt) => {
          resolvedEvent = evt;
        });

        if (resolvedEvent) {
          console.log(`[INGEST] Split JPEG successfully merged with JSON metadata from IP ${sourceIp}`);
          return res.status(200).json({ message: 'Image merged with metadata', event: resolvedEvent });
        } else {
          console.log(`[INGEST] Timeout waiting for JSON from IP ${sourceIp}. Discarding orphaned image and preventing fallback DB record creation.`);
          try {
            if (fs.existsSync(firstFile.path)) {
              fs.unlinkSync(firstFile.path);
            }
          } catch (err) {
            console.error('[INGEST] Error deleting orphaned JPEG file:', err.message);
          }
          return res.status(200).json({ message: 'Orphaned image processed (discarded - no metadata)' });
        }
      }
    } else if (isCameraJson) {
      // It's a JSON metadata request from the camera.
      // Check if there is a pending JPEG request waiting for it.
      const pendingJpeg = pendingJPEGs.get(sourceIp);
      if (pendingJpeg && (Date.now() - pendingJpeg.timestamp < 3000)) {
        console.log(`[INGEST] Found waiting pending JPEG from IP ${sourceIp}: ${pendingJpeg.filename}`);
        // Inject the JPEG file into req.files so normalizePayload will find it and use it!
        const matchedFile = {
          fieldname: 'normal_img',
          filename: pendingJpeg.filename,
          path: path.join(uploadsDir, pendingJpeg.filename),
          mimetype: 'image/jpeg'
        };
        if (!req.files) req.files = [];
        req.files.push(matchedFile);

        pendingResolver = pendingJpeg.resolve;
        pendingJPEGs.delete(sourceIp);
      }
    }

    // 0. Log the raw payload
    const logEntry = logRawPayload(req, body);
    if (req.files && req.files.length > 0) logEntry.hasImageFile = true;

    // 1. Normalize payload (handles both camera-native and flat simulator formats)
    const normalized = normalizePayload(body, req.files);

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
        timestamp: normalized.timestamp,
        cameraId: normalized.cameraId,
        plateNumber: normalized.plateNumber,
        confidence: normalized.confidence,
        imageUrl: normalized.imageUrl,
        isFlagged,
        flagReason,
        // ANPR
        anprType: normalized.anprType,
        anprCountry: normalized.anprCountry,
        anprState: normalized.anprState,
        anprBgColor: normalized.anprBgColor,
        anprColor: normalized.anprColor,
        anprResultCnt: normalized.anprResultCnt,
        // MMR
        mmrMake: normalized.mmrMake,
        mmrModel: normalized.mmrModel,
        mmrSubmodel: normalized.mmrSubmodel,
        mmrCategory: normalized.mmrCategory,
        mmrColor: normalized.mmrColor,
        mmrModelConf: normalized.mmrModelConf,
        mmrCategoryConf: normalized.mmrCategoryConf,
        mmrColorConf: normalized.mmrColorConf,
        // Trigger
        triggerSpeed: normalized.triggerSpeed,
        triggerSpeedLimit: normalized.triggerSpeedLimit,
        triggerDirection: normalized.triggerDirection,
        triggerCategory: normalized.triggerCategory,
        triggerVclass: normalized.triggerVclass,
        // Country / GPS
        countryLong: normalized.countryLong,
        countryShort: normalized.countryShort,
        stateLong: normalized.stateLong,
        stateShort: normalized.stateShort,
        location: normalized.location,
        gpsLat: normalized.gpsLat,
        gpsLon: normalized.gpsLon,
        // Raw payload
        rawPayload: normalized.rawPayload,
        // LASPA enforcement metrics
        isFined: normalized.isFined,
        fineAmount: normalized.fineAmount,
        isDisputed: normalized.isDisputed,
        isClamped: normalized.isClamped,
        isTowed: normalized.isTowed,
        isImpounded: normalized.isImpounded,
        isBooked: normalized.isBooked,
        bookingHours: normalized.bookingHours,
        revenue: normalized.revenue,
      },
    });

    if (isCameraJson) {
      recentJSONs.set(sourceIp, {
        eventId: event.id,
        imageUrl: event.imageUrl,
        timestamp: Date.now()
      });
      // Automatically clean up after 5 seconds
      setTimeout(() => {
        const item = recentJSONs.get(sourceIp);
        if (item && item.eventId === event.id) {
          recentJSONs.delete(sourceIp);
        }
      }, 5000);
    }

    if (pendingResolver) {
      console.log(`[INGEST] Resolving pending JPEG request for IP ${sourceIp}`);
      pendingResolver(event);
    }

    const format = (body && body.result) ? 'camera-native' : 'simulator-flat';
    console.log(`[INGEST] [${format}] Plate: ${normalized.plateNumber} | Cam: ${normalized.cameraId} | Confidence: ${normalized.confidence}% | Flagged: ${isFlagged}`);

    // 5. Broadcast to WebSocket clients
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast(event);
    }

    // 6. Asynchronously forward to remote server in background (if configured)
    if (process.env.FORWARD_TO_URL) {
      console.log(`[FORWARDER] Queueing background relay to remote server...`);
      forwardRequest(req).then((resForward) => {
        if (resForward && resForward.status >= 200 && resForward.status < 300) {
          console.log(`[FORWARDER] Background relay to remote server succeeded: Status ${resForward.status}`);
        } else {
          console.warn(`[FORWARDER] Background relay to remote server returned status: ${resForward ? resForward.status : 'unknown'}`);
        }
      }).catch(err => {
        console.error(`[FORWARDER] Background relay to remote server failed: ${err.message}`);
      });
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
router.post('/', upload.any(), handleIngestion);

module.exports = router;
