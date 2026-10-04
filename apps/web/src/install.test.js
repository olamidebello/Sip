import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("install manifest has standalone scope and real icon dimensions",async()=>{
  const manifest=JSON.parse(await readFile(new URL("../public/manifest.webmanifest",import.meta.url),"utf8"));
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.start_url,"/");
  for(const size of [192,512]) {
    const icon=manifest.icons.find(item=>item.sizes===`${size}x${size}`);
    assert.ok(icon);
    const bytes=await readFile(new URL(`../public/${icon.src.slice(1)}`,import.meta.url));
    assert.equal(bytes.subarray(1,4).toString(),"PNG");
    assert.equal(bytes.readUInt32BE(16),size);
    assert.equal(bytes.readUInt32BE(20),size);
  }
});

test("service worker bypasses private API requests",async()=>{
  const source=await readFile(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.match(source,/url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source,/request\.mode==="navigate"/);
});
