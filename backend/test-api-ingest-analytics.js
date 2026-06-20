const http = require('http');

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data))
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(JSON.stringify(data));
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    }).on('error', (e) => reject(e));
  });
}

async function runTests() {
  console.log('--- Starting LASPA Metrics and API Tests ---');
  try {
    // 1. Check health
    const health = await getJson('http://localhost:5000/health');
    console.log('Health Endpoint check:', health.statusCode === 200 ? 'SUCCESS' : 'FAILED', health.body);

    // 2. Query current analytics
    const initialAnalytics = await getJson('http://localhost:5000/api/analytics');
    console.log('Initial Analytics Status Code:', initialAnalytics.statusCode);
    const initialKpis = initialAnalytics.body?.summary || {};
    console.log('Current KPIs before ingestion:');
    console.log('  Total Scanned Vehicles:', initialKpis.totalScanned);
    console.log('  Total Fined:', initialKpis.totalFined);
    console.log('  Total Disputed:', initialKpis.totalDisputed);
    console.log('  Total Clamped:', initialKpis.totalClamped);
    console.log('  Total Towed:', initialKpis.totalTowed);
    console.log('  Total Impounded:', initialKpis.totalImpounded);
    console.log('  Total Bookings:', initialKpis.totalBookings);
    console.log('  Total Booking Hours:', initialKpis.totalBookingHours);
    console.log('  Total Revenue:', initialKpis.totalRevenue);

    // 3. Post a simulated event with custom metrics
    const testPlate = 'TEST-' + Math.floor(Math.random() * 9000 + 1000);
    const ingestPayload = {
      camera_id: 'SIMULATOR',
      plate_number: testPlate,
      confidence: 0.98,
      timestamp: new Date().toISOString(),
      // Custom enforcement fields to trigger explicit storage
      isFined: true,
      fineAmount: 25000,
      isDisputed: false,
      isClamped: true,
      isTowed: false,
      isImpounded: false,
      isBooked: true,
      bookingHours: 4.5,
      revenue: 37250 // 4.5 * 500 = 2250 + 25000 (fine) + 10000 (clamped) = 37250
    };

    console.log(`\nPosting mock event for plate: ${testPlate}...`);
    const ingestRes = await postJson('http://localhost:5000/api/ingest', ingestPayload);
    console.log('Ingest Status Code:', ingestRes.statusCode);
    const savedEvent = ingestRes.body?.event || ingestRes.body;
    console.log('Ingested Event Data:', {
      id: savedEvent?.id,
      plateNumber: savedEvent?.plateNumber,
      isFined: savedEvent?.isFined,
      fineAmount: savedEvent?.fineAmount,
      isClamped: savedEvent?.isClamped,
      isBooked: savedEvent?.isBooked,
      bookingHours: savedEvent?.bookingHours,
      revenue: savedEvent?.revenue
    });

    // Verify fields in saved event
    const match = 
      savedEvent?.plateNumber === testPlate &&
      savedEvent?.isFined === true &&
      savedEvent?.fineAmount === 25000 &&
      savedEvent?.isClamped === true &&
      savedEvent?.isBooked === true &&
      savedEvent?.bookingHours === 4.5 &&
      savedEvent?.revenue === 37250;

    console.log('Saved fields verify check:', match ? 'SUCCESS' : 'FAILED');

    // 4. Query analytics again to verify increase
    const finalAnalytics = await getJson('http://localhost:5000/api/analytics');
    const finalKpis = finalAnalytics.body?.summary || {};
    console.log('\nKPIs after ingestion:');
    console.log('  Total Scanned Vehicles:', finalKpis.totalScanned, `(change: +${(finalKpis.totalScanned || 0) - (initialKpis.totalScanned || 0)})`);
    console.log('  Total Fined:', finalKpis.totalFined, `(change: +${(finalKpis.totalFined || 0) - (initialKpis.totalFined || 0)})`);
    console.log('  Total Disputed:', finalKpis.totalDisputed, `(change: +${(finalKpis.totalDisputed || 0) - (initialKpis.totalDisputed || 0)})`);
    console.log('  Total Clamped:', finalKpis.totalClamped, `(change: +${(finalKpis.totalClamped || 0) - (initialKpis.totalClamped || 0)})`);
    console.log('  Total Towed:', finalKpis.totalTowed, `(change: +${(finalKpis.totalTowed || 0) - (initialKpis.totalTowed || 0)})`);
    console.log('  Total Impounded:', finalKpis.totalImpounded, `(change: +${(finalKpis.totalImpounded || 0) - (initialKpis.totalImpounded || 0)})`);
    console.log('  Total Bookings:', finalKpis.totalBookings, `(change: +${(finalKpis.totalBookings || 0) - (initialKpis.totalBookings || 0)})`);
    console.log('  Total Booking Hours:', finalKpis.totalBookingHours, `(change: +${(finalKpis.totalBookingHours || 0) - (initialKpis.totalBookingHours || 0)})`);
    console.log('  Total Revenue:', finalKpis.totalRevenue, `(change: +${(finalKpis.totalRevenue || 0) - (initialKpis.totalRevenue || 0)})`);

    // Verify analytics aggregation updates
    const analyticsUpdated = 
      (finalKpis.totalScanned || 0) - (initialKpis.totalScanned || 0) === 1 &&
      (finalKpis.totalFined || 0) - (initialKpis.totalFined || 0) === 1 &&
      (finalKpis.totalClamped || 0) - (initialKpis.totalClamped || 0) === 1 &&
      (finalKpis.totalBookings || 0) - (initialKpis.totalBookings || 0) === 1 &&
      Math.abs(((finalKpis.totalBookingHours || 0) - (initialKpis.totalBookingHours || 0)) - 4.5) < 0.01 &&
      Math.abs(((finalKpis.totalRevenue || 0) - (initialKpis.totalRevenue || 0)) - 37250) < 0.01;

    console.log('\nAnalytics aggregation update check:', analyticsUpdated ? 'SUCCESS' : 'FAILED');

    if (match && analyticsUpdated) {
      console.log('\n=========================================');
      console.log('ALL BACKEND ENFORCEMENT METRIC TESTS PASSED!');
      console.log('=========================================');
      process.exit(0);
    } else {
      console.error('\n=========================================');
      console.error('SOME BACKEND METRIC TESTS FAILED.');
      console.error('=========================================');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
