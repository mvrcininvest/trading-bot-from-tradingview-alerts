import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const serverInfo: any = {
      timestamp: new Date().toISOString(),
      headers: {
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        'x-real-ip': request.headers.get('x-real-ip'),
        'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
        'host': request.headers.get('host'),
        'user-agent': request.headers.get('user-agent'),
      }
    };

    // Get server IP
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      serverInfo.serverIP = ipData.ip;
      
      // Get detailed geo information
      try {
        const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
        
        if (!geoResponse.ok) {
          throw new Error(`Geo API returned ${geoResponse.status}`);
        }
        
        const geoData = await geoResponse.json();
        
        // Check if API returned error
        if (geoData.error) {
          throw new Error(geoData.reason || 'Geo API error');
        }
        
        serverInfo.geolocation = {
          ip: geoData.ip || ipData.ip,
          city: geoData.city || 'Unknown',
          region: geoData.region || 'Unknown',
          region_code: geoData.region_code || '?',
          country: geoData.country_name || 'Unknown',
          country_code: geoData.country_code || '?',
          continent: geoData.continent_code || '?',
          timezone: geoData.timezone || 'Unknown',
          latitude: geoData.latitude || null,
          longitude: geoData.longitude || null,
          organization: geoData.org || 'Unknown',
          asn: geoData.asn || 'Unknown',
        };
        
        // Check if region is likely blocked by CloudFront
        const blockedRegions = ['RU', 'BY', 'KP', 'IR', 'SY', 'CU']; // Common blocked countries
        serverInfo.cloudFrontRisk = {
          isHighRisk: blockedRegions.includes(geoData.country_code),
          countryCode: geoData.country_code,
          note: blockedRegions.includes(geoData.country_code) 
            ? '⚠️ This region is commonly blocked by CloudFront distributions'
            : '✅ Region is typically allowed by CloudFront'
        };
      } catch (geoError: any) {
        console.error('Geo API error:', geoError);
        serverInfo.geolocation = {
          error: geoError.message,
          ip: ipData.ip,
          city: 'Unknown',
          country: 'Unknown',
          country_code: '?',
        };
        serverInfo.geolocationError = `Failed to fetch geo data: ${geoError.message}`;
      }
      
      // Test Bybit connectivity
      try {
        console.log('🔍 Testing Bybit API connectivity from server...');
        const bybitTest = await fetch('https://api.bybit.com/v5/market/time', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });
        
        const bybitText = await bybitTest.text();
        console.log(`📊 Bybit response (first 200 chars): ${bybitText.substring(0, 200)}`);
        
        // Check if CloudFront returned HTML error page
        if (bybitText.includes('<!DOCTYPE html>') || bybitText.includes('<html')) {
          console.error('🚨 CLOUDFRONT BLOCK DETECTED!');
          serverInfo.bybitConnectivity = {
            status: 'BLOCKED',
            error: 'CloudFront returns HTML error page instead of JSON',
            isBlocked: true,
            httpStatus: bybitTest.status,
            responsePreview: bybitText.substring(0, 500),
            message: '🚨 CRITICAL: Your server region is BLOCKED by Bybit CloudFront!',
            recommendation: 'Use a proxy server in an allowed region (US/EU) or change deployment region',
          };
        } else {
          try {
            const bybitData = JSON.parse(bybitText);
            console.log('✅ Bybit API accessible, retCode:', bybitData.retCode);
            serverInfo.bybitConnectivity = {
              status: 'OK',
              retCode: bybitData.retCode,
              serverTime: bybitData.result?.timeSecond,
              isBlocked: false,
              message: '✅ Bybit API is accessible from this region',
            };
          } catch (parseError) {
            // JSON parse failed but not HTML - unexpected response
            serverInfo.bybitConnectivity = {
              status: 'UNEXPECTED',
              error: 'Response is not valid JSON',
              isBlocked: 'unknown',
              responsePreview: bybitText.substring(0, 500),
              message: '⚠️ Unexpected response from Bybit (not JSON, not HTML)',
            };
          }
        }
      } catch (bybitError: any) {
        console.error('❌ Bybit test error:', bybitError.message);
        serverInfo.bybitConnectivity = {
          status: 'ERROR',
          error: bybitError.message,
          isBlocked: 'unknown',
          message: '⚠️ Failed to test Bybit connectivity - network error',
        };
      }
      
    } catch (ipError) {
      serverInfo.ipError = 'Failed to fetch server IP';
    }

    // Environment info
    serverInfo.environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      vercelRegion: process.env.VERCEL_REGION || 'not-vercel',
      deploymentUrl: process.env.VERCEL_URL || 'localhost',
    };

    return NextResponse.json({
      success: true,
      ...serverInfo
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}