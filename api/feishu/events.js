// api/feishu/events.js  —  Node 18 + Vercel
// 需要在 Vercel -> Project -> Settings -> Environment Variables 配置：
// APP_ID / APP_SECRET / VERIFICATION_TOKEN
// （可选）LARK_GROUP_CHAT_ID  // 群chat_id，机器人必须在群里

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // ---- 兼容 Vercel：可能是字符串也可能是对象 ----
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    console.error('parse body error:', e);
  }

  // ---- 1) URL 验证 ----
  if (body?.type === 'url_verification') {
    return res.status(200).json({ challenge: body?.challenge });
  }

  // ---- 可选：校验回调 token（未启用加密时，事件 body.header.token 会带上）----
  const TOKEN = process.env.VERIFICATION_TOKEN || '';
  if (TOKEN && body?.header?.token && body.header.token !== TOKEN) {
    console.warn('verification token mismatch');
    return res.status(200).send('ok');
  }

  const evtType = body?.header?.event_type;

  // ---- 2) 新员工入职欢迎 ----
  if (evtType === 'contact.user.created_v3') {
    const userId   = body?.event?.user?.user_id;
    const userName = body?.event?.user?.name || '新同事';
    if (!userId) {
      console.warn('no user_id in event:', body?.event);
      return res.status(200).send('ok');
    }

    const tenantToken = await getTenantToken(process.env.APP_ID, process.env.APP_SECRET);
    if (!tenantToken) {
      console.error('get tenant_access_token failed');
      return res.status(200).send('ok');
    }

    // 2.1 私聊发送欢迎长文（post 富文本更适合长文）
    try {
      await sendPostToUser(tenantToken, userId, makeWelcomePost(userName));
    } catch (e) {
      console.error('send user post failed:', e);
    }

    // 2.2 （可选）群里简短欢迎卡片
    const chatId = process.env.LARK_GROUP_CHAT_ID;
    if (chatId) {
      try {
        await sendCardToChat(tenantToken, chatId, makeGroupCard(userName));
      } catch (e) {
        console.error('send group card failed:', e);
      }
    }

    return res.status(200).send('ok');
  }

  // ---- 3) 卡片交互回调（如订阅了 card.action.trigger，可在此处理）----
  if (evtType === 'card.action.trigger') {
    // 这里根据需要处理按钮交互等逻辑
    return res.status(200).send('ok');
  }

  return res.status(200).send('ok');
}

/* ---------------- helpers ---------------- */

async function getTenantToken(appId, appSecret) {
  try {
    const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const data = await r.json();
    if (data.code === 0 && data.tenant_access_token) return data.tenant_access_token;
    console.error('get token error:', data);
  } catch (e) {
    console.error('get token exception:', e);
  }
  return null;
}

// 发送富文本 post 给用户（更适合长文）
async function sendPostToUser(token, userId, post) {
  const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      receive_id: userId,
      msg_type: 'post',
      content: JSON.stringify(post) // 注意这里需要再 JSON.stringify 一次
    })
  });
  const data = await r.json();
  if (data.code !== 0) console.error('send user post error:', data);
  else console.log('send user ok:', data.data?.message_id);
}

// 发送交互卡片到群
async function sendCardToChat(token, chatId, card) {
  const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    })
  });
  const data = await r.json();
  if (data.code !== 0) console.error('send chat card error:', data);
  else console.log('send chat ok:', data.data?.message_id);
}

/* ---------------- message builders ---------------- */

// 欢迎长文（post 富文本）
function makeWelcomePost(name) {
  // 你的文案（分段写，每一段是一个数组的一行）
  const paras = [
    `尊敬的 ${name}，`,
    '我们谨代表 Woodhaven Craftworks（木渊）全体团队，向您致以最诚挚的欢迎。非常荣幸您能正式成为我们的一员。',
    '在 Woodhaven，我们的使命是通过对质量、可持续性及客户满意度的承诺，来重新定义本土的工艺标准。我们致力于为客户提供端到端的木作解决方案，精心打造兼具美观与功能性的空间。',
    '公司的核心理念是“精准工艺，自然驱动（Precision Crafted, Naturally Driven）”。我们相信，您的专业技能与经验将为我们的团队注入新的动力，帮助我们持续地将这一理念贯彻于每一个项目中。',
    '我们视每一位团队成员为重要的合作伙伴，并期待与您携手，共同实现“一次构筑一个项目，逐步建立客户信任（Building Trust, One Project at a Time）”的目标。',
    '再次欢迎您的加入。',
    '此致，',
    'Woodhaven Craftworks 管理层'
  ];

  // Feishu post 结构
  return {
    zh_cn: {
      title: '欢迎加入 Woodhaven',
      content: paras.map(p => [{ tag: 'text', text: p }])
    }
  };
}

// 群里简短欢迎卡片（可按需修改）
function makeGroupCard(name) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'turquoise',
      title: { tag: 'plain_text', content: '入职播报' }
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `🎉 **新伙伴加入：${name}**\n让我们一起欢迎新同事！` }
      }
    ]
  };
}
