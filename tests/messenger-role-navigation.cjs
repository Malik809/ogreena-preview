const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
const stub=`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'owner-test'}}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{role:'owner'},error:null})})})};`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const [name,options] of [['desktop',{viewport:{width:1280,height:900}}],['iphone',{...devices['iPhone 13']}]]){
      const context=await browser.newContext(options),page=await context.newPage();
      await page.route('**/vendor/supabase-2.57.4.min.js',route=>route.fulfill({contentType:'application/javascript',body:stub}));
      await page.goto('http://127.0.0.1:4173/messages/?service=carpet-cleaning');
      await page.waitForURL(url=>url.pathname.endsWith('/owner/')&&url.hash==='#operations:messages');
      const url=new URL(page.url());
      assert.equal(url.hash,'#operations:messages');
      assert.equal(url.search,'');
      console.log(name+': verified owner routes to existing Owner Messages without service-conversation parameters PASS');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
