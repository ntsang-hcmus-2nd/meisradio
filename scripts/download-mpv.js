const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

const binDir = path.join(__dirname, '..', 'resources', 'bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const MPV_URL = 'https://sourceforge.net/projects/mpv-player-windows/files/release/mpv-0.38.0-x86_64.7z/download';
const SEVEN_ZIP_URL = 'https://www.7-zip.org/a/7zr.exe';

const mpvArchive = path.join(binDir, 'mpv.7z');
const sevenZipExe = path.join(binDir, '7zr.exe');

async function downloadFile(url, dest) {
  console.log(`Downloading ${url} to ${dest}...`);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    maxRedirects: 5,
  });

  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function main() {
  try {
    if (fs.existsSync(path.join(binDir, 'mpv.exe'))) {
      console.log('mpv.exe already exists!');
      return;
    }

    console.log('Downloading 7zr.exe...');
    await downloadFile(SEVEN_ZIP_URL, sevenZipExe);

    console.log('Downloading MPV archive...');
    await downloadFile(MPV_URL, mpvArchive);

    console.log('Extracting MPV archive...');
    execSync(`"${sevenZipExe}" x "${mpvArchive}" -o"${binDir}" -y`);

    console.log('Cleanup...');
    fs.unlinkSync(mpvArchive);
    fs.unlinkSync(sevenZipExe);

    console.log('MPV downloaded and extracted successfully.');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
