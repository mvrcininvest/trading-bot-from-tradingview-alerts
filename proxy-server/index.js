const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (your Vercel app will call this)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'Bybit Proxy Server Running',
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint for Bybit API
app.all('/proxy/bybit/*', async (req, res) => {
  try {
    const bybitPath = req.params[0];
    const bybitUrl = `https://api.bybit.com/${bybitPath}`;
    
    console.log(`[Proxy] ${req.method} ${bybitUrl}`);
    
    // Forward the request to Bybit
    const response = await axios({
      method: req.method,
      url: bybitUrl,
      params: req.query,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': req.headers['x-forwarded-for'] || req.ip,
        // Forward authentication headers if present
        ...(req.headers['x-bapi-sign'] && { 'X-BAPI-SIGN': req.headers['x-bapi-sign'] }),
        ...(req.headers['x-bapi-api-key'] && { 'X-BAPI-API-KEY': req.headers['x-bapi-api-key'] }),
        ...(req.headers['x-bapi-timestamp'] && { 'X-BAPI-TIMESTAMP': req.headers['x-bapi-timestamp'] }),
        ...(req.headers['x-bapi-recv-window'] && { 'X-BAPI-RECV-WINDOW': req.headers['x-bapi-recv-window'] }),
      },
      timeout: 30000, // 30 seconds
    });
    
    console.log(`[Proxy] ✅ Success: ${response.status}`);
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('[Proxy] ❌ Error:', error.message);
    
    if (error.response) {
      // Bybit returned an error
      res.status(error.response.status).json(error.response.data);
    } else {
      // Network or other error
      res.status(500).json({ 
        error: 'Proxy Error', 
        message: error.message 
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bybit Proxy Server running on port ${PORT}`);
  console.log(`📍 Region: ${process.env.RAILWAY_REGION || 'unknown'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});