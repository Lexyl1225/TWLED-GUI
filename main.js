import { app, BrowserWindow, Menu, Tray, session, ipcMain, net, shell } from 'electron';
import { join, dirname, basename, extname } from 'path';
import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync, copyFileSync, chmodSync } from 'fs';
import { spawn } from 'child_process';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import log from 'electron-log';
const { initialize, transports, info, debug, verbose } = log;

initialize();

/* LOG LEVEL */
// log.transports.console.level = "error";
// log.transports.file.level = "error";
// log.transports.console.level = "warn";
// log.transports.file.level = "warn";
// log.transports.console.level = "info";
// log.transports.file.level = "info";
// log.transports.console.level = "verbose";
// log.transports.file.level = "verbose";
 transports.console.level = "debug";
 transports.file.level = "debug";
// log.transports.console.level = "silly";
// log.transports.file.level = "silly";

info('TWLED-GUI started');

debug("Start arguments:");
debug(process.argv);

const gotTheLock = app.requestSingleInstanceLock()
const autostarted = process.argv.indexOf('--hidden') !== -1;
const dev = process.argv.indexOf('--dev') !== -1;
const iconDir = getIconDir();
debug("iconDir: " + iconDir);

var win;
var tray;
var settings;

// Create the browser window.
function createWindow() {
  debug("Create browser window");
  win = new BrowserWindow({
    width: 1263,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // and load the login.html of the app.
  win.loadFile('login.html')

  // The device UI runs inside an iframe in twled-viewer.html. After a firmware update,
  // WLED's "Rebooting..." page redirects with top.location.href="/", which would replace
  // the whole app window (app bar with logo, IP/name and Logout disappears).
  // Keep the app page and redirect that navigation into the iframe instead.
  const keepDeviceInFrame = (event, url) => {
    if (!/^https?:\/\//i.test(url)) return; // app's own file:// pages navigate normally
    debug("Redirecting top-level navigation into device frame: " + url);
    event.preventDefault();
    win.webContents.executeJavaScript(
      'if (window.twledFrameNavigate) { window.twledFrameNavigate(' + JSON.stringify(url) + '); true } else { false }'
    ).then(handled => {
      // not on the viewer page: open the viewer for that device instead of the raw device page
      if (!handled) {
        const host = new URL(url).host;
        win.webContents.executeJavaScript('localStorage.setItem("locIp", ' + JSON.stringify(host) + ');')
          .then(() => win.loadFile('twled-viewer.html'));
      }
    }).catch(err => debug("Frame redirect failed: " + err));
  };
  win.webContents.on('will-navigate', keepDeviceInFrame);

  // remove menubar
  if (!dev) {
    win.removeMenu()
  }

  // Open the DevTools.
  // win.webContents.openDevTools()

  // check if app was autostarted
  if (autostarted) {
    verbose('App is started by AutoLaunch');
  }
  else {
    verbose('App is started by User');
    win.once('ready-to-show', () => {
      win.show()
    })
  }
}

// create hidden worker window
function createWorker() {
  debug("Create autostart worker window");
  const workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  // and load the autostart.html
  workerWindow.loadFile('autostart.html');
}

// tray
function createTray() {
  debug("Create tray icon");
  let iconFile;
  let iconPath;
  // tray icon for macOS
  if (process.platform === 'darwin') {
    iconFile = "trayIcon.png";
  } else {
    iconFile = "icon.png";
  }
  iconPath = join(iconDir, iconFile);
  debug("Tray icon path: " + iconPath);
  tray = new Tray(iconPath)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open', click: function () {
        win.show();
      }
    },
    {
      label: 'Hide', click: function () {
        win.hide();
      }
    },
    {
      label: 'Close', click: function () {
        debug("Close window via tray");
        win.close();
      }
    },
  ])
  tray.setToolTip('TWLED')
  tray.setContextMenu(contextMenu)

  tray.on('click', function () {
    win.show();
  });
}

// read settings from localstorage
function loadSettings() {
  debug("Load settings from localstorage");
  win.webContents.executeJavaScript('localStorage.getItem("settings");').then(result => {
    settings = JSON.parse(result);
    debug("Settings:");
    debug(settings);
    checkWorker();
    checkTray();
  });
}

function checkWorker() {
  if (autostarted) {
    createWorker();
  } else {
    if (settings !== null) {
      // start worker only if enabled
      if (!settings[2].value) {
        createWorker();
      }
    }
  }
}

function checkTray() {
  if (autostarted) {
    createTray();
  } else {
    if (settings !== null) {
      // show tray only if enabled
      if (settings[1].value) {
        createTray();
      }
    }
  }
}

function getIconDir() {
  const installPath = dirname(app.getPath("exe"));
  debug("installPath: " + installPath);
  let dir;
  if (dev) {
    dir = "build/";
  } else if (process.platform === 'darwin') {
    dir = join(installPath, "../", "build");
  }
  else {
    dir = join(installPath, "build");
  }
  return dir;
}

/* UPDATER
   The renderer (js/updater.js) finds the release asset and calls "update:start".
   Download and installation both run here, so the install still happens if the
   window navigates away (e.g. idle logout) while the download is running. */
const updateDir = () => join(app.getPath('temp'), 'twled-gui-update');
let updateAbort = null;

function sendToRenderer(sender, channel, payload) {
  if (sender && !sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

async function downloadUpdate(sender, asset) {
  const name = basename(String((asset && asset.name) || ''));
  const url = String((asset && asset.url) || '');
  // only accept release assets served by GitHub
  if (!name || !/^https:\/\/github\.com\//i.test(url)) {
    throw new Error('Invalid update file');
  }
  mkdirSync(updateDir(), { recursive: true });
  const filePath = join(updateDir(), name);
  const partPath = filePath + '.part';

  updateAbort = new AbortController();
  try {
    info('Downloading update: ' + url);
    const response = await net.fetch(url, { signal: updateAbort.signal });
    if (!response.ok || !response.body) {
      throw new Error('Download failed (HTTP ' + response.status + ')');
    }
    const total = parseInt(response.headers.get('content-length') || '0', 10) || asset.size || 0;
    let received = 0;
    let lastSent = 0;
    const progress = new Transform({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        const now = Date.now();
        if (now - lastSent > 100) {
          lastSent = now;
          sendToRenderer(sender, 'update:progress', { received, total });
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partPath), { signal: updateAbort.signal });
    if (total && received !== total) {
      throw new Error('Download incomplete (' + received + ' of ' + total + ' bytes)');
    }
    sendToRenderer(sender, 'update:progress', { received, total: total || received });
    rmSync(filePath, { force: true });
    renameSync(partPath, filePath);
    info('Update downloaded to ' + filePath);
    return filePath;
  } catch (err) {
    rmSync(partPath, { force: true });
    if (err && err.name === 'AbortError') {
      throw new Error('Download cancelled');
    }
    throw err;
  } finally {
    updateAbort = null;
  }
}

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function openWithSystem(filePath) {
  const error = await shell.openPath(filePath);
  if (error) {
    throw new Error(error);
  }
}

// returns "installing" (app quits and the installer takes over) or "opened" (user finishes in the installer)
async function installUpdate(filePath) {
  const ext = extname(filePath).toLowerCase();
  info('Installing update: ' + filePath);

  if (process.platform === 'win32' && ext === '.exe') {
    try {
      // silent NSIS install, relaunch TWLED-GUI afterwards
      await spawnDetached(filePath, ['/S', '--updated', '--force-run']);
    } catch (err) {
      // e.g. the installer needs elevation: let the shell start it (shows UAC + installer)
      info('Silent install could not start (' + err.message + '), opening installer');
      await openWithSystem(filePath);
    }
    return 'installing';
  }
  if (process.platform === 'win32' && ext === '.msi') {
    await spawnDetached('msiexec.exe', ['/i', filePath, '/passive', '/norestart']);
    return 'installing';
  }
  if (process.platform === 'linux' && ext === '.appimage' && process.env.APPIMAGE) {
    // replace the running AppImage and restart from it
    const target = process.env.APPIMAGE;
    const tmp = target + '.new';
    copyFileSync(filePath, tmp);
    chmodSync(tmp, 0o755);
    renameSync(tmp, target);
    app.relaunch({ execPath: target, args: process.argv.slice(1) });
    return 'installing';
  }
  // .dmg / .pkg / .deb / .rpm: hand over to the system installer
  await openWithSystem(filePath);
  return 'opened';
}

function registerUpdateHandlers() {
  ipcMain.handle('update:get-version', () => app.getVersion());

  ipcMain.handle('update:start', async (event, asset) => {
    if (updateAbort) {
      throw new Error('An update download is already running');
    }
    const sender = event.sender;
    const filePath = await downloadUpdate(sender, asset);
    // download finished: install right away, no further user action
    sendToRenderer(sender, 'update:status', { state: 'installing' });
    const result = await installUpdate(filePath);
    if (result === 'installing') {
      // give the renderer a moment to show the "installing" state, then quit for the installer
      setTimeout(() => app.quit(), 1500);
    }
    return result;
  });

  ipcMain.handle('update:cancel', () => {
    if (updateAbort) {
      updateAbort.abort();
    }
  });
}

// check if second instance was started
if (!gotTheLock) {
  info('TWLED-GUI quitted');
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
      info('Someone tried to run a second instance. Focus our main window');
      win.show()
    }
  })

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  // TWLED firmware ETags only change with VERSION, so a reflash with the same VERSION
  // would keep serving stale UI files from Electron's disk cache
  app.whenReady().then(() => session.defaultSession.clearCache())
  app.whenReady().then(registerUpdateHandlers)
  app.whenReady().then(createWindow)
  app.whenReady().then(loadSettings)

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    debug("All windows are closed");
    if (process.platform === 'darwin') {
      if (settings !== null) {
        if (settings[1].value) {
          tray.destroy();
        }
      }
      info('TWLED-GUI closed');
    } else {
      info('TWLED-GUI quitted');
      app.quit();
    }
  })

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
