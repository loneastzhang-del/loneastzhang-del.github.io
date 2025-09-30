// api/feishu/events.js  — Vercel / Node 18+
//
// 需要在 Vercel -> Project -> Settings -> Environment Variables 配置：
//  - LARK_APP_ID
//  - LARK_APP_SECRET
//  - LARK_GROUP_CHAT_ID   // 目标群 chat_id（oc_ 开头），确保机器人已在群里

export default async function handler(req, res) {
  // 仅允许 POST
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // 解析请求体（兼容 Vercel：可能是对象也可能是字符串）
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) {
    console.error("parse body error:", e);
    body = {};
  }

  // 1) URL 验证
  if (body?.type === "url_verification") {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 2) 事件分发
  try {
    const evtType = body?.header?.event_type;

    // 员工入职（通讯录创建用户）
    if (evtType === "contact.user.created_v3") {
      const newUserId   = body?.event?.user?.user_id;          // 新人 user_id（可 @）
      const newUserName = body?.event?.user?.name || "新同事";  // 可能为空

      console.log("New hire:", { newUserId, newUserName });

      // 获取 tenant_access_token
      const token = await getTenantToken(
        process.env.LARK_APP_ID,
        process.env.LARK_APP_SECRET
      );

      if (!token) {
        console.error("Get tenant_access_token failed");
        return res.status(200).send("ok");
      }

      // 发送欢迎卡片（失败则回退文本）
      const sent = await sendWelcomeCard(token, process.env.LARK_GROUP_CHAT_ID, {
        id: newUserId,
        name: newUserName,
      });

      if (!sent) {
        await sendWelcomeText(token, process.env.LARK_GROUP_CHAT_ID, {
          id: newUserId,
          name: newUserName,
        });
      }
    }
  } catch (e) {
    console.error("event handle error:", e);
    // 不影响飞书重试，仍返回 200
  }

  return res.status(200).send("ok");
}

/* ---------------- helpers ---------------- */

async function getTenantToken(appId, appSecret) {
  try {
    const r = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      }
    );
    const j = await r.json();
    if (j?.tenant_access_token) return j.tenant_access_token;
    console.error("token resp:", j);
  } catch (e) {
    console.error("getTenantToken error:", e);
  }
  return null;
}

async function sendWelcomeCard(token, chatId, user) {
  try {
    const card = buildWelcomeCard(user);
    const r = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "interactive",
          content: JSON.stringify({ card }),
        }),
      }
    );
    const j = await r.json();
    if (j?.code === 0) return true;
    console.error("sendWelcomeCard failed:", j);
  } catch (e) {
    console.error("sendWelcomeCard error:", e);
  }
  return false;
}

async function sendWelcomeText(token, chatId, user) {
  try {
    const text = buildWelcomeText(user);
    const r = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      }
    );
    const j = await r.json();
    if (j?.code === 0) return true;
    console.error("sendWelcomeText failed:", j);
  } catch (e) {
    console.error("sendWelcomeText error:", e);
  }
  return false;
}

function buildWelcomeCard(user) {
  // 你提供的官方欢迎词做成卡片
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "欢迎加入 Woodhaven Craftworks" },
      template: "turquoise",
    },
    elements: [
      {
        tag: "markdown",
        content:
          `**尊敬的 ${escapeMd(user.name || "新同事")}：**\n\n` +
          `我们谨代表 **Woodhaven Craftworks（木渊）** 全体团队，向您致以最诚挚的欢迎。非常荣幸您能正式成为我们的一员。\n\n` +
          `在 Woodhaven，我们的使命是通过对质量、可持续性及客户满意度的承诺，来重新定义本土的工艺标准。我们致力于为客户提供端到端的木作解决方案，精心打造兼具美观与功能性的空间。`
      },
      { tag: "hr" },
      {
        tag: "markdown",
        content:
          `公司的核心理念是 **“精准工艺，自然驱动（Precision Crafted, Naturally Driven）”**。我们相信，您的专业技能与经验将为我们的团队注入新的动力，帮助我们持续地将这一理念贯彻于每一个项目中。\n\n` +
          `我们视每一位团队成员为重要的合作伙伴，并期待与您携手，共同实现 **“一次构筑一个项目，逐步建立客户信任（Building Trust, One Project at a Time）”** 的目标。`
      },
      { tag: "hr" },
      {
        tag: "markdown",
        content:
          `再次欢迎您的加入。\n\n此致，\n**Woodhaven Craftworks 管理层**`
      },
      {
        tag: "note",
        elements: [
          { tag: "plain_text", content: `@${user.name || "新同事"}（${user.id || ""}）欢迎留言交流～` }
        ]
      }
    ]
  };
}

function buildWelcomeText(user) {
  return (
    `尊敬的 ${user.name || "新同事"}：\n\n` +
    `我们谨代表 Woodhaven Craftworks（木渊） 全体团队，向您致以最诚挚的欢迎。非常荣幸您能正式成为我们的一员。\n\n` +
    `在 Woodhaven，我们的使命是通过对质量、可持续性及客户满意度的承诺，来重新定义本土的工艺标准。我们致力于为客户提供端到端的木作解决方案，精心打造兼具美观与功能性的空间。\n\n` +
    `公司的核心理念是“精准工艺，自然驱动 (Precision Crafted, Naturally Driven)”。我们相信，您的专业技能与经验将为我们的团队注入新的动力，帮助我们持续地将这一理念贯彻于每一个项目中。\n\n` +
    `我们视每一位团队成员为重要的合作伙伴，并期待与您携手，共同实现“一次构筑一个项目，逐步建立客户信任 (Building Trust, One Project at a Time)” 的目标。\n\n` +
    `再次欢迎您的加入。\n\n此致，\nWoodhaven Craftworks 管理层`
  );
}

// 简单处理 markdown 特殊字符，避免名字里有 * _ 等导致渲染异常
function escapeMd(s = "") {
  return String(s).replace(/([*_`~[\]\\])/g, "\\$1");
}
