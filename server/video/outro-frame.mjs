import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const OUTRO_DURATION_SECONDS = 2.8;

export function buildOutroSvg(avatarDataUri) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#080A14"/>
          <stop offset="0.5" stop-color="#171127"/>
          <stop offset="1" stop-color="#090A10"/>
        </linearGradient>
        <radialGradient id="rose" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#FF7892" stop-opacity="0.3"/>
          <stop offset="1" stop-color="#FF7892" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="violet" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#9275F5" stop-opacity="0.28"/>
          <stop offset="1" stop-color="#9275F5" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#F7C982"/>
          <stop offset="0.5" stop-color="#FF8498"/>
          <stop offset="1" stop-color="#A58CFF"/>
        </linearGradient>
        <clipPath id="avatarClip"><rect x="378" y="420" width="324" height="324" rx="86"/></clipPath>
        <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="34"/>
        </filter>
      </defs>

      <rect width="1080" height="1920" fill="url(#background)"/>
      <circle cx="810" cy="410" r="470" fill="url(#violet)"/>
      <circle cx="210" cy="1370" r="520" fill="url(#rose)"/>
      <path d="M-100 520 C240 260 560 250 1180 610" fill="none" stroke="#F7C982" stroke-opacity="0.2" stroke-width="2"/>
      <path d="M-160 1420 C260 1120 680 1260 1230 1010" fill="none" stroke="#FF7892" stroke-opacity="0.16" stroke-width="2"/>

      <text x="540" y="184" text-anchor="middle" fill="#D3AF73" font-family="PingFang SC, sans-serif" font-size="22" font-weight="600" letter-spacing="8">XINGGE OBSERVATORY</text>
      <rect x="484" y="224" width="112" height="3" rx="2" fill="url(#accent)"/>

      <rect x="350" y="392" width="380" height="380" rx="110" fill="#A58CFF" opacity="0.24" filter="url(#shadow)"/>
      <rect x="368" y="410" width="344" height="344" rx="94" fill="none" stroke="url(#accent)" stroke-width="3" opacity="0.78"/>
      <image href="${avatarDataUri}" x="378" y="420" width="324" height="324" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>

      <text x="540" y="906" text-anchor="middle" fill="#FFF9FC" font-family="Songti SC, STSong, serif" font-size="92" font-weight="700" letter-spacing="8">星格观察局</text>
      <text x="540" y="1000" text-anchor="middle" fill="#B9B3C2" font-family="PingFang SC, sans-serif" font-size="35" letter-spacing="6">看懂性格，也看懂关系</text>

      <rect x="224" y="1112" width="632" height="116" rx="58" fill="#FFFFFF" fill-opacity="0.055" stroke="#FFFFFF" stroke-opacity="0.14"/>
      <circle cx="296" cy="1170" r="8" fill="#FF8498"/>
      <text x="554" y="1182" text-anchor="middle" fill="#F6EDF3" font-family="PingFang SC, sans-serif" font-size="32" font-weight="600" letter-spacing="4">关注我 · 下一条继续聊</text>

      <text x="540" y="1655" text-anchor="middle" fill="#77717E" font-family="PingFang SC, sans-serif" font-size="23" letter-spacing="5">@ 星 格 观 察 局</text>
      <rect x="430" y="1702" width="220" height="2" rx="1" fill="url(#accent)" opacity="0.65"/>
    </svg>`;
}

export async function ensureOutroFrame({ projectRoot }) {
  const cacheDirectory = path.join(projectRoot, "data", "cache");
  const outputPath = path.join(cacheDirectory, "xingge-outro-v1.png");
  try {
    await access(outputPath);
    return outputPath;
  } catch {
    await mkdir(cacheDirectory, { recursive: true });
  }

  const avatarPath = path.join(projectRoot, "public", "assets", "xingge-avatar.png");
  const avatar = await readFile(avatarPath);
  const avatarDataUri = `data:image/png;base64,${avatar.toString("base64")}`;
  await sharp(Buffer.from(buildOutroSvg(avatarDataUri))).png().toFile(outputPath);
  return outputPath;
}
