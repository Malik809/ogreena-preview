const {createClient}=window.supabase;
const client=createClient('https://mhhjzifeaofgskimvuom.supabase.co','sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM',{auth:{persistSession:true,autoRefreshToken:true,storage:localStorage,storageKey:'ogreena-auth-session',lock:async(_n,_t,fn)=>fn()}});
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const serviceLabel=slug=>slug.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()).replace('Tile Grout','Tile & Grout').replace('Move In Move Out','Move-In / Move-Out');
let user,conversations=[],activeConversation=null,realtimeChannel=null;
const requestedService=new URLSearchParams(location.search).get('service');
function status(message,error=false){$('#messengerStatus').textContent=message;$('#messengerStatus').classList.toggle('error',error);$('#messengerStatus').hidden=!message;}
async function signedPhoto(path){if(!path)return'';const {data,error}=await client.storage.from('message-photos').createSignedUrl(path,600);return error?'':data.signedUrl;}
async function ensureConversation(serviceSlug){
  const existing=await client.from('service_conversations').select('*').eq('customer_id',user.id).eq('service_slug',serviceSlug).maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)return existing.data;
  const created=await client.from('service_conversations').insert({customer_id:user.id,service_slug:serviceSlug}).select().single();
  if(created.error?.code==='23505')return (await client.from('service_conversations').select('*').eq('customer_id',user.id).eq('service_slug',serviceSlug).single()).data;
  if(created.error)throw created.error;return created.data;
}
async function loadConversations(){
  const result=await client.from('service_conversations').select('*').eq('customer_id',user.id).order('last_message_at',{ascending:false});if(result.error)throw result.error;conversations=result.data||[];
  if(requestedService&&!conversations.some(c=>c.service_slug===requestedService))conversations.unshift(await ensureConversation(requestedService));
  $('#conversationList').innerHTML=conversations.map(c=>`<button class="thread-choice ${activeConversation?.id===c.id?'active':''}" data-conversation="${c.id}"><strong>${escapeHTML(serviceLabel(c.service_slug))}</strong><span>Ogreena service conversation</span></button>`).join('')||'<p class="muted">Choose Request Service from a service page to begin.</p>';
  $('#conversationList').querySelectorAll('[data-conversation]').forEach(button=>button.addEventListener('click',()=>openConversation(conversations.find(c=>c.id===button.dataset.conversation))));
  const wanted=requestedService?conversations.find(c=>c.service_slug===requestedService):conversations[0];if(wanted&&activeConversation?.id!==wanted.id)await openConversation(wanted);
}
async function openConversation(conversation){activeConversation=conversation;$('#threadHeader').innerHTML=`<h2>${escapeHTML(serviceLabel(conversation.service_slug))}</h2><p class="muted">Private conversation with Ogreena</p>`;await renderMessages();await loadConversations();}
async function renderMessages(){
  if(!activeConversation)return;
  const result=await client.from('messages').select('id,sender_id,body,message_type,attachment_path,attachment_name,read_at,created_at').eq('conversation_id',activeConversation.id).order('created_at');if(result.error)throw result.error;
  const rows=await Promise.all((result.data||[]).map(async row=>({...row,url:await signedPhoto(row.attachment_path)})));
  $('#messageList').innerHTML=rows.map(row=>`<article class="message-bubble ${row.sender_id===user.id?'mine':''}">${row.message_type!=='text'?`<span class="message-type">${escapeHTML(row.message_type)}</span>`:''}${row.body?`<div>${escapeHTML(row.body)}</div>`:''}${row.url?`<a href="${escapeHTML(row.url)}" target="_blank" rel="noopener"><img src="${escapeHTML(row.url)}" alt="Private job photo"></a>`:''}<small>${escapeHTML(new Date(row.created_at).toLocaleString())}</small></article>`).join('')||'<div class="empty-thread"><h3>Start the conversation</h3><p>Tell Ogreena about the work or send a job photo.</p></div>';
  $('#messageList').scrollTop=$('#messageList').scrollHeight;
  const unread=(result.data||[]).filter(row=>row.sender_id!==user.id&&!row.read_at).map(row=>row.id);if(unread.length)await client.from('messages').update({read_at:new Date().toISOString()}).in('id',unread);
}
$('#messageForm').addEventListener('submit',async event=>{event.preventDefault();if(!activeConversation)return;const form=event.currentTarget,body=form.elements.body.value.trim(),file=form.elements.photo.files?.[0];if(!body&&!file)return status('Write a message or choose a photo.',true);if(file&&!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))return status('Use a JPEG, PNG, WebP, HEIC, or HEIF photo.',true);if(file&&file.size>8*1024*1024)return status('Photos must be 8 MB or smaller.',true);form.querySelector('button').disabled=true;try{let path=null;if(file){const ext=(file.name.split('.').pop()||'jpg').toLowerCase();path=`${activeConversation.id}/${user.id}/${crypto.randomUUID()}.${ext}`;const upload=await client.storage.from('message-photos').upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;}const sent=await client.from('messages').insert({conversation_id:activeConversation.id,sender_id:user.id,recipient_id:null,body:body||'Photo',message_type:file?'photo':'text',attachment_path:path,attachment_name:file?.name||null});if(sent.error)throw sent.error;form.reset();status('');await renderMessages();}catch(error){status(error.message||'Message could not be sent.',true);}finally{form.querySelector('button').disabled=false;}});
async function init(){const session=(await client.auth.getSession()).data.session;if(!session){const next=`/messages/${requestedService?`?service=${encodeURIComponent(requestedService)}`:''}`;return location.replace(`../auth/?mode=signin&next=${encodeURIComponent(next)}`);}user=session.user;const role=await client.from('user_roles').select('role').eq('user_id',user.id).single();if(role.data?.role!=='customer'){status('Customer Messenger is available from a customer account.',true);return;}$('#messengerApp').hidden=false;status('');await loadConversations();realtimeChannel=client.channel(`customer-messages-${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>activeConversation&&renderMessages()).on('postgres_changes',{event:'*',schema:'public',table:'service_conversations',filter:`customer_id=eq.${user.id}`},loadConversations).subscribe();}
init().catch(error=>status(error.message||'Messenger could not open.',true));
