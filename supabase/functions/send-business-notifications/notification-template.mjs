export const MESSAGE_SUBJECT='New Customer Message — Ogreena';

export function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export function retryDelayMinutes(attemptCount){
  return Math.min(15*Math.pow(2,Math.max(0,Number(attemptCount||1)-1)),240);
}

export function conversationUrl(conversationId){
  const id=String(conversationId||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return 'https://ogreena.com/owner/#operations:messages';
  return `https://ogreena.com/messages/?conversation=${encodeURIComponent(id)}`;
}

export function messageTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.valueOf()))return 'Time unavailable';
  return `${new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date)} (America/Los_Angeles)`;
}

export function buildMessageEmail(delivery){
  const subject=MESSAGE_SUBJECT;
  const url=conversationUrl(delivery.conversation_id);
  const html=`<h2>${subject}</h2><p><strong>Customer:</strong> ${escapeHtml(delivery.customer_name||'Customer')}</p><p><strong>Message time:</strong> ${escapeHtml(messageTime(delivery.message_created_at||delivery.created_at))}</p><p><strong>Message preview:</strong> ${escapeHtml(delivery.summary||'Customer sent an attachment')}</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#07583f;color:#fff;text-decoration:none;border-radius:6px">View Conversation</a></p><p>Authentication and authorized Ogreena staff access are required.</p>`;
  return {subject,html,url};
}
