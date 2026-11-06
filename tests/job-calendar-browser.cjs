const {webkit,chromium}=require('playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const owner={id:'00000000-0000-4000-8000-000000000010',email:'owner@example.invalid',role:'authenticated'};
const employeeId='00000000-0000-4000-8000-000000000011';
const session={access_token:'mock-owner-access',refresh_token:'mock-owner-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:owner};
const requests=[
  {id:'10000000-0000-4000-8000-000000000001',customer_id:'20000000-0000-4000-8000-000000000001',customer_name:'Jordan Customer',customer_phone:'5105550188',service_address:'123 Broadway, Oakland, CA 94607',service_slug:'carpet-cleaning',summary:'1 service selected',status:'scheduled',created_at:'2026-11-01T12:00:00Z'},
  {id:'10000000-0000-4000-8000-000000000002',customer_id:'20000000-0000-4000-8000-000000000002',customer_name:'Taylor Pending',customer_phone:'5105550199',service_address:'456 College Ave, Berkeley, CA 94704',service_slug:'house-cleaning',summary:'1 service selected',status:'submitted',created_at:'2026-11-02T12:00:00Z'},
  {id:'10000000-0000-4000-8000-000000000003',customer_id:'20000000-0000-4000-8000-000000000003',customer_name:'Morgan History',customer_phone:'5105550177',service_address:'789 Grand Ave, Oakland, CA 94610',service_slug:'janitorial-cleaning',summary:'Completed office cleaning',status:'completed',created_at:'2026-10-28T12:00:00Z'}
];
const appointments=[{id:'30000000-0000-4000-8000-000000000001',request_id:requests[0].id,customer_id:requests[0].customer_id,employee_id:employeeId,starts_at:'2026-11-10T17:00:00Z',ends_at:'2026-11-10T18:00:00Z',status:'confirmed'},{id:'30000000-0000-4000-8000-000000000003',request_id:requests[2].id,customer_id:requests[2].customer_id,employee_id:employeeId,starts_at:'2026-11-05T18:00:00Z',ends_at:'2026-11-05T19:00:00Z',status:'completed'}];
const items=[{request_id:requests[0].id,service_name:'Carpet Cleaning',item_name:'Bedroom Cleaning',created_at:'2026-11-01T12:00:00Z'},{request_id:requests[1].id,service_name:'House Cleaning',item_name:'Deep Cleaning',created_at:'2026-11-02T12:00:00Z'},{request_id:requests[2].id,service_name:'Janitorial Cleaning',item_name:'Office Cleaning',created_at:'2026-10-28T12:00:00Z'}];

(async()=>{
  const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch({headless:true});
  for(const viewport of [{name:'desktop',width:1440,height:900},{name:'iphone',width:390,height:844}]){
    const page=await browser.newPage({viewport});let scheduledPayload=null;
    await page.addInitScript(value=>localStorage.setItem('ogreena-auth-session',JSON.stringify(value)),session);
    await page.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(owner)}));
    await page.route('**/rest/v1/**',route=>{
      const url=new URL(route.request().url());let body=[];
      if(url.pathname.endsWith('/rpc/manage_job_schedule')){scheduledPayload=route.request().postDataJSON();body='30000000-0000-4000-8000-000000000002';}
      else if(url.pathname.endsWith('/user_roles'))body=url.search.includes('role=eq.employee')?[{user_id:employeeId}]:{role:'owner'};
      else if(url.pathname.endsWith('/appointments'))body=appointments;
      else if(url.pathname.endsWith('/service_requests'))body=requests;
      else if(url.pathname.endsWith('/service_request_items'))body=items;
      else if(url.pathname.endsWith('/profiles'))body=[{id:owner.id,display_name:'Ogreena Owner'},{id:employeeId,display_name:'Alex Worker'}];
      else if(url.pathname.endsWith('/business_settings'))body={id:true,business_name:'Ogreena LLC',phone:'5104729321',service_area:'Bay Area',contact_email:'owner@example.invalid'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${base}/owner/`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Job Calendar'}).click();
    await page.getByRole('heading',{name:'November 2026'}).waitFor();
    const columns=await page.locator('#jobCalendarGrid').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
    if(columns!==7)throw new Error(`${viewport.name}: month calendar does not have seven columns (${columns})`);
    if(await page.locator('.calendar-day').count()!==42)throw new Error(`${viewport.name}: month calendar does not render a complete six-week grid`);
    if(await page.locator('[data-calendar-job]').count()!==appointments.length)throw new Error(`${viewport.name}: existing or completed jobs were not loaded exactly once`);
    if(!await page.locator(`[data-calendar-job="${appointments[1].id}"]`).count())throw new Error(`${viewport.name}: completed job history is missing`);
    await page.locator(`[data-calendar-job="${appointments[0].id}"]`).click();
    for(const text of ['5105550188','123 Broadway','Bedroom Cleaning','Alex Worker','confirmed'])if(!await page.getByText(text,{exact:false}).count())throw new Error(`${viewport.name}: calendar is missing ${text}`);
    await page.locator('#jobScheduleForm [name="starts_at"]').fill('2026-11-11T10:15');
    await page.locator('#jobScheduleForm [name="ends_at"]').fill('2026-11-11T11:15');
    await page.getByRole('button',{name:'Save Job'}).click();await page.waitForTimeout(300);
    if(!scheduledPayload||scheduledPayload.schedule_id!==appointments[0].id||scheduledPayload.target_request_id!==requests[0].id)throw new Error(`${viewport.name}: existing job reschedule did not update the original appointment`);
    scheduledPayload=null;
    await page.locator('[data-calendar-empty-date="2026-11-12"]').click();
    if(await page.locator('#jobScheduleForm [name="request_id"]').inputValue()!==requests[1].id)throw new Error(`${viewport.name}: empty date did not offer the pending request`);
    if(await page.locator('#jobScheduleForm [name="starts_at"]').inputValue()!=='2026-11-12T09:00')throw new Error(`${viewport.name}: empty date did not prefill the selected calendar date`);
    await page.getByRole('button',{name:'Cancel'}).click();
    await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Week',exact:true}).click();await page.getByRole('button',{name:'Month',exact:true}).click();
    await page.locator(`[data-schedule-pending="${requests[1].id}"]`).click();
    await page.locator('#jobScheduleForm [name="starts_at"]').fill('2026-11-12T13:30');
    await page.locator('#jobScheduleForm [name="ends_at"]').fill('2026-11-12T15:30');
    await page.locator('#jobScheduleForm [name="employee_id"]').selectOption(employeeId);
    await page.getByRole('button',{name:'Save Job'}).click();
    await page.waitForTimeout(300);
    if(!scheduledPayload||scheduledPayload.target_request_id!==requests[1].id||scheduledPayload.assigned_worker_id!==employeeId)throw new Error(`${viewport.name}: schedule RPC payload is incomplete`);
    if(!/T21:30:00\.000Z$/.test(scheduledPayload.scheduled_start))throw new Error(`${viewport.name}: Los Angeles time conversion is incorrect: ${scheduledPayload.scheduled_start}`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflow>1)throw new Error(`${viewport.name}: calendar overflows by ${overflow}px`);
    console.log(`${viewport.name}: private week/month/day calendar, job details, pending scheduling, and Los Angeles time PASS`);
    await page.close();
  }
  await browser.close();
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
