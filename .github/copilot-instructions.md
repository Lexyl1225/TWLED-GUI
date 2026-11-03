# TWLED-GUI AI Coding Instructions

## Repo Summary

TWLED-GUI is a cross-platform Electron desktop app for managing WLED smart light devices. The app runs on Windows, macOS, and Linux, with a vanilla JavaScript renderer and CommonJS module system.

**Key characteristics**: 
- Entry: `main.js` (main process)
- UI: static HTML + `js/` renderer scripts (no frameworks)
- State: `localStorage` for persistence
- Device comms: HTTP requests to WLED devices

## Architecture Overview

### Main Process (`main.js`)
- Window lifecycle & initialization
- Tray icon creation (platform-specific: `icon.png` Windows/Linux, `trayIcon.png` macOS)
- Single-instance lock enforcement
- Autostart/hidden mode via `--hidden` and `--dev` CLI flags
- Settings loaded from renderer `localStorage` at app ready

### Renderer Context (HTML + JS)
- **`index.html`**: device list homepage
- **`twled-viewer.html`**: embeds WLED web UI (`<iframe src="http://<ip>">`)
- **`add.html` + `js/add.js`**: device discovery (Bonjour/brute-force)
- **`settings.html` + `js/settings.js`**: app preferences
- **`autostart.html` + `js/autostart.js`**: hidden worker window (periodic sync)
- **`delete.html`**: device removal UI

### Data Flow

```
App startup
  ↓
main.js loads window + calls loadSettings()
  ↓
Reads localStorage["settings"] via JS execution
  ↓
createWorker() if autostart enabled
  ↓
createTray() if tray enabled in settings
```

**Device polling cycle** (every 10s):

```
getStatus() → XHR GET http://<ip>/json 
  → lights[i].online = true/false, lights[i].on = state.on
  → localStorage.lights updated
  → showLights() re-renders UI
```

## Critical localStorage Keys

| Key | Type | Example | Used In |
|-----|------|---------|---------|
| `lights` | array | `[{name, ip, on, online, version}]` | script.js |
| `twledUiCfg` | object | `{theme: {base: "dark"}}` | script.js |
| `locIp` | string | `"192.168.1.100"` | twled-viewer.html |
| `locVersion` | string | `"0.13.0"` | twled-viewer.html |
| `pcm` | boolean | `true` | (UI default state) |
| `settings` | array | `[{id, name, value}, ...]` | main.js, settings.js |
| `remindLaterTime` | timestamp | `1700000000000` | updater.js |

**⚠️ Important**: `settings` array order is positional; `settings[1].value` = tray, `settings[2].value` = worker disabled

## Key Files & Responsibilities

| File | Size | Key Functions |
|------|------|---|
| `main.js` | ~300 lines | `createWindow()`, `loadSettings()`, `createWorker()`, `createTray()`, `checkWorker()`, `checkTray()` |
| `js/script.js` | ~300 lines | `showLights()`, `getStatus()`, `toggleLight()`, `goToTWled()`, `sync()` (polling loop) |
| `js/add.js` | ~750 lines | `scan()`, `checkTWled()`, Bonjour discovery + IP brute-force |
| `js/viewer.js` | ~3 lines | embeds WLED iframe (very simple) |
| `js/autostart.js` | ~20 lines | background worker for periodic sync |
| `css/style.css` | ~120 lines | dark theme base + `.icon.on` for LED state |

## DOM & Event Patterns

### innerHTML String Building
Functions like `showLights()` generate full HTML strings and write to `innerHTML`. **Do not refactor to use frameworks** without updating all dependent code:

```javascript
// Pattern: preserve inline onclick with index parameter
txt += `<img onclick="toggleLight(${index});" ...>`
// Pattern: DOM IDs use index for state correlation
txt += `<img id="img${index}" ...>`
```

### Event Guard Pattern
The `imgClicked` flag in `script.js` prevents cascading calls:
- User clicks power icon → `toggleLight()` sets `imgClicked = true`
- While XHR in flight, clicking the `<div>` won't trigger `goToTWled()`
- XHR completes → `imgClicked = false`

### Theme Toggle
Light/dark mode uses CSS class switching + inline styles:
```javascript
if (ui.theme.base == "light") {
  txt += `<img class="darkicon ...>`;  // different style
}
```
CSS defines `.icon` (dark bg) and `.darkicon` (light bg).

## External Dependencies & Integration

### Bonjour/mDNS (`bonjour`, `multicast-dns`)
- Used in `add.js` for service discovery
- Falls back to IP brute-force if service discovery fails
- Scan methods configurable via `<select id="scanMethod">` in `add.html`

### Auto-launch (`auto-launch`)
- Enables system autostart on Windows/macOS/Linux
- Triggered if `settings[2].value === false` (worker disabled = autostart enabled)

### Electron-log
- Available in main process
- In renderer: wrapped with fallback to `console` (see `add.js` pattern)
- Log level toggles at top of `main.js`

### Electron-builder
- Config in `package.json` `build` section
- Icons: `build/icon.png` (main), `build/trayIcon.png` (tray, macOS only)
- Extra files (icons, Python scripts) listed in `extraFiles`

## Build & Dev Workflows

```bash
# Development
npm start                           # dev mode, shows menu
npm run autostart                   # hidden window, test autostart

# Windows
npm run "build windows"             # NSIS installer (configurable)
npm run "build windows oneclick"    # one-click, no dir selection
npm run "build windows msi"         # MSI alternative

# macOS
npm run "build mac"                 # .dmg

# Linux
npm run "build linux"               # default (deb on Debian)
npm run "build linux deb"           # .deb package
npm run "build linux rpm"           # .rpm package
npm run "build linux snap"          # snap
```

## Common Modification Tasks

### Change Device Polling Interval
File: `js/script.js`, function `sync()`
```javascript
setTimeout(sync, 10000);  // currently 10 seconds
```

### Add a Device Property
1. Update `lights` array structure in `script.js` initialization
2. Fetch new field in `getStatus()` XHR handler: `lights[index].newField = json.path.to.field`
3. Display in `showLights()` template string
4. Save to localStorage after mutation

### Modify Tray/Autostart Behavior
File: `main.js`, functions `checkTray()` and `checkWorker()`
- Reads `settings[1].value` (tray) and `settings[2].value` (worker disabled)
- Respects `autostarted` flag; tray behavior differs when hidden

### Add UI Theme
File: `js/script.js` + `css/style.css`
1. Extend `twledUiCfg` object structure
2. Add toggle in `settings.html`
3. Apply conditional CSS classes in `showLights()`

## Gotchas & Warnings

1. **Renderer has Node access**: `require('electron')` works directly (no preload needed). See `script.js` for `openRepositorie()` example.

2. **innerHTML clears listeners**: Inline `onclick` attributes are the pattern here. If converting to delegated listeners, update ALL pages consistently.

3. **Settings array is positional**: `settings[0]`, `settings[1]`, `settings[2]` map to specific toggles. Changing order breaks `main.js` checks.

4. **Device IP brute-force**: `add.js` scans `/json` endpoint on IPs within subnet. This is slow but reliable if Bonjour fails. Timeout is `scanController.timeout = 1200` ms per IP.

5. **XHR error handling**: Failed requests set `lights[index].online = false` immediately. No retry logic—next `getStatus()` cycle will retry.

6. **WLED endpoint contracts**: 
   - `GET /json` → returns `{state: {on: bool}, info: {ver: string}}`
   - `GET /win&T=2` → toggles power (hardcoded endpoint, no status return)

7. **localStorage persistence**: All state survives app restarts. Clearing localStorage requires explicit user action in settings.

## Testing & Verification Strategy

### Local Testing
1. `npm start` to launch dev mode
2. Use DevTools console to add fake device: `localStorage.lights = JSON.stringify([{name:"Test", ip:"192.168.1.50", on:false, online:true, version:"0.13"}])`
3. Verify polling works: watch console XHR requests every 10s

### Device Mocking
Start a Node HTTP server serving WLED JSON:
```javascript
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    state: {on: true},
    info: {ver: "0.13.0"}
  }));
}).listen(3000);
```
Then add `localhost:3000` (or actual IP) in app.

### Autostart Testing
1. `npm run autostart` → app launches hidden, check tray icon appears
2. Verify `autostart.html` window loads (Chrome DevTools can attach)
3. Check periodic sync requests to devices

### Packaging Verification
- Test each build script on target OS
- Verify icons appear in installer (check `build/` folder)
- For Windows: test both oneClick and directory-selection modes

## When to Reference What

- **Need to add a device property?** → Understand flow in `getStatus()` + `showLights()`
- **Settings/preferences UI?** → Check `settings.html` + `settings.js`
- **Tray or autostart broken?** → Debug `main.js` lifecycle + `loadSettings()` order
- **Discovery not finding devices?** → Inspect `add.js` scan methods + network logs
- **Device control (power toggle)?** → Follow `toggleLight()` → `getStatus()` -> `showLights()` chain
