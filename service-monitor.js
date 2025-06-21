#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { URL } = require('url');

// Configuration
const SERVICE_URL = process.argv[2] || 'http://localhost:3000';
const COMMAND_TO_RUN = process.argv[3] || 'echo "Service is now available!"';
const PING_INTERVAL = 1000; // 5 seconds
const REQUEST_TIMEOUT = 60_000; // 3 seconds

console.log(`🔍 Monitoring service: ${SERVICE_URL}`);
console.log(`📋 Command to run when available: ${COMMAND_TO_RUN}`);
console.log(`⏱️  Ping interval: ${PING_INTERVAL}ms\n`);

function pingService(url) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                timeout: REQUEST_TIMEOUT,
                headers: {
                    'User-Agent': 'Service-Monitor/1.0'
                }
            };

            const req = client.request(options, (res) => {
                // Consider any HTTP response as "service is up"
                // You can modify this logic based on your needs
                resolve({
                    success: true,
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage
                });
            });

            req.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout'
                });
            });

            req.end();
        } catch (error) {
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                monitor()
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

async function monitor() {
    let attempts = 0;
    
    while (true) {
        attempts++;
        const timestamp = new Date().toISOString();
        
        console.log(`[${timestamp}] Attempt #${attempts} - Pinging service...`);
        
        const result = await pingService(SERVICE_URL);
        
        if (result.success) {
            console.log(`✅ [${timestamp}] Service is UP! (Status: ${result.statusCode} ${result.statusMessage})`);
            console.log(`🚀 Running command: ${COMMAND_TO_RUN}\n`);
            
            try {
                const commandResult = await runCommand(COMMAND_TO_RUN);
                console.log('📤 Command output:');
                if (commandResult.stdout) {
                    console.log(commandResult.stdout);
                }
                if (commandResult.stderr) {
                    console.error('stderr:', commandResult.stderr);
                }
                console.log('✅ Command executed successfully!');
            } catch (error) {
                console.error('❌ Command execution failed:');
                console.error('Error:', error.error.message);
                if (error.stderr) {
                    console.error('stderr:', error.stderr);
                }
            }
            
        } else {
            console.log(`❌ [${timestamp}] Service is DOWN (${result.error})`);
        }
        
        // Wait before next ping
        await new Promise(resolve => setTimeout(resolve, PING_INTERVAL));
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Monitoring stopped by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Monitoring terminated');
    process.exit(0);
});

// Show usage if no arguments provided
if (process.argv.length < 3) {
    console.log(`
Usage: node service-monitor.js <service-url> [command-to-run]

Examples:
  node service-monitor.js http://localhost:3000
  node service-monitor.js http://localhost:3000 "npm test"
  node service-monitor.js https://api.example.com/health "curl -X POST http://webhook.example.com"

The script will:
1. Continuously ping the specified service URL
2. When the service responds (any HTTP status), run the specified command
3. Exit after successfully running the command

Press Ctrl+C to stop monitoring.
`);
    process.exit(1);
}

// Start monitoring
monitor().catch(error => {
    console.error('❌ Monitoring failed:', error);
    monitor()
});

