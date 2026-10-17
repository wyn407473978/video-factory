import assert from "node:assert/strict";

const baseUrl = "http://127.0.0.1:4174";
const marker = `联调文案-${Date.now()}`;

const importedResponse = await fetch(`${baseUrl}/api/scripts/import`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    items: [{
      title: marker,
      tag: "联调测试",
      script: "这是一条用于验证批量导入、编辑和删除接口的临时文案。"
    }]
  })
});
assert.equal(importedResponse.status, 201);
const importedPayload = await importedResponse.json();
assert.equal(importedPayload.imported.length, 1);
const [record] = importedPayload.imported;

try {
  const updatedResponse = await fetch(`${baseUrl}/api/scripts/${record.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `${marker}-已编辑`, status: "ready" })
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.title, `${marker}-已编辑`);

  const listResponse = await fetch(`${baseUrl}/api/scripts`);
  assert.equal(listResponse.status, 200);
  const records = await listResponse.json();
  assert.ok(records.some((item) => item.id === record.id));
} finally {
  const deletedResponse = await fetch(`${baseUrl}/api/scripts/${record.id}`, { method: "DELETE" });
  assert.equal(deletedResponse.status, 204);
}

console.log("文案库导入、编辑、查询、删除接口联调通过");
