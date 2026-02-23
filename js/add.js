// logging instance (use electron-log when available)
var log;
try {
    log = require('electron-log');
} catch (e) {
    log = console;
}

// attach event listeners after DOM is ready
function attachAddEventListeners() {
    const btn = document.getElementById("discoverLightsButton");
    const sel = document.getElementById("scanMethod");
    if (btn) btn.addEventListener("click", scanLights);
    if (sel) sel.addEventListener("change", checkMethod);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAddEventListeners);
} else {
    attachAddEventListeners();
}

// search for twled devices and add them
// controller to allow stopping scans
var scanController = {
    stop: false,
    bonjour: undefined
};
// default timeout for scan requests (ms)
scanController.timeout = 1200;

// promise wrapper for checkTWled
function checkTWledPromise(ip) {
    return new Promise((resolve) => {
        checkTWled(ip, function (twled) {
            resolve(twled);
        });
    });
}

async function scan(bonjour) {
    const method = document.getElementById("scanMethod").value;
    if (method === "bruteforce") {
        log.verbose("Scan method: bruteforce");
        scanController.stop = false;
        // get IP of device
        const os = require('os');
        const interfaces = os.networkInterfaces();
        const addresses = [];
        log.silly("Interfaces:");
        log.silly(interfaces);
        for (const k in interfaces) {
            for (const k2 in interfaces[k]) {
                const address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }
        log.debug("Local addresses:");
        log.debug(addresses);

        // generate array with all possible ips of networks (deduped)
        const ips = new Set();
        for (let i = 0; i < addresses.length; i++) {
            const element = addresses[i];
            const lastDot = element.lastIndexOf('.');
            if (lastDot === -1) continue;
            const subnet = element.slice(0, lastDot + 1);
            for (let host = 1; host < 255; host++) {
                ips.add(subnet + host);
            }
        }

        const allIps = Array.from(ips);
        log.silly("All possible ips of network:");
        log.silly(allIps);

        // concurrency limited scanning
        const concurrency = 60;
        let index = 0;

        async function worker() {
            while (!scanController.stop && index < allIps.length) {
                const current = allIps[index++];
                try {
                    const twled = await checkTWledPromise(current);
                    if (twled !== false && twled !== true) {
                        addLight(twled.name, twled.ip);
                    }
                } catch (e) {
                    // ignore individual errors
                }
            }
        }

        const workers = [];
        for (let w = 0; w < concurrency; w++) {
            workers.push(worker());
        }

        await Promise.all(workers);
        log.verbose('Bruteforce scan finished');
        document.getElementById("discoverLightsButton").innerText = "Discover lights...";
        document.getElementById("loader").style.display = "none";
    }

    if (method === "bonjour") {
        log.verbose("Scan method: bonjour");
        scanController.stop = false;
        scanController.bonjour = bonjour;

        // listen for http services; give it some time and then stop
        const browser = bonjour.find({ type: "http" }, function (service) {
            if (scanController.stop) return;
            // prefer IPv4 address
            const addr = (service.addresses || [])[0] || service.host;
            if (!addr) return;
            log.debug("bonjour found IP: " + addr + " (name: " + (service.name || '') + ")");
            console.log(`[bonjour] found service at ${addr}, calling checkTWled...`);
            checkTWled(addr, function (twled) {
                console.log(`[bonjour callback] checkTWled(${addr}) returned:`, twled);
                if (twled && twled.ip) {
                    // Valid WLED/TWLED device found
                    if (checkIP(twled.ip) === false) {
                        // New device, add it
                        console.log(`[bonjour] adding light: ${twled.name} at ${twled.ip}`);
                        addLight(twled.name, twled.ip);
                    } else {
                        // Device already in list
                        console.log(`[bonjour] device ${twled.ip} already in list, skipping`);
                    }
                } else {
                    console.log(`[bonjour] device ${addr} is not a valid TWLED device`);
                }
            });
        });

        // auto-stop discovery after 12 seconds to avoid running forever
        setTimeout(() => {
            if (!scanController.stop) {
                try {
                    if (scanController.bonjour && typeof scanController.bonjour.destroy === 'function') {
                        scanController.bonjour.destroy();
                    }
                } catch (e) { }
                document.getElementById("discoverLightsButton").innerText = "Discover lights...";
                document.getElementById("loader").style.display = "none";
                log.verbose('Bonjour scan timeout — stopped');
            }
        }, 12000);
    }

    if (method === "ssdp") {
        log.verbose("Scan method: ssdp");
        scanController.stop = false;

        let dgram;
        try {
            dgram = require('dgram');
        } catch (e) {
            log.error('dgram not available: cannot run SSDP');
            return;
        }

        const socket = dgram.createSocket('udp4');
        scanController.socket = socket;
        const message = Buffer.from(
            'M-SEARCH * HTTP/1.1\r\n' +
            'HOST: 239.255.255.250:1900\r\n' +
            'MAN: "ssdp:discover"\r\n' +
            'MX: 3\r\n' +
            'ST: ssdp:all\r\n' +
            '\r\n'
        );

        socket.on('error', (err) => {
            log.error('SSDP socket error', err);
            try { socket.close(); } catch (e) { }
        });

        socket.on('message', (msg, rinfo) => {
            if (scanController.stop) return;
            const str = msg.toString();
            // parse headers
            const lines = str.split(/\r?\n/);
            const headers = {};
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const idx = line.indexOf(':');
                if (idx > 0) {
                    const key = line.slice(0, idx).trim().toUpperCase();
                    const val = line.slice(idx + 1).trim();
                    headers[key] = val;
                }
            }
            const location = headers['LOCATION'] || headers['LOCATION:'];
            const usn = headers['USN'];
            if (location) {
                let host;
                try {
                    const u = new URL(location);
                    host = u.hostname;
                } catch (e) {
                    // fallback to rinfo address
                    host = rinfo.address;
                }
                log.debug('SSDP response, probing location URL: ' + location + ' (host: ' + host + ')');
                // first try the full LOCATION URL (some devices expose API under that path)
                probeUrl(location).then(result => {
                    if (result && result.ip) {
                        addLight(result.name || result.ip, result.ip);
                    } else {
                        // fallback to probing host directly
                        checkTWled(host, function (twled) {
                            if (twled !== false && twled !== true) {
                                addLight(twled.name, twled.ip);
                            } else {
                                // final fallback: try common ports on the host
                                probeHostPorts(host).then(found => {
                                    if (found && found.ip) {
                                        addLight(found.name || found.ip, found.ip);
                                    }
                                });
                            }
                        });
                    }
                }).catch(() => {
                    // on error fallback to host probing
                    checkTWled(host, function (twled) {
                        if (twled !== false && twled !== true) {
                            addLight(twled.name, twled.ip);
                        } else {
                            probeHostPorts(host).then(found => {
                                if (found && found.ip) {
                                    addLight(found.name || found.ip, found.ip);
                                }
                            });
                        }
                    });
                });
            } else {
                // try rinfo address anyway
                checkTWled(rinfo.address, function (twled) {
                    if (twled !== false && twled !== true) {
                        addLight(twled.name, twled.ip);
                    }
                });
            }
        });

        // Send M-SEARCH a few times to increase chance of discovery
        socket.bind(() => {
            socket.setBroadcast(true);
            socket.setMulticastTTL(2);
            try {
                socket.send(message, 0, message.length, 1900, '239.255.255.250');
                setTimeout(() => socket.send(message, 0, message.length, 1900, '239.255.255.250'), 400);
                setTimeout(() => socket.send(message, 0, message.length, 1900, '239.255.255.250'), 800);
            } catch (e) {
                log.error('SSDP send error', e);
            }
        });

        // auto-stop SSDP after 10 seconds
        setTimeout(() => {
            scanController.stop = true;
            try { socket.close(); } catch (e) { }
            document.getElementById("discoverLightsButton").innerText = "Discover lights...";
            document.getElementById("loader").style.display = "none";
            log.verbose('SSDP scan finished');
        }, 10000);
    }
}


// ...existing code...

// LocalNet (Windows gateway subnet scanner)
async function scanLocalNet() {
    scanController.stop = false;
    
    try {
        const { execSync } = require("child_process");
        
        // Parse ipconfig to get gateway and subnet mask
        const ipconfig = execSync("ipconfig", { encoding: "utf-8" });
        const subnets = parseIpconfigGateways(ipconfig);
        
        if (subnets.length === 0) {
            log.verbose("No gateway found via ipconfig. Falling back to brute-force...");
            M.toast({ html: 'No gateway found, falling back to brute-force' });
            return;
        }
        
        log.verbose(`LocalNet: Found ${subnets.length} subnet(s): ${subnets.map(s => s.subnet).join(", ")}`);
        M.toast({ html: `Found ${subnets.length} subnet(s) to scan` });
        
        let foundCount = 0;
        
        for (const { subnet, mask } of subnets) {
            if (scanController.stop) break;
            
            const hostList = generateSubnetHosts(subnet, mask);
            log.verbose(`LocalNet: Scanning ${hostList.length} hosts in ${subnet}/${maskToCIDR(mask)}...`);
            M.toast({ html: `Scanning ${hostList.length} hosts in ${subnet}/${maskToCIDR(mask)}...` });

            const concurrency = 60;
            const workers = [];
            let hostIndex = 0;
            
            for (let i = 0; i < concurrency; i++) {
                workers.push(
                    (async () => {
                        while (hostIndex < hostList.length && !scanController.stop) {
                            const host = hostList[hostIndex++];
                            try {
                                const device = await checkTWledPromise(host);
                                if (device && device !== false && device !== true) {
                                    foundCount++;
                                    log.verbose(`LocalNet: Found device at ${host}`);
                                    addLight(device.name, device.ip);
                                    
                                }
                            } catch (e) {
                                // Host unreachable or not TWLED, skip
                            }
                        }
                    })()
                );
            }
            
            await Promise.all(workers);
        }
        
        log.verbose(`LocalNet scan completed. Found ${foundCount} device(s).`);
        M.toast({ html: `LocalNet scan completed. Found ${foundCount} device(s)` });
    } catch (e) {
        log.error(`LocalNet scan error: ${e.message}`);
        M.toast({ html: `LocalNet scan error: ${e.message}` });
    } finally {
        document.getElementById("discoverLightsButton").innerText = "Discover lights...";
        document.getElementById("loader").style.display = "none";
        scanController.stop = false;
    }
}

// Parse ipconfig output and extract gateway + subnet mask
function parseIpconfigGateways(ipconfig) {
    const subnets = [];
    const lines = ipconfig.split("\n");
    let currentGateway = null;
    let currentMask = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for Default Gateway
        if (line.includes("Default Gateway") && line.includes(":")) {
            const gw = line.split(":")[1]?.trim();
            if (gw && gw !== "") {
                currentGateway = gw;
            }
        }
        
        // Look for Subnet Mask
        if (line.includes("Subnet Mask") && line.includes(":")) {
            const mask = line.split(":")[1]?.trim();
            if (mask && mask !== "") {
                currentMask = mask;
            }
        }
        
        // If we have both gateway and mask, extract subnet and save
        if (currentGateway && currentMask) {
            const subnet = getSubnetFromGateway(currentGateway, currentMask);
            subnets.push({ subnet, mask: currentMask });
            currentGateway = null;
            currentMask = null;
        }
    }
    
    // Deduplicate by subnet
    const seen = new Set();
    return subnets.filter(s => {
        if (seen.has(s.subnet)) return false;
        seen.add(s.subnet);
        return true;
    });
}

// Calculate subnet address from gateway IP and subnet mask
function getSubnetFromGateway(gateway, mask) {
    const gwOctets = gateway.split(".").map(Number);
    const maskOctets = mask.split(".").map(Number);
    
    const subnet = gwOctets.map((octet, i) => octet & maskOctets[i]).join(".");
    return subnet;
}

// Convert subnet mask (e.g., "255.255.255.0") to CIDR (e.g., "24")
function maskToCIDR(mask) {
    const octets = mask.split(".").map(Number);
    let cidr = 0;
    for (const octet of octets) {
        for (let i = 7; i >= 0; i--) {
            if ((octet >> i) & 1) cidr++;
            else return cidr;
        }
    }
    return cidr;
}

// Logging helper (use log singleton)
function verbose(msg) {
    if (typeof log !== 'undefined') {
        log.verbose(msg);
    } else {
        console.log(msg);
    }
}

// Generate all usable host IPs in a subnet
function generateSubnetHosts(subnet, mask) {
    const octets = subnet.split(".").map(Number);
    const maskOctets = mask.split(".").map(Number);
    
    // Find the last octet that's not 255 in the mask (where hosts vary)
    let varyingOctet = 3;
    for (let i = 3; i >= 0; i--) {
        if (maskOctets[i] !== 255) {
            varyingOctet = i;
            break;
        }
    }
    
    const hosts = [];
    
    if (varyingOctet === 3) {
        // /24 or larger — vary last octet
        const firstThree = octets.slice(0, 3).join(".");
        const start = (maskOctets[3] === 0) ? 0 : 1;  // Skip 0 if not /0
        const end = (maskOctets[3] === 0) ? 255 : 254;  // Skip 255 (broadcast)
        
        for (let i = start; i <= end; i++) {
            hosts.push(`${firstThree}.${i}`);
        }
    } else if (varyingOctet === 2) {
        // /16 — vary last two octets
        const firstTwo = octets.slice(0, 2).join(".");
        for (let i = 0; i <= 255; i++) {
            for (let j = (i === 0 ? 1 : 0); j <= (i === 255 ? 254 : 255); j++) {
                hosts.push(`${firstTwo}.${i}.${j}`);
            }
        }
    } else {
        // /8 or larger — too many hosts, fall back to sample or brute-force
        verbose("LocalNet: Subnet too large (/8 or bigger), using sampling...");
        const firstOne = octets[0];
        for (let i = 1; i <= 10; i++) {  // Sample first 10.x.x.x subnet
            for (let j = 1; j <= 254; j++) {
                hosts.push(`${firstOne}.${i}.1.${j}`);
            }
        }
    }
    
    return hosts;
}


// checks if a specific device is a twled device
function checkTWled(ip, callback) {
    // Try HTTP first (local devices rarely use HTTPS), then fallback to HTTPS
    const endpoints = [
        'http://' + ip + '/json/info',
        'http://' + ip + '/json',
        'http://' + ip + ':80/json/info',
        'http://' + ip + ':80/json',
        'https://' + ip + '/json/info',
        'https://' + ip + '/json',
        'https://' + ip + ':443/json/info',
        'https://' + ip + ':443/json'
    ];
    const timeout = (scanController && scanController.timeout) || 800; // shorter timeout per endpoint

    function tryEndpoint(idx) {
        if (idx >= endpoints.length) {
            console.log(`[checkTWled ${ip}] all endpoints exhausted, device not found`);
            callback(false);
            return;
        }
        const url = endpoints[idx];
        console.log(`[checkTWled ${ip}] trying endpoint ${idx + 1}/${endpoints.length}: ${url}`);
        let xhr = new XMLHttpRequest();
        try {
            xhr.open('GET', url, true);
        } catch (e) {
            console.log(`[checkTWled ${ip}] ${url} invalid URL: ${e.message}`);
            // likely invalid URL (e.g., protocol not supported), try next
            tryEndpoint(idx + 1);
            return;
        }
        xhr.timeout = timeout;
        xhr.onload = function () {
            try {
                var json = JSON.parse(xhr.response);
            } catch (e) {
                var json = { "brand": null };
            }
            // Flexible detection: check for brand="TWLED" OR presence of WLED-like structure (state, info fields)
            const isTWLED = json && json.brand === "TWLED";
            const isWLED = json && (json.state || json.info || json.effects);
            console.log(`[checkTWled ${ip}] ${url}: isTWLED=${isTWLED}, isWLED=${isWLED}, json=`, json);
            if (isTWLED || isWLED) {
                log.verbose("TWLED/WLED " + ip + " found via " + url)
                let name = json.name || ip;
                let light = {
                    name: name,
                    ip: ip,
                    online: true
                };
                if (checkIP(ip) === false) {
                    // Device doesn't exist yet
                    M.toast({ html: 'Found ' + name });
                }
                // Always return the device object (whether new or existing)
                callback(light);
            } else {
                // try next endpoint
                tryEndpoint(idx + 1);
            }
        };
        xhr.onerror = function () {
            console.log(`[checkTWled ${ip}] ${url} error (network/SSL), trying next`);
            tryEndpoint(idx + 1);
        };
        xhr.ontimeout = function () {
            console.log(`[checkTWled ${ip}] ${url} timeout, trying next`);
            tryEndpoint(idx + 1);
        };
        try {
            xhr.send();
        } catch (e) {
            tryEndpoint(idx + 1);
        }
    }

    tryEndpoint(0);
}

// Probe an arbitrary URL (full URL) for TWLED response
function probeUrl(url) {
    return new Promise((resolve) => {
        let xhr = new XMLHttpRequest();
        try {
            xhr.open('GET', url, true);
        } catch (e) {
            resolve(false);
            return;
        }
        xhr.timeout = (scanController && scanController.timeout) || 2000;
        xhr.onload = function () {
            try {
                var json = JSON.parse(xhr.response);
            } catch (e) {
                resolve(false);
                return;
            }
            if (json && json.brand === 'TWLED') {
                const light = { name: json.name || url, ip: (json.ip || (new URL(url)).hostname) };
                resolve(light);
            } else {
                resolve(false);
            }
        };
        xhr.onerror = function () { resolve(false); };
        xhr.ontimeout = function () { resolve(false); };
        try { xhr.send(); } catch (e) { resolve(false); }
    });
}

// Probe a host across a list of common ports and endpoints. Returns a Promise resolving to found light or false.
function probeHostPorts(host) {
    const defaultPorts = [80, 8080, 8000, 81, 443];
    const templates = [
        'http://{host}:{port}/json/info',
        'http://{host}:{port}/json',
        'https://{host}:{port}/json/info',
        'https://{host}:{port}/json'
    ];
    return new Promise(async (resolve) => {
        for (let p = 0; p < defaultPorts.length; p++) {
            const port = defaultPorts[p];
            for (let t = 0; t < templates.length; t++) {
                const url = templates[t].replace('{host}', host).replace('{port}', port);
                try {
                    const res = await probeUrl(url);
                    if (res && res.ip) {
                        resolve(res);
                        return;
                    }
                } catch (e) {
                    // continue
                }
            }
        }
        resolve(false);
    });
}

// check if a device with the ip already exists
function checkIP(targetIp) {
    function comparison(device) {
        return device.ip == targetIp;
    }
    let lights = JSON.parse(localStorage.getItem("lights"));
    if (typeof lights.find(comparison) !== "undefined") {
        return true;
    } else {
        return false;
    }
}

// scan for twled devices
function scanLights() {
    const method = document.getElementById("scanMethod").value;
    let button = document.getElementById("discoverLightsButton");
    const isScanning = button.innerText === "STOP DISCOVERY" || button.innerText === "Stop discovery";
    
        // quick console/log entry to verify clicks make it here
        console.log('scanLights clicked', { method: method, isScanning: isScanning });

    if (method === "bonjour") { // bonjour
        if (isScanning) {
            // stop active bonjour scan
            scanController.stop = true;
            try {
                if (scanController.bonjour && typeof scanController.bonjour.destroy === 'function') {
                    scanController.bonjour.destroy();
                }
            } catch (e) { }
            button.innerText = "Discover lights...";
            // Hide loader
            document.getElementById("loader").style.display = "none";
        } else {
            scanController.stop = false;
            scanController.bonjour = require('bonjour')();
            button.innerText = "Stop discovery";
            // Show loader
            document.getElementById("loader").style.display = "block";
            scan(scanController.bonjour);
        }
    }
    else if (method === "bruteforce") { // brute-force
        if (isScanning) {
            scanController.stop = true;
            button.innerText = "Discover lights...";
            document.getElementById("loader").style.display = "none";
        } else {
            // start bruteforce scan
            document.getElementById("loader").style.display = "block";
            button.innerText = "Stop discovery";
            scanController.stop = false;
            scan();
        }
    }
    else if (method === "ssdp") { // ssdp
        if (isScanning) {
            scanController.stop = true;
            try {
                if (scanController.socket && typeof scanController.socket.close === 'function') {
                    scanController.socket.close();
                }
            } catch (e) { }
            button.innerText = "Discover lights...";
            document.getElementById("loader").style.display = "none";
        } else {
            button.innerText = "Stop discovery";
            document.getElementById("loader").style.display = "block";
            scan();
        }
    }
    else if (method === "localnet") { // localnet
        if (isScanning) {
            scanController.stop = true;
            button.innerText = "Discover lights...";
            document.getElementById("loader").style.display = "none";
        } else {
            scanController.stop = false;
            button.innerText = "Stop discovery";
            document.getElementById("loader").style.display = "block";
            scanLocalNet();
        }
    }
}

// if method changes the current scan will abort
function checkMethod() {
    // stop any active scan
    scanController.stop = true;
    try {
        if (scanController.bonjour && typeof scanController.bonjour.destroy === 'function') {
            scanController.bonjour.destroy();
        }
    } catch (e) { }
    let button = document.getElementById("discoverLightsButton");
    button.innerText = "Discover lights...";
    document.getElementById("loader").style.display = "none";
}

// adds a light and save it to localstorge
function addLightManually() {
    let ipInput = (document.getElementById("ip").value || "").trim();
    let urlInput = "";
    const urlField = document.getElementById("manualUrl");
    if (urlField) {
        urlInput = (urlField.value || "").trim();
    }

    let target = ipInput;

    if (!target && urlInput) {
        try {
            const normalized = /^https?:\/\//i.test(urlInput) ? urlInput : `http://${urlInput}`;
            const parsed = new URL(normalized);
            target = parsed.hostname;
            if (parsed.port) {
                target += `:${parsed.port}`;
            }
        } catch (error) {
            M.toast({ html: 'Invalid URL. Please provide a valid http(s) address.' });
            return;
        }
    }

    if (!target) {
        M.toast({ html: 'Please enter an IP address or URL.' });
        return;
    }

    log.verbose("Add " + target + " light manually");

    const handleAddResult = (result, successMessage) => {
        if (result && result.added) {
            if (successMessage) {
                M.toast({ html: successMessage });
            }
            location.href = "index.html";
        }
    };

    checkTWled(target, function (twled) {
        if (twled !== false && twled !== true) {
            const result = addLight(twled.name, twled.ip);
            handleAddResult(result);
        } else if (twled === true) {
            log.warn("Light hasn't been added, because device already exists.");
            M.toast({ html: 'Error! Device already exists.' });
        } else {
            // Try port probes as a fallback
            probeHostPorts(target).then(found => {
                if (found && found.ip) {
                    const result = addLight(found.name || found.ip, found.ip);
                    handleAddResult(result);
                } else {
                    log.warn("Device unreachable; saving offline entry.");
                    const result = addLight(target, target, { online: false });
                    handleAddResult(result, 'Device saved as offline.');
                }
            });
        }
    });

}


// saves a light to local storage
function addLight(name, ip, options = {}) {
    let lights = JSON.parse(localStorage.getItem("lights")) || [];
    const existing = lights.find((light) => light.ip === ip);
    if (existing) {
        const msg = `this device ${ip} is already added and remaned as ${existing.name}`;
        log.warn(msg);
        try {
            M.toast({ html: msg });
        } catch (e) {
            console.warn(msg);
        }
        return { light: existing, added: false };
    }

    let light = {
        name: name,
        ip: ip,
        online: typeof options.online === "boolean" ? options.online : true,
        on: typeof options.on === "boolean" ? options.on : false,
        version: options.version || "unknown",
        autostart: typeof options.autostart === "boolean" ? options.autostart : false
    };
    log.verbose("Add light and save to local storage");
    log.debug(light);
    lights.push(light);
    const json = JSON.stringify(lights);
    localStorage.setItem("lights", json);
    return { light: light, added: true };
}