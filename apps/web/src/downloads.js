const releasesUrl="https://github.com/olamidebello/Sip/releases";
const packages=[
  {label:"Android",kind:"APK preview",match:/\.apk$/i,note:"Debug build for testing. Install only if you trust this release."},
  {label:"Windows",kind:"Desktop preview",match:/\.exe$/i,note:"Unsigned installer."},
  {label:"macOS",kind:"Desktop preview",match:/\.dmg$/i,note:"Unsigned installer."},
  {label:"Linux",kind:"Desktop preview",match:/\.AppImage$/i,note:"AppImage package."}
];

function card(item,asset) {
  const article=document.createElement("article");article.className="download-card";
  const label=document.createElement("span");label.className="download-platform";label.textContent=item.label;
  const title=document.createElement("h3");title.textContent=item.kind;
  const note=document.createElement("p");note.textContent=item.note;
  const link=document.createElement("a");link.className="download-link";
  link.href=asset?.browser_download_url||releasesUrl;
  link.textContent=asset?"Download preview ↗":"View releases ↗";
  link.rel="noopener noreferrer";link.target="_blank";
  article.append(label,title,note,link);return article;
}

export async function setupDownloads(fetchReleases=fetch) {
  const list=document.querySelector("#download-options");
  const status=document.querySelector("#download-status");
  if (!list || !status) return;
  let assets=[];
  try {
    const response=await fetchReleases("https://api.github.com/repos/olamidebello/Sip/releases?per_page=10",{headers:{Accept:"application/vnd.github+json"}});
    if (!response.ok) throw new Error("Release list unavailable");
    const releases=await response.json();
    const published=Array.isArray(releases)?releases.find(release=>Array.isArray(release.assets)&&release.assets.length):undefined;
    assets=published?.assets||[];
    status.textContent=published?`Showing ${published.name||published.tag_name} preview downloads. Android is a debug build; iOS builds are simulator-only.`:"No published packages yet. Check the releases page for updates.";
  } catch {
    status.textContent="Could not check packages right now. The releases page has the current downloads.";
  }
  list.replaceChildren(...packages.map(item=>card(item,assets.find(asset=>item.match.test(asset.name)&&asset.browser_download_url))));
  const carrierAsset=assets.find(asset=>asset.name==="olamide-carrier-signed.apk"&&asset.browser_download_url);
  if (carrierAsset) list.append(card({label:"Carrier partner",kind:"Signed Android APK",note:"For SIM profiles that authorize this APK signing certificate. Includes a carrier display-name control, not a system dialer."},carrierAsset));
  const browser=document.createElement("article");browser.className="download-card browser-card";
  browser.innerHTML="<span class=\"download-platform\">Browser</span><h3>Ready when you are</h3><p>Use Olamide here, or install it from your browser for a standalone window.</p>";
  const start=document.createElement("a");start.className="download-link";start.href="#account";start.textContent="Open in browser ↗";
  browser.append(start);list.prepend(browser);
}
