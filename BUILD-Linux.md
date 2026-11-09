# Install Node in Ubuntu itself, plus the rpm build tool
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs rpm
which node npm        # both must be /usr/bin/..., not /mnt/c/...

# Build from a copy on the Linux filesystem, not /mnt/c
cp -r /mnt/c/xProjects/Software/TWLED-GUI_0.7.4-master ~/twled && cd ~/twled
rm -rf node_modules dist
npm ci
npm run "build linux rpm"

Building from a copy matters for two reasons. The node_modules folder on C: was installed for Windows, so it can't be shared with Linux. And builds on /mnt/c are very slow. The finished .rpm will be in ~/twled/dist/.