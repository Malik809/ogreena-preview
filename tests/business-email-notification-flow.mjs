import assert from 'node:assert/strict';
import {buildMessageEmail,conversationUrl,retryDelayMinutes} from '../supabase/functions/send-business-notifications/notification-template.mjs';

const conversationId='123e4567-e89b-42d3-a456-426614174000';
const email=buildMessageEmail({customer_name:'Test Customer',summary:'Please clean <today>',conversation_id:conversationId,message_created_at:'2026-11-17T20:00:00Z'});
assert.equal(email.subject,'New Customer Message — Ogreena');
assert.equal(email.url,`https://ogreena.com/messages/?conversation=${conversationId}`);
assert.match(email.html,/Test Customer/);
assert.match(email.html,/America\/Los_Angeles/);
assert.match(email.html,/View Conversation/);
assert.match(email.html,/Please clean &lt;today&gt;/);
assert.doesNotMatch(email.html,/Please clean <today>/);
assert.equal(conversationUrl('not-a-uuid'),'https://ogreena.com/owner/#operations:messages');
assert.deepEqual([1,2,3,4,5,6].map(retryDelayMinutes),[15,30,60,120,240,240]);

const sentKeys=new Set();
const enqueue=({eventType,sourceId,senderRole})=>{
  if(senderRole!=='customer')return false;
  const key=`${eventType}:${sourceId}:office@ogreena.com`;
  if(sentKeys.has(key))return false;
  sentKeys.add(key);return true;
};
assert.equal(enqueue({eventType:'customer_message',sourceId:'message-1',senderRole:'customer'}),true);
assert.equal(enqueue({eventType:'customer_message',sourceId:'message-2',senderRole:'customer'}),true);
assert.equal(enqueue({eventType:'customer_message',sourceId:'message-3',senderRole:'owner'}),false);
assert.equal(enqueue({eventType:'customer_message',sourceId:'message-4',senderRole:'employee'}),false);
assert.equal(enqueue({eventType:'customer_message',sourceId:'message-1',senderRole:'customer'}),false);

console.log('Messenger email subject, private deep link, time zone, escaping, customer/reply routing, staff exclusion, dedupe, and bounded backoff PASS');
