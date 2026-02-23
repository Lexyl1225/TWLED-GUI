// logging instance (use electron-log when available)
var log;
try {
    log = require('electron-log');
} catch (e) {
    log = console;
}

document.getElementById("autostart").addEventListener("change", toggleAutostart);
document.getElementById("autostartHidden").addEventListener("change", toggleAutostart);
document.getElementById("tray").addEventListener("change", toggleTray);
document.getElementById("autoTurnOnOnlyAtAutostart").addEventListener("change", toggleLightAutostartOnlyAtAutostart);

// create settings json
if (localStorage.getItem("settings") === null) {
    log.verbose("No settings local storage item found. Creating one...");
    saveSettings();
}

loadSettings();
enableAutostart();
loadLights();

// Opens Github settings wiki page in default browser
function openWiki() {
    log.verbose("Opens Github settings wiki page in default browser");
    const { shell } = require('electron')
    shell.openExternal('https://tomsworldph-my.sharepoint.com/:f:/g/personal/alexander_fernandez_tomsworld_com_ph/EsFLbkWSnd9HrWgJrJmp318B0NlLb56zShA1BNbNoQXD1A?e=cEGorC')
}

// enabels or disables the autostart of twled-gui
function toggleAutostart() {
    log.debug("toggleAutostart(): enabels or disables the autostart of twled-gui");
    const AutoLaunch = require('auto-launch');

    let twledAutoLauncher = new AutoLaunch({
        name: 'TWLED'
    });

    if (document.getElementById("autostartHidden").checked) {
        document.getElementById("tray").checked = true;
        let settings = JSON.parse(localStorage.getItem("settings"));
        if (settings[1].value !== document.getElementById("tray").checked) {
            document.getElementById("restartRequired").style.display = "block";
        }
        // double quotes because auto-launch automatically encloses the appPath with double quotes when writing to the registry
        if (process.platform === "win32") {
            twledAutoLauncher.opts.appPath += '" --hidden"'
        } else {
            twledAutoLauncher.opts.appPath += ' --hidden'
        }
    }

    log.debug("AutoLaunch appPath: " + twledAutoLauncher.opts.appPath)

    if (document.getElementById("autostart").checked) {
        log.verbose("Enable autostart");
        twledAutoLauncher.enable();

    } else {
        log.verbose("Disable autostart");
        twledAutoLauncher.disable();
        document.getElementById("autostartHidden").checked = false;
    }
    document.getElementById("autostartHidden").disabled = !document.getElementById("autostart").checked;
    saveSettings();
}

// enables the autostart button
function enableAutostart() {
    if (process.platform == "win32" || process.platform == "linux") {
        log.verbose("Enable autostart because OS is win32 or linux");
        document.getElementById("autostart").disabled = false;
        checkAutostart();
    } else {
        checkAutostart();

        const AutoLaunch = require('auto-launch');
        let twledAutoLauncher = new AutoLaunch({
            name: 'TWLED'
        });
        let promise = twledAutoLauncher.isEnabled();
        promise.then(function (value) {
            if (value) {
                log.verbose("Disable autostart because OS is not win32 or linux");
                twledAutoLauncher.disable();
                document.getElementById("autostart").checked = false;
            }
        }
        );

        log.debug("Disable autostart and autostartHidden button");
        document.getElementById("autostartHidden").checked = false;
        saveSettings();
    }
}

// enabels or disables the tray icon of twled-gui
class toggleTray {
    constructor() {
        if (document.getElementById("autostartHidden").checked) {
            this.checked = true;
        }
        let settings = JSON.parse(localStorage.getItem("settings"));
        if (settings[1].checked !== this.checked && !document.getElementById("autostartHidden").checked) {
            document.getElementById("restartRequired").style.display = "block";
        }
        saveSettings();
    }
}

// check if autostart is already enabeld
function checkAutostart() {
    log.verbose("Check if autostart is already enabeld");
    const AutoLaunch = require('auto-launch');

    let twledAutoLauncher = new AutoLaunch({
        name: 'TWLED'
    });

    let promise = twledAutoLauncher.isEnabled();

    promise.then(function (value) {
        log.debug("Autostart: " + value);
        document.getElementById("autostart").checked = value;
        document.getElementById("autostartHidden").disabled = !value;
    }
    );
}

// loads the lights into the list
function loadLights() {
    log.verbose("loads the lights into the list");
    let lights = JSON.parse(localStorage.getItem("lights"));
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        log.debug("Add light " + element.name + " to list");
        document.getElementById("autoTurnOn").innerHTML += "<li class=\"collection-item\"><div>" + element.name + "<a class=\"secondary-content\"><div class=\"switch\"><label>Off<input type=\"checkbox\" id=\"lightAutostart" + index + "\" onchange=\"addLightToAutostart(" + index + ", this.checked)\"><span class=\"lever\"></span>On</label></div></a></div></li>";
    }
    checkLightOptions(lights);
}

// check if a option is already enabeld for a light
function checkLightOptions(lights) {
    log.verbose("check if autostart is already enabeld for a light");
    for (let index = 0; index < lights.length; index++) {
        let autostart = lights[index].autostart;
        log.debug("Autostart is " + autostart + " for light " + lights[index].name);
        // autostart
        document.getElementById("lightAutostart" + index).checked = autostart;
    }
}

// adds a light to autostart so it will automaticcaly turn on with program start
function addLightToAutostart(id, state) {
    let lights = JSON.parse(localStorage.getItem("lights"));
    lights[id].autostart = state;
    localStorage.setItem("lights", JSON.stringify(lights));
}

// toggels if lights should turn on on every start or only on autostart
function toggleLightAutostartOnlyAtAutostart() {
    saveSettings();
}

// saves settings into local storage
function saveSettings() {
    log.verbose("saves settings into local storage");
    let settings = [
        {
            id: "autostartHidden",
            type: "checkbox",
            value: document.getElementById("autostartHidden").checked
        },
        {
            id: "tray",
            type: "checkbox",
            value: document.getElementById("tray").checked
        },
        {
            id: "autoTurnOnOnlyAtAutostart",
            type: "checkbox",
            value: document.getElementById("autoTurnOnOnlyAtAutostart").checked
        }
    ]
    log.debug(settings);
    localStorage.setItem("settings", JSON.stringify(settings));
}

// loads settings from local storage
function loadSettings() {
    log.verbose("load settings from local storage");
    let settings = JSON.parse(localStorage.getItem("settings"));
    settings.forEach(element => {
        if (element.type === "checkbox") {
            log.debug("Set checkbox with id " + element.id + " to " + element.value);
            document.getElementById(element.id).checked = element.value;
        }
    });
    loadThemeSettings();
    loadCredentialSettings();
    loadIdleTimeoutSetting();
}

// Apply and save theme with toast notification
function applyAndSaveTheme() {
    try {
        console.log("Apply and save theme button clicked");
        let file = document.getElementById("backgroundImage").files[0];
        if (file) {
            let reader = new FileReader();
            reader.onload = function(e) {
                let theme = {
                    themeColor: document.getElementById("themeColor").value,
                    backgroundColor: document.getElementById("backgroundColor").value,
                    backgroundImage: e.target.result
                };
                localStorage.setItem("twledTheme", JSON.stringify(theme));
                console.log("Theme saved with background image");
                if (typeof applyTheme === 'function') {
                    applyTheme();
                } else {
                    console.error("applyTheme function not found");
                }
                M.toast({html: 'New theme selected', displayLength: 2000});
            };
            reader.readAsDataURL(file);
        } else {
            let theme = {
                themeColor: document.getElementById("themeColor").value,
                backgroundColor: document.getElementById("backgroundColor").value,
                backgroundImage: JSON.parse(localStorage.getItem("twledTheme") || "{}").backgroundImage || ""
            };
            localStorage.setItem("twledTheme", JSON.stringify(theme));
            console.log("Theme saved without background image");
            if (typeof applyTheme === 'function') {
                applyTheme();
            } else {
                console.error("applyTheme function not found");
            }
            M.toast({html: 'New theme selected', displayLength: 2000});
        }
    } catch (error) {
        console.error("Error in applyAndSaveTheme:", error);
        M.toast({html: 'Error applying theme', displayLength: 2000});
    }
}


// Load theme settings from localStorage
function loadThemeSettings() {
    log.verbose("Load theme settings from localStorage");
    let theme = JSON.parse(localStorage.getItem("twledTheme") || "{}");
    if (theme.themeColor) {
        document.getElementById("themeColor").value = theme.themeColor;
    } else {
        document.getElementById("themeColor").value = "#8e19db";
    }
    if (theme.backgroundColor) {
        document.getElementById("backgroundColor").value = theme.backgroundColor;
    } else {
        document.getElementById("backgroundColor").value = "#222222";
    }
    applyTheme();
}

// Apply theme to all pages
function applyTheme() {
    log.verbose("Apply theme to all pages");
    let theme = JSON.parse(localStorage.getItem("twledTheme") || "{}");
    if (theme.themeColor) {
        document.documentElement.style.setProperty('--theme-color', theme.themeColor);
    }
    if (theme.backgroundColor) {
        document.body.style.backgroundColor = theme.backgroundColor;
    }
    if (theme.backgroundImage) {
        document.body.style.backgroundImage = `url('${theme.backgroundImage}')`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.backgroundRepeat = "no-repeat";
    } else {
        document.body.style.backgroundImage = "none";
    }
}

// Reset theme to defaults
function resetTheme() {
    log.verbose("Reset theme to defaults");
    localStorage.removeItem("twledTheme");
    document.getElementById("themeColor").value = "#8e19db";
    document.getElementById("backgroundColor").value = "#222222";
    document.getElementById("backgroundImage").value = "";
    applyTheme();
    M.toast({html: 'Theme reset to default', displayLength: 2000});
}

function getStoredCredentials() {
    const defaults = { username: "Admin", password: "T0ms1234" };
    try {
        const raw = localStorage.getItem("appCredentials");
        if (!raw) {
            return defaults;
        }
        const parsed = JSON.parse(raw);
        if (parsed && parsed.username && parsed.password) {
            return parsed;
        }
    } catch (error) {
        log.warn("Invalid stored credentials, reverting to defaults", error);
    }
    return defaults;
}

function loadCredentialSettings() {
    log.verbose("Load credential settings");
    const creds = getStoredCredentials();
    const userInput = document.getElementById("newUsername");
    const passInput = document.getElementById("newPassword");
    if (userInput) {
        userInput.value = creds.username;
    }
    if (passInput) {
        passInput.value = "";
    }
    if (window.M && typeof M.updateTextFields === "function") {
        M.updateTextFields();
    }
}

function saveNewCredentials() {
    log.verbose("Attempt to save new credentials");
    const username = (document.getElementById("newUsername").value || "").trim();
    const password = document.getElementById("newPassword").value || "";
    if (!username || !password) {
        M.toast({ html: 'Enter both username and password', displayLength: 2000 });
        return;
    }
    const payload = { username: username, password: password };
    localStorage.setItem("appCredentials", JSON.stringify(payload));
    localStorage.removeItem("loginAttempts");
    localStorage.removeItem("loginBlockedUntil");
    try {
        sessionStorage.removeItem("authenticated");
    } catch (e) {
        log.warn("Unable to modify sessionStorage", e);
    }
    M.toast({ html: 'Credentials updated. Please log in again.', displayLength: 2000 });
    setTimeout(function () {
        window.location.href = "login.html";
    }, 1200);
}

function loadIdleTimeoutSetting() {
    const input = document.getElementById("idleTimeoutMinutes");
    if (!input) {
        return;
    }
    let stored = parseInt(localStorage.getItem("idleTimeoutMinutes") || "1", 10);
    if (!stored || stored < 1) {
        stored = 1;
        localStorage.setItem("idleTimeoutMinutes", String(stored));
    }
    input.value = stored;
    if (window.M && typeof M.updateTextFields === "function") {
        M.updateTextFields();
    }
}

function saveIdleTimeout() {
    const input = document.getElementById("idleTimeoutMinutes");
    if (!input) {
        return;
    }
    let value = parseInt(input.value || "1", 10);
    if (!value || value < 1) {
        value = 1;
    }
    localStorage.setItem("idleTimeoutMinutes", String(value));
    M.toast({ html: `Idle timeout set to ${value} minute(s)`, displayLength: 2000 });
}






