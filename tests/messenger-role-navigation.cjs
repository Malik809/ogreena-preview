const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
const stub=`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'owner-test'}}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{role:'owner'},error:null})})})};`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  const conversation='123e4567-e89b-42d3-a456-426614174000';
  try{
    for(const [name,options] of [['desktop',{viewport:{width:1280,height:900}}],['iphone',{...devices['iPhone 13']}]]){
      const context=await browser.newContext(options),page=await context.newPage();
      await page.route('**/vendor/supabase-2.57.4.min.js',route=>route.fulfill({contentType:'application/javascript',body:stub}));
      await page.goto(`http://127.0.0.1:4173/messages/?conversation=${conversation}`);
      await page.waitForURL(url=>url.pathname.endsWith('/owner/')&&url.hash==='#operations:messages');
      const url=new URL(page.url());
      assert.equal(url.hash,'#operations:messages');
      assert.equal(url.searchParams.get('conversation'),conversation);
      const dashboardPage=await context.newPage();
      await dashboardPage.route('**/owner/owner.js*',route=>route.fulfill({contentType:'application/javascript',body:''}));
      await dashboardPage.goto('http://127.0.0.1:4173/owner/');
      await dashboardPage.locator('#ownerDashboard').evaluate(node=>node.hidden=false);
      const messengerTab=dashboardPage.locator('[data-owner-messenger]');
      await messengerTab.scrollIntoViewIfNeeded();
      assert.equal(await messengerTab.isVisible(),true);
      assert.equal((await messengerTab.textContent()).trim().startsWith('Messenger'),true);
      console.log(name+': verified authenticated exact-conversation routing and dashboard tab visibility PASS');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
