const {createClient}=window.supabase;
const client=createClient('https://mhhjzifeaofgskimvuom.supabase.co','sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage,storageKey:'ogreena-auth-session',lock:async(_n,_t,fn)=>fn()}});
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const dateLabel=value=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
const timeLabel=value=>value?new Date(`2000-01-01T${value}`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
let session=null,myEvents=[],previewUrl='';
function status(message,error=false,target='#communityStatus'){const node=$(target);node.textContent=message;node.classList.toggle('error',error);}
async function flyerUrl(path){const {data,error}=await client.storage.from('community-event-flyers').createSignedUrl(path,3600);return error?'':data.signedUrl;}
async function renderCards(rows,target,{owned=false}={}){
  if(!rows.length){$(target).innerHTML='<p class="empty-state">No events to show yet.</p>';return;}
  const urls=await Promise.all(rows.map(row=>flyerUrl(row.flyer_path)));
  $(target).innerHTML=rows.map((row,index)=>`<article class="event-card">${urls[index]?`<img src="${escapeHtml(urls[index])}" alt="Flyer for ${escapeHtml(row.event_name)}" loading="lazy">`:''}<div class="event-card-body">${owned?`<span class="event-status ${escapeHtml(row.moderation_status)}">${escapeHtml(row.moderation_status)}</span>`:''}<h3>${escapeHtml(row.event_name)}</h3><p class="event-meta"><strong>${dateLabel(row.event_date)}</strong>${row.start_time?` · ${timeLabel(row.start_time)}`:''}</p><p class="event-meta">${escapeHtml(row.event_location)}</p><p class="event-description">${escapeHtml(row.description)}</p><p class="event-meta">Organized by ${escapeHtml(row.organizer_name)}</p>${owned&&row.moderation_note?`<p class="community-status error">Owner note: ${escapeHtml(row.moderation_note)}</p>`:''}${owned?`<div class="event-actions"><button class="small-btn" type="button" data-edit-event="${row.id}">Edit</button><button class="small-btn danger" type="button" data-delete-event="${row.id}">Remove</button></div>`:''}</div></article>`).join('');
  if(owned)bindOwnedActions();
}
async function loadEvents(){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const publicResult=await client.from('community_events').select('id,event_name,event_location,event_date,start_time,end_time,description,organizer_name,flyer_path,flyer_mime_type,moderation_status,created_at,updated_at').eq('moderation_status','approved').gte('event_date',today).order('event_date').order('start_time');
  if(publicResult.error){status('Community events are not available yet.',true);$('#eventList').innerHTML='<p class="empty-state">Event listings will appear here after setup is complete.</p>';return;}
  await renderCards(publicResult.data||[],'#eventList');
  if(!session)return;
  const mine=await client.from('community_events').select('*').eq('organizer_id',session.user.id).order('created_at',{ascending:false});
  if(mine.error){status(mine.error.message,true);return;}myEvents=mine.data||[];$('#myEventsSection').hidden=false;await renderCards(myEvents,'#myEventList',{owned:true});
}
function readValues(){const form=$('#eventForm'),data=Object.fromEntries(new FormData(form));return{event_name:data.event_name.trim(),event_location:data.event_location.trim(),event_date:data.event_date,start_time:data.start_time||null,end_time:data.end_time||null,description:data.description.trim(),organizer_name:data.organizer_name.trim(),contact_information:data.contact_information.trim()||null};}
function updatePreview(){const values=readValues(),file=$('#eventForm').elements.flyer.files?.[0];if(file){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);}const image=previewUrl?`<img src="${previewUrl}" alt="Selected event flyer preview">`:'';$('#eventPreview').innerHTML=`<div class="preview-card">${image}<div><h3>${escapeHtml(values.event_name||'Event name')}</h3><p>${escapeHtml(values.event_date?dateLabel(values.event_date):'Event date')}${values.start_time?` · ${escapeHtml(timeLabel(values.start_time))}`:''}</p><p>${escapeHtml(values.event_location||'Event location')}</p><p>${escapeHtml(values.description||'About the event')}</p></div></div>`;}
async function validateImage(file){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP flyer.');
  if(file.size>5*1024*1024)throw new Error('The flyer must be 5 MB or smaller.');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,png=bytes.slice(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i]),webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(jpeg||png||webp))throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');
  await createImageBitmap(file).catch(()=>{throw new Error('The selected flyer image could not be read.');});
}
function openForm(row=null){
  if(!session){location.href='../auth/?mode=signin&next=%2Fkinship-network%2F';return;}
  const form=$('#eventForm');form.reset();form.elements.event_id.value=row?.id||'';$('#eventDialogTitle').textContent=row?'Edit Community Event':'Create Community Event';form.querySelector('[type="submit"]').textContent=row?'Save & Resubmit':'Submit for Approval';
  if(row)for(const key of ['event_name','event_location','event_date','start_time','end_time','organizer_name','contact_information','description'])form.elements[key].value=row[key]||'';
  form.elements.flyer.required=!row;previewUrl='';updatePreview();status('',false,'#eventFormStatus');$('#eventDialog').showModal();
}
async function removeEvent(id){
  if(!confirm('Remove this event post? This cannot be undone.'))return;const row=myEvents.find(item=>item.id===id);if(!row)return;
  const result=await client.from('community_events').delete().eq('id',id);if(result.error)return status(result.error.message,true);
  await client.storage.from('community-event-flyers').remove([row.flyer_path]);status('Event removed.');await loadEvents();
}
function bindOwnedActions(){$('[data-edit-event]')?.closest('#myEventList')?.querySelectorAll('[data-edit-event]').forEach(button=>button.addEventListener('click',()=>openForm(myEvents.find(row=>row.id===button.dataset.editEvent))));document.querySelectorAll('[data-delete-event]').forEach(button=>button.addEventListener('click',()=>removeEvent(button.dataset.deleteEvent)));}
$('#eventForm').addEventListener('input',updatePreview);
$('#eventForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.event_id.value,file=form.elements.flyer.files?.[0];
  try{
    await validateImage(file);const values=readValues();if(values.end_time&&values.start_time&&values.end_time<=values.start_time)throw new Error('End time must be later than start time.');
    form.querySelector('[type="submit"]').disabled=true;status('Saving your event…',false,'#eventFormStatus');
    if(id){
      const row=myEvents.find(item=>item.id===id);const update=await client.from('community_events').update({...values,flyer_mime_type:file?.type||row.flyer_mime_type}).eq('id',id);if(update.error)throw update.error;
      if(file){const body=new FormData();body.set('event_id',id);body.set('flyer',file);const upload=await client.functions.invoke('community-event-flyer',{body});if(upload.error||upload.data?.error)throw upload.error||new Error(upload.data.error);}
    }else{
      const eventId=crypto.randomUUID(),ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1],path=`${session.user.id}/${eventId}/flyer.${ext}`;
      const insert=await client.from('community_events').insert({id:eventId,organizer_id:session.user.id,...values,flyer_path:path,flyer_mime_type:file.type});if(insert.error)throw insert.error;
      const body=new FormData();body.set('event_id',eventId);body.set('flyer',file);const upload=await client.functions.invoke('community-event-flyer',{body});if(upload.error||upload.data?.error){await client.from('community_events').delete().eq('id',eventId);throw upload.error||new Error(upload.data.error);}
    }
    $('#eventDialog').close();status('Your event was submitted for owner approval.');await loadEvents();
  }catch(error){status(error.message||'The event could not be submitted.',true,'#eventFormStatus');}finally{form.querySelector('[type="submit"]').disabled=false;}
});
$('[data-open-event-form]').addEventListener('click',()=>openForm());$('[data-close-event-form]').addEventListener('click',()=>$('#eventDialog').close());
client.auth.getSession().then(async({data})=>{session=data.session;if(session){$('[data-account-link]').textContent='My Profile';$('[data-account-link]').href='../auth/';}await loadEvents();});
