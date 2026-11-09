const locIp = localStorage.getItem("locIp");

// show the light's name in the app bar
const viewedLight = (JSON.parse(localStorage.getItem("lights")) || []).find(light => light.ip === locIp);
document.getElementById("viewerTitle").textContent = viewedLight ? viewedLight.name : locIp;

const deviceFrame = document.createElement("iframe");
deviceFrame.id = "deviceFrame";
deviceFrame.src = "http://" + locIp;
document.body.appendChild(deviceFrame);

// Called by the main process when the device UI tries to navigate the whole window
// (e.g. WLED's "Update successful! Rebooting..." page does top.location.href="/").
// Keep the TWLED app bar and load the target inside the iframe instead.
window.twledFrameNavigate = function (url) {
    deviceFrame.src = url;
};
