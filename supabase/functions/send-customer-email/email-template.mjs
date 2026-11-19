export function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[character]);
}

export function buildCustomerEmail({customerEmail,customerName,subject,message}){
  const safeSubject=String(subject).trim();
  return {
    to:['office@ogreena.com'],
    reply_to:customerEmail,
    subject:`Customer Email — ${safeSubject}`,
    text:`Customer: ${customerName}\nRegistered email: ${customerEmail}\n\n${message}`,
    html:`<h2>Customer Email — Ogreena</h2><p><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p><strong>Registered email:</strong> ${escapeHtml(customerEmail)}</p><p><strong>Subject:</strong> ${escapeHtml(safeSubject)}</p><p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`
  };
}
