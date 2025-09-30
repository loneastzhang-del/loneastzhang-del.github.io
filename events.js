// api/feishu/events.js  —— Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  let body = {};
  try { body = req.body || JSON.parse(req.body || "{}"); } catch (e) {}

  // 1) URL 验证
  if (body?.type === "url_verification") {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 2) 其他事件（例如 user_added_to_tenant）
  // TODO: 在这里调用发送消息卡片的接口
  return res.status(200).send("ok");
}
