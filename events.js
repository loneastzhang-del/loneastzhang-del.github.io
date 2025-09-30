// api/feishu/events.js  —— Vercel Serverless Function（Node 18+）
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body = {};
  try {
    body = req.body || JSON.parse(req.body || "{}");
  } catch (e) {
    // ignore
  }

  // 1) 飞书URL验证
  if (body?.type === "url_verification") {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 2) 其他事件（例如 user_added_to_tenant）
  // TODO：后面在这里写“获取token并发消息卡片”的逻辑
  return res.status(200).send("ok");
}
