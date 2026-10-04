import { randomUUID } from "node:crypto";

const idPattern = /^[0-9a-f-]{36}$/i;
const identifierPattern = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/;
const tracks = { android: ["internal", "alpha", "beta", "production"], ios: ["testflight", "app-store"] };
function required(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function artifactUrl(value) {
  if (!required(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export function validateApp(body) {
  if (!tracks[body.platform] || !identifierPattern.test(body.appIdentifier || "") ||
      !required(body.appIdentifier, 255) || !required(body.displayName, 100) ||
      (body.storeAppId != null && body.storeAppId !== "" && !required(body.storeAppId, 64)))
    throw new Error("Valid platform, app identifier, display name and optional store ID required");
  return { platform: body.platform, appIdentifier: body.appIdentifier.trim(),
    displayName: body.displayName.trim(), storeAppId: body.storeAppId?.trim() || null };
}
export function validateRelease(body, platform) {
  if (!required(body.versionName, 64) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(body.versionName) ||
      !required(body.buildNumber, 64) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(body.buildNumber) ||
      !tracks[platform]?.includes(body.track) || !Number.isInteger(body.rolloutPercent) ||
      body.rolloutPercent < 1 || body.rolloutPercent > 100 ||
      typeof body.releaseNotes !== "string" || body.releaseNotes.length > 4000 ||
      !artifactUrl(body.artifactUrl) || !/^[a-f0-9]{64}$/i.test(body.artifactSha256 || ""))
    throw new Error("Valid version, build, track, rollout, notes, HTTPS artifact URL and SHA-256 required");
  return { versionName:body.versionName, buildNumber:body.buildNumber, track:body.track,
    rolloutPercent:body.rolloutPercent, releaseNotes:body.releaseNotes,
    artifactUrl:body.artifactUrl, artifactSha256:body.artifactSha256.toLowerCase() };
}

export async function handleMobileAdmin({ req, res, path, user, pool, send, readJson }) {
  if (user.role !== "admin") return send(res, 403, { error:"Administrator permission required" });
  if (path === "/api/admin/mobile/overview" && req.method === "GET") {
    const apps = await pool.query("SELECT platform,COUNT(*) AS count FROM mobile_apps GROUP BY platform");
    const releases = await pool.query("SELECT status,COUNT(*) AS count FROM mobile_releases GROUP BY status");
    return send(res, 200, { apps:apps.rows, releases:releases.rows,
      storePublishingAvailable:false, message:"Store uploads require signed native builds and store credentials; approval here is internal only." });
  }
  if (path === "/api/admin/mobile/apps" && req.method === "GET") {
    const result = await pool.query("SELECT * FROM mobile_apps ORDER BY created_at DESC LIMIT 200");
    return send(res, 200, { apps:result.rows });
  }
  if (path === "/api/admin/mobile/apps" && req.method === "POST") {
    const app = validateApp(await readJson(req));
    const id = randomUUID();
    try {
      await pool.query("INSERT INTO mobile_apps(id,platform,app_identifier,display_name,store_app_id,created_by) VALUES($1,$2,$3,$4,$5,$6)",
        [id,app.platform,app.appIdentifier,app.displayName,app.storeAppId,user.id]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{ error:"App identifier already exists" });
      throw error;
    }
    return send(res,201,{ id,...app });
  }
  if (path === "/api/admin/mobile/releases" && req.method === "GET") {
    const appId = new URL(req.url,"http://localhost").searchParams.get("appId");
    if (appId && !idPattern.test(appId)) return send(res,400,{ error:"Invalid app ID" });
    const result = appId
      ? await pool.query("SELECT r.*,a.platform,a.display_name FROM mobile_releases r JOIN mobile_apps a ON a.id=r.app_id WHERE r.app_id=$1 ORDER BY r.created_at DESC LIMIT 200",[appId])
      : await pool.query("SELECT r.*,a.platform,a.display_name FROM mobile_releases r JOIN mobile_apps a ON a.id=r.app_id ORDER BY r.created_at DESC LIMIT 200");
    return send(res,200,{ releases:result.rows });
  }
  if (path === "/api/admin/mobile/releases" && req.method === "POST") {
    const body = await readJson(req);
    if (!idPattern.test(body.appId || "")) return send(res,400,{ error:"Invalid app ID" });
    const app = (await pool.query("SELECT platform FROM mobile_apps WHERE id=$1",[body.appId])).rows[0];
    if (!app) return send(res,404,{ error:"App not found" });
    const release = validateRelease(body,app.platform);
    const id = randomUUID();
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO mobile_releases(id,app_id,version_name,build_number,track,rollout_percent,release_notes,artifact_url,artifact_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [id,body.appId,release.versionName,release.buildNumber,release.track,release.rolloutPercent,release.releaseNotes,release.artifactUrl,release.artifactSha256,user.id]);
      await db.query("INSERT INTO mobile_release_events(id,release_id,actor_id,action,revision) VALUES($1,$2,$3,'created',1)",[randomUUID(),id,user.id]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{ error:"Build number already exists for this app" });
      throw error;
    } finally { db.release(); }
    return send(res,201,{ id,status:"draft",revision:1,...release });
  }
  const match = /^\/api\/admin\/mobile\/releases\/([0-9a-f-]{36})(?:\/(approve|reopen|archive|events))?$/i.exec(path);
  if (match && idPattern.test(match[1])) {
    const [,id,action] = match;
    if (action === "events" && req.method === "GET") {
      const exists = await pool.query("SELECT id FROM mobile_releases WHERE id=$1",[id]);
      if (!exists.rowCount) return send(res,404,{ error:"Release not found" });
      const events = await pool.query("SELECT e.action,e.revision,e.created_at,u.display_name AS actor FROM mobile_release_events e JOIN users u ON u.id=e.actor_id WHERE e.release_id=$1 ORDER BY e.created_at,e.id",[id]);
      return send(res,200,{ events:events.rows });
    }
    if ((req.method === "PUT" && !action) || (req.method === "POST" && ["approve","reopen","archive"].includes(action))) {
      const body = await readJson(req);
      if (!Number.isSafeInteger(body.revision) || body.revision < 1) return send(res,400,{ error:"Revision required" });
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const found = await db.query("SELECT r.*,a.platform FROM mobile_releases r JOIN mobile_apps a ON a.id=r.app_id WHERE r.id=$1 FOR UPDATE",[id]);
        const row = found.rows[0];
        if (!row) { await db.query("ROLLBACK"); return send(res,404,{ error:"Release not found" }); }
        if (row.revision !== body.revision) { await db.query("ROLLBACK"); return send(res,409,{ error:"Release changed; refresh before editing" }); }
        const allowed = req.method === "PUT" ? row.status === "draft" :
          action === "approve" ? row.status === "draft" :
          action === "reopen" ? row.status === "approved" : row.status !== "archived";
        if (!allowed) { await db.query("ROLLBACK"); return send(res,409,{ error:"Invalid release transition" }); }
        let status = row.status;
        if (req.method === "PUT") {
          const value = validateRelease(body,row.platform);
          await db.query("UPDATE mobile_releases SET version_name=$1,build_number=$2,track=$3,rollout_percent=$4,release_notes=$5,artifact_url=$6,artifact_sha256=$7,revision=revision+1 WHERE id=$8",
            [value.versionName,value.buildNumber,value.track,value.rolloutPercent,value.releaseNotes,value.artifactUrl,value.artifactSha256,id]);
        } else {
          status = { approve:"approved",reopen:"draft",archive:"archived" }[action];
          await db.query("UPDATE mobile_releases SET status=$1,revision=revision+1,approved_by=$2,approved_at=$3 WHERE id=$4",
            [status,action === "approve" ? user.id : null,action === "approve" ? new Date() : null,id]);
        }
        await db.query("INSERT INTO mobile_release_events(id,release_id,actor_id,action,revision) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(),id,req.method === "PUT" ? "edited" : action,body.revision+1]);
        await db.query("COMMIT");
        return send(res,200,{ id,status,revision:body.revision+1 });
      } catch (error) {
        await db.query("ROLLBACK");
        if (error.code === "ER_DUP_ENTRY") return send(res,409,{ error:"Build number already exists for this app" });
        throw error;
      } finally { db.release(); }
    }
  }
  return send(res,404,{ error:"Mobile admin route not found" });
}
