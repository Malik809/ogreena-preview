import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, requireOwner } from '../_shared/owner.ts';

type PackageSpec = { weight_lb:number; length_in:number; width_in:number; height_in:number };

function validatedSettings(input: Record<string, unknown>, action: string, actualConfirmed: boolean, carrierConfirmed: boolean) {
  const rates = input.category_rates_cents as Record<string, number>;
  const specs = input.package_specs as Record<string, PackageSpec>;
  const carriers = input.carriers as unknown[];
  if (input.mode !== 'category_flat_rate' || input.coverage !== 'us_50_states_dc') throw new Error('Unsupported shipping configuration');
  if (!rates || ['spray_bottle','gallon'].some(category => !Number.isInteger(rates[category]) || rates[category] < 0 || rates[category] > 100000)) throw new Error('Invalid shipping rates');
  if (!/^\d{5}(-\d{4})?$/.test(String(input.origin_zip || ''))) throw new Error('Invalid fulfillment ZIP code');
  if (!Array.isArray(carriers) || carriers.length < 1 || carriers.length > 10 || carriers.some(name => typeof name !== 'string' || name.length > 60 || !/^[A-Za-z0-9][A-Za-z0-9 .&'()/-]*$/.test(name))) throw new Error('Invalid fulfillment carriers');
  if (!specs || ['spray_bottle','gallon'].some(category => !specs[category] || ['weight_lb','length_in','width_in','height_in'].some(field => !Number.isFinite(specs[category][field as keyof PackageSpec]) || specs[category][field as keyof PackageSpec] <= 0 || specs[category][field as keyof PackageSpec] > 200))) throw new Error('Invalid package weights or dimensions');
  if (action === 'publish' && !actualConfirmed) throw new Error('Actual packaged measurements must be owner-confirmed before publishing');
  const verified = action === 'publish' && actualConfirmed;
  const packages = `${verified ? 'OWNER-VERIFIED ACTUAL' : 'PROVISIONAL — not physically verified'}. 32-oz spray: ${specs.spray_bottle.weight_lb} lb, ${specs.spray_bottle.length_in} x ${specs.spray_bottle.width_in} x ${specs.spray_bottle.height_in} in. Gallon: ${specs.gallon.weight_lb} lb, ${specs.gallon.length_in} x ${specs.gallon.width_in} x ${specs.gallon.height_in} in.`;
  return { ...input, package_specs_status:verified?'owner_verified_actual':'provisional_estimate', package_specs_verified:verified, carrier_eligibility_verified:carrierConfirmed, packages, rates_approved:true, production_email_enabled:false, owner_approved:verified && carrierConfirmed, updated_at:new Date().toISOString() };
}

Deno.serve(async request => {
  const headers = { ...corsHeaders(request.headers.get('Origin'), { allowLocalPreview:true }), 'Content-Type':'application/json', 'Cache-Control':'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return Response.json({ error:'Method not allowed' }, { status:405, headers });
  try {
    await requireOwner(request);
    const body = await request.json() as { action?:string; settings?:Record<string,unknown>; confirmActualMeasurements?:boolean; confirmCarrierEligibility?:boolean };
    if (!['save_draft','publish'].includes(body.action || '')) throw new Error('Unsupported shipping action');
    const settings = validatedSettings(body.settings || {}, body.action!, body.confirmActualMeasurements === true, body.confirmCarrierEligibility === true);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const update = body.action === 'publish'
      ? { content_value:settings, draft_value:settings, published:true, visible:false }
      : { draft_value:{ ...settings, package_specs_verified:false, package_specs_status:'provisional_estimate', carrier_eligibility_verified:false, owner_approved:false }, published:false };
    const { error } = await admin.from('website_content').update(update).eq('content_key','product-shipping-settings');
    if (error) throw error;
    return Response.json({ status:body.action, packageSpecsVerified:body.action === 'publish', carrierEligibilityVerified:body.action === 'publish' && body.confirmCarrierEligibility === true }, { headers });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : 'Unable to save shipping settings' }, { status:400, headers });
  }
});
