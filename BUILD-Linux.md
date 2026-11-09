# Install Node in Ubuntu itself, plus the rpm build tool
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs rpm
which node npm        # both must be /usr/bin/..., not /mnt/c/...

# Build from a copy on the Linux filesystem, not /mnt/c
cp -r /mnt/c/xProjects/Software/TWLED-GUI_0.7.4-master ~/twled && cd ~/twled
rm -rf node_modules dist
npm ci
npm run "build linux rpm"

