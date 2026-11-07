import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'https://ogreena.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const magicOk=(bytes:Uint8Array,type:string)=>{
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const text=new TextDecoder('latin1').decode(bytes);
  const webp=text.slice(0,4)==='RIFF'&&text.slice(8,12)==='WEBP';
  return (type==='image/jpeg'&&jpeg)||(type==='image/png'&&png)||(type==='image/webp'&&webp);
};
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceKey)return json({error:'Server configuration is incomplete'},500);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const auth=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await auth.auth.getUser(token);if(userError||!user)return json({error:'Sign in is required'},401);
  const form=await request.formData().catch(()=>null),eventId=String(form?.get('event_id')||''),file=form?.get('flyer');
  if(!eventId||!(file instanceof File))return json({error:'Event and flyer are required'},400);
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)return json({error:'Use a JPG, PNG, or WebP flyer no larger than 5 MB'},400);
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());if(!magicOk(bytes,file.type))return json({error:'The flyer content does not match its image type'},400);
  const {data:event,error:eventError}=await admin.from('community_events').select('id,organizer_id,flyer_path').eq('id',eventId).eq('organizer_id',user.id).maybeSingle();
  if(eventError||!event)return json({error:'Event ownership could not be verified'},403);
  const upload=await admin.storage.from('community-event-flyers').upload(event.flyer_path,file,{contentType:file.type,upsert:true});
  if(upload.error)return json({error:'The flyer could not be stored'},500);
  return json({ok:true});
});
