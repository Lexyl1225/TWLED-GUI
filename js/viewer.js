const locIp = localStorage.getItem("locIp");

// show the light's name in the app bar
const viewedLight = (JSON.parse(localStorage.getItem("lights")) || []).find(light => light.ip === locIp);
document.getElementById("viewerTitle").textContent = viewedLight ? viewedLight.name : locIp;

document.write("<iframe src=\"http://" + locIp + "\"></iframe>");
