export type PaymentSettings={test_mode:boolean;live_activation_approved?:boolean};
export function stripeEnvironment(settings:PaymentSettings){
  if(settings.test_mode){const secret=Deno.env.get('STRIPE_SECRET_KEY');if(!secret?.startsWith('rk_test_'))throw new Error('Stripe restricted sandbox key is not configured');return{secret,testMode:true};}
  if(!settings.live_activation_approved||Deno.env.get('LIVE_PAYMENTS_ENABLED')!=='true')throw new Error('Live payments require final owner approval');
  const secret=Deno.env.get('STRIPE_LIVE_SECRET_KEY');if(!secret?.startsWith('rk_live_'))throw new Error('Stripe restricted live key is not configured');return{secret,testMode:false};
}
