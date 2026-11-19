(function renderOgreenaContacts(){
  const escapeHTML=value=>String(value).replace(/[&<>'"]/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[character]);
  document.querySelectorAll('[data-ogreena-contact]').forEach(contact=>{
    if(contact.querySelector('.contact-grid'))return;
    const intro=contact.dataset.contactIntro||'Have a question or need service? Contact our office directly.';
    const messengerHref=contact.dataset.messengerHref||'messages/?service=general-inquiry';
    const internalEmail=contact.dataset.internalEmail==='true';
    const emailAction=internalEmail
      ? '<button class="contact-option" type="button" data-email-toggle aria-expanded="false" aria-controls="customerEmailPanel"><span class="contact-label">Email</span><b>office@ogreena.com</b><strong>Email Ogreena</strong></button>'
      : '<a class="contact-option" href="mailto:office@ogreena.com" aria-label="Email Ogreena at office@ogreena.com"><span class="contact-label">Email</span><b>office@ogreena.com</b><strong>Email</strong></a>';
    contact.innerHTML=`
      <div class="content-head"><div><h2>Contact Ogreena</h2><p class="muted">${escapeHTML(intro)}</p></div></div>
      <div class="contact-grid">
        <a class="contact-option" href="tel:+15104729327" aria-label="Call Ogreena at (510) 472-9327"><span class="contact-label">Phone</span><b>(510) 472-9327</b><strong>Call</strong></a>
        ${emailAction}
        <a class="contact-option" href="${escapeHTML(messengerHref)}" aria-label="Open Ogreena Messenger"><span class="contact-label">Ogreena Messenger</span><b>Message the Ogreena office</b><strong>Message Ogreena</strong></a>
      </div>
      ${internalEmail?`<section class="customer-email-panel" id="customerEmailPanel" hidden>
        <h3>Email Ogreena</h3>
        <p class="muted">Send a secure email without leaving your Ogreena profile.</p>
        <form class="customer-email-form" data-customer-email-form>
          <label>From<input name="from" type="email" readonly aria-readonly="true"></label>
          <label>To<input name="to" type="email" value="office@ogreena.com" readonly aria-readonly="true"></label>
          <label class="wide">Subject<input name="subject" maxlength="120" required></label>
          <label class="wide">Message<textarea name="message" maxlength="2000" required></textarea></label>
          <button class="small-btn primary wide" type="submit">Send Email</button>
          <p class="customer-email-status wide" role="status" aria-live="polite"></p>
        </form>
      </section>`:''}`;
    const toggle=contact.querySelector('[data-email-toggle]');
    const panel=contact.querySelector('.customer-email-panel');
    toggle?.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;
      toggle.setAttribute('aria-expanded',String(!panel.hidden));
      if(!panel.hidden)panel.querySelector('[name="subject"]')?.focus();
    });
  });
})();
