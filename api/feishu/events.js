// api/feishu/events.js  —  Node 18 + Vercel

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    console.error('parse body error:', e);
  }

  // 1) URL 验证
  if (body?.type === 'url_verification') {
    return res.status(200).json({ challenge: body?.challenge });
  }

  // 可选：校验回调 token（不启用加密时，header.token 会带上）
  const TOKEN = process.env.VERIFICATION_TOKEN || '';
  if (TOKEN && body?.header?.token && body.header.token !== TOKEN) {
    console.warn('verification token mismatch');
    return res.status(200).send('ok');
  }

  const evtType = body?.header?.event_type;

  // 2) 新员工入职
  if (evtType === 'contact.user.created_v3') {
    const userId = body?.event?.user?.user_id;
    const userName = body?.event?.user?.name || '新同事';
    console.log('new user:', { userId, userName });

    const tenantToken = await getTenantToken(process.env.APP_ID, process.env.APP_SECRET);
    if (!tenantToken) {
      console.error('get tenant_access_token failed');
      return res.status(200).send('ok');
    }

    // 发私聊欢迎卡片
    try {
      await sendMessageToUser(tenantToken, userId, makeWelcomeCard(userName));
    } catch (e) {
      console.error('send user message failed:', e);
    }

    // 可选：群里同步欢迎（需要你在 Vercel 再加 LARK_GROUP_CHAT_ID，并确保机器人在群里）
    const chatId = process.env.LARK_GROUP_CHAT_ID;
    if (chatId) {
      try {
        await sendMessageToChat(tenantToken, chatId, makeGroupCard(userName));
      } catch (e) {
        console.error('send group message failed:', e);
      }
    }

    return res.status(200).send('ok');
  }

  // 3) 卡片交互回调（若你勾了 card.action.trigger）
  if (evtType === 'card.action.trigger') {
    // 最简单回执即可，复杂逻辑可按需要更新卡片
    return res.status(200).send('ok');
  }

  return res.status(200).send('ok');
}

// ---------------- helpers ----------------

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

async function sendMessageToUser(token, userId, card) {
  const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      receive_id: userId,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    })
  });
  const data = await r.json();
  if (data.code !== 0) console.error('send user msg error:', data);
  else console.log('send user ok:', data.data?.message_id);
}

async function sendMessageToChat(token, chatId, card) {
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
  if (data.code !== 0) console.error('send chat msg error:', data);
  else console.log('send chat ok:', data.data?.message_id);
}

function makeWelcomeCard(name) {
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**欢迎加入 Woodhaven！**\n${name}，很高兴见到你。` } },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '如有问题可在此卡片找 HR 协助～' }] }
    ],
    header: { title: { tag: 'plain_text', content: '欢迎加入' }, template: 'turquoise' }
  };
}

function makeGroupCard(name) {
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `🎉 **新伙伴加入：${name}**\n一起欢迎！` } }
    ],
    header: { title: { tag: 'plain_text', content: '入职播报' }, template: 'blue' }
  };
}
