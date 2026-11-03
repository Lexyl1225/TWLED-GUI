# Building and installing TWLED on Windows

This produces a normal Windows installer (`TWLED-<version>-win.exe`) that you can copy to any Windows 10/11 PC and install.

---

## 1. One-time setup (build PC only)

| Requirement | How to get it |
|---|---|
| Windows 10 or 11, 64-bit | — |
| **Node.js** (LTS recommended, includes npm) | https://nodejs.org → install with defaults. Check in a new terminal: `node -v` and `npm -v` |
| Internet connection | Only needed for the first build (downloads Electron ~137 MB and installer tools) |
| ~2 GB free disk space | For `node_modules`, the download cache and `dist` |
| **Windows Developer Mode ON** | Settings → System → For developers → **Developer Mode** → On |

> **Why Developer Mode?** electron-builder downloads a signing toolkit that contains symbolic links. Windows only allows creating symlinks with Developer Mode on (or from an Administrator terminal). Without it the build fails with
> `ERROR: Cannot create symbolic link : A required privilege is not held by the client`.
> See [Troubleshooting](#7-troubleshooting) if you can't enable it.

---

## 2. Install the dependencies

Open PowerShell **in the project folder** (the one containing `package.json`):

```powershell
cd C:\xProjects\Sotfware\TWLED-GUI_0.7.4-master
npm ci
```

`npm ci` installs the exact versions from `package-lock.json`. Run it again whenever you copy the project to a new PC or `package-lock.json` changes.

---

## 3. Test before building (optional but recommended)

```powershell
npm start
```

This opens the app in development mode. Log in, check your lights, then close the window.

---

## 4. Build the installer

Close any running TWLED windows (including the tray icon) first, then:

```powershell
npm run "build windows"
```

The first build takes a few minutes; later builds are faster. When it finishes you'll see `building block map` and the prompt returns with no `⨯` errors.

**Output — in the `dist` folder:**

| File | What it is |
|---|---|
| `TWLED-0.7.4-win.exe` | **The installer — this is the file you distribute** |
| `win-unpacked\TWLED.exe` | Portable, unpacked app (runs without installing; handy for a quick test) |
| `*.blockmap`, `latest.yml`, `builder-*.yml` | Build metadata; can be ignored |

### Other installer types

| Command | Result |
|---|---|
| `npm run "build windows"` | **Recommended.** Setup wizard; user chooses install folder |
| `npm run "build windows oneclick"` | Installs immediately with no questions |
| `npm run "build windows msi"` | `.msi` package (for Group Policy / IT deployment) |
| `npm run "build windows msi oneclick"` | Silent-style `.msi` |

---

## 5. Install on a PC

1. Copy `dist\TWLED-0.7.4-win.exe` to the target PC (USB, network share, etc.) and double-click it.
2. **Windows SmartScreen** will likely show *"Windows protected your PC"* because the installer isn't code-signed. Click **More info → Run anyway**.
3. Choose **Only for me** or **Anyone who uses this computer** (the latter needs admin rights).
4. Choose the install folder (default is fine) → **Install** → **Finish**.
5. Start **TWLED** from the Start menu or the desktop shortcut.
6. If **Windows Defender Firewall** asks, tick **Private networks** and click **Allow access**. Light discovery (Bonjour/SSDP) needs this.

### First login

- Default username: `Admin`, password: `T0ms1234`
- **Change these right away** in Settings → Account. After 10 wrong attempts the login locks for 10 minutes.

### Optional settings

In Settings → Startup you can enable **Autostart** (start with Windows), **Autostart hidden** (start minimised to tray) and **Enable tray**. Tray changes need an app restart.

---

## 6. Releasing an updated version

1. Bump the version number in **all three** places (they must match):
   - `package.json` → `"version": "0.7.4"`
   - `js/updater.js` → `const twledGuiVersion = "0.7.4";`
   - `VERSION` file
2. Optionally add an entry to `CHANGELOG.md`.
3. Build again: `npm run "build windows"` → `dist\TWLED-0.7.4-win.exe`.
4. On each PC, **run the new installer over the existing install. Do not uninstall first.**

> ⚠️ Saved lights, settings, theme and login credentials live in `%APPDATA%\twled-gui`. The installer is configured with `deleteAppDataOnUninstall`, so **uninstalling wipes them**. Installing on top of the old version keeps them.

---

## 7. Troubleshooting

**`Cannot create symbolic link : A required privilege is not held by the client`**
Turn on Developer Mode (step 1), or run the build from PowerShell opened **as Administrator**. If neither is allowed, pre-extract the toolkit once, ignoring the two macOS-only symlinks it can't create:

```powershell
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$archive = Get-ChildItem $cache -Filter *.7z | Select-Object -First 1   # left over from the failed build
.\node_modules\7zip-bin\win\x64\7za.exe x -snld -bd -y $archive.FullName "-o$cache\winCodeSign-2.6.0"
```

It will report 2 symlink errors; that's expected. Then run `npm run "build windows"` again.

**`EBUSY` / `The process cannot access the file` / `TWLED.exe is in use`**
TWLED is still running. Quit it from the tray icon (right-click → Close) or Task Manager, then rebuild. Antivirus scanning `dist` can cause the same error, so wait a moment and retry.

**`npm ci` fails**
Delete the `node_modules` folder and run `npm ci` again. Make sure you're in the folder containing `package.json`.

**Build is stuck on `downloading`**
A proxy or firewall is blocking GitHub downloads. Build on a network with internet access; after the first successful build the files are cached in `%LOCALAPPDATA%\electron-builder\Cache` and `%LOCALAPPDATA%\electron\Cache`.

**Lights aren't found by "Discover lights"**
Make sure the PC and the lights are on the same network, the network is set to *Private* in Windows, and TWLED is allowed through the firewall. Otherwise try another scan method, or add the light by IP.

**Start completely fresh on a PC**
Uninstall TWLED (Settings → Apps), which also removes `%APPDATA%\twled-gui`.
