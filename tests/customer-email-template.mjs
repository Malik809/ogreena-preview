import assert from 'node:assert/strict';
import {buildCustomerEmail} from '../supabase/functions/send-customer-email/email-template.mjs';

const email=buildCustomerEmail({
  customerEmail:'registered@example.com',
  customerName:'Test <Customer>',
  subject:'Help & estimate',
  message:'First line\n<script>alert(1)</script>'
});
assert.deepEqual(email.to,['office@ogreena.com']);
assert.equal(email.reply_to,'registered@example.com');
assert.equal(email.subject,'Customer Email — Help & estimate');
assert.match(email.text,/registered@example\.com/);
assert.match(email.html,/Test &lt;Customer&gt;/);
assert.match(email.html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(email.html,/<script>/);
console.log('customer email template: fixed recipient, authenticated Reply-To shape, and HTML escaping PASS');
