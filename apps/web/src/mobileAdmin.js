const $ = (selector) => document.querySelector(selector);
async function request(path, method = "GET", body) {
  const response = await fetch(path, { method, credentials:"same-origin",
    headers: body ? { "Content-Type":"application/json" } : {},
    body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Release request failed");
  return data;
}
export function setupMobileAdmin() {
  const status = $("#mobile-status");
  const apps = $("#mobile-apps");
  const releases = $("#mobile-releases");
  const events = $("#mobile-events");
  let selected;
  async function refresh() {
    const [overview, appData, releaseData] = await Promise.all([
      request("/api/admin/mobile/overview"),request("/api/admin/mobile/apps"),request("/api/admin/mobile/releases")
    ]);
    status.textContent = overview.message;
    const appId = apps.value;
    apps.replaceChildren();
    for (const app of appData.apps) {
      const option = document.createElement("option");
      option.value = app.id;
      option.textContent = `${app.display_name} (${app.platform}, ${app.app_identifier})`;
      apps.append(option);
    }
    if (appData.apps.some((app) => app.id === appId)) apps.value = appId;
    const prior = releases.value;
    releases.replaceChildren();
    for (const release of releaseData.releases) {
      const option = document.createElement("option");
      option.value = release.id;
      option.textContent = `${release.display_name} ${release.version_name} (${release.build_number}): ${release.status}, ${release.track}`;
      releases.append(option);
    }
    if (releaseData.releases.some((release) => release.id === prior)) releases.value = prior;
    selected = releaseData.releases.find((release) => release.id === releases.value);
    fillSelected();
  }
  function fillSelected() {
    const form = $("#mobile-release-form");
    for (const key of ["versionName","buildNumber","track","rolloutPercent","releaseNotes","artifactUrl","artifactSha256"]) {
      const column = key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
      form.elements[key].value = selected?.[column] ?? "";
    }
    events.replaceChildren();
    if (selected) request(`/api/admin/mobile/releases/${selected.id}/events`)
      .then(({ events: history }) => {
        if (selected?.id !== releases.value) return;
        for (const entry of history) {
          const item = document.createElement("li");
          item.textContent = `${entry.action} by ${entry.actor} (${new Date(entry.created_at).toLocaleString()}, revision ${entry.revision})`;
          events.append(item);
        }
      }).catch((error) => { status.textContent = error.message; });
  }
  releases.addEventListener("change", () => refresh().catch((error) => { status.textContent = error.message; }));
  $("#mobile-app-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request("/api/admin/mobile/apps","POST",Object.fromEntries(new FormData(form)));
      form.reset(); await refresh(); status.textContent = "App registered for release planning.";
    } catch (error) { status.textContent = error.message; }
  });
  $("#mobile-release-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form)), rolloutPercent:Number(form.elements.rolloutPercent.value) };
    try {
      if (selected) await request(`/api/admin/mobile/releases/${selected.id}`,"PUT",{ ...body, revision:selected.revision });
      else await request("/api/admin/mobile/releases","POST",{ ...body,appId:apps.value });
      await refresh(); status.textContent = "Release saved.";
    } catch (error) { status.textContent = error.message; }
  });
  $("#mobile-new-release").addEventListener("click", () => {
    selected = null; releases.selectedIndex = -1;
    $("#mobile-release-form").reset(); events.replaceChildren();
    status.textContent = "Creating a draft release for the selected app.";
  });
  for (const action of ["approve","reopen","archive"]) {
    $(`#mobile-${action}`).addEventListener("click", async () => {
      if (!selected) return;
      try {
        await request(`/api/admin/mobile/releases/${selected.id}/${action}`,"POST",{ revision:selected.revision });
        await refresh(); status.textContent = `Release ${action} completed internally. No store submission occurred.`;
      } catch (error) { status.textContent = error.message; }
    });
  }
  return { refresh };
}
