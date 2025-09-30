export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body = {};
  try {
    body = req.body || JSON.parse(req.body || "{}");
  } catch (e) {
    // ignore
  }

  // 飞书 URL 验证
  if (body.type === "url_verification") {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 其他事件
  return res.status(200).send("ok");
}
