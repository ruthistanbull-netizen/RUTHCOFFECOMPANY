-- All fixture appointments, rate counters, push jobs and pg_net wake-ups roll back.
begin;
set local role service_role;
do $$
declare
  inquiry jsonb; wholesale jsonb; request_key uuid := gen_random_uuid();
  appointment_id uuid; manual_id uuid; again_id uuid; blocked boolean; affected integer;
  test_ip text := repeat('b',64); test_date text := ((now() at time zone 'Europe/Istanbul')::date + 3)::text;
begin
  inquiry := jsonb_build_object('context','studio','businessName','Test İşletme','contactName','Test Yetkili',
    'email','test@example.invalid','phone','+905555555555','businessType','Kafe','city','İstanbul','website','',
    'needs','Test kahve programı görüşmesi','services',jsonb_build_array('Kahve Programı'),'monthlyKg','',
    'usage','','cupping',false,'date',test_date,'time','11:00 - 12:00','meeting','online','address','');
  appointment_id := public.submit_business_appointment(request_key,inquiry,test_ip);
  again_id := public.submit_business_appointment(request_key,inquiry,test_ip);
  if again_id <> appointment_id then raise exception 'retry created a duplicate'; end if;
  if (select count(*) from public.admin_push_jobs where dedupe_key='appointment:'||appointment_id::text) <> 1 then raise exception 'push not exactly once'; end if;
  if (select request_count from public.contact_rate_limits where ip_hash=test_ip) <> 1 then raise exception 'retry counted against limit'; end if;
  if not exists(select 1 from public.business_appointments a where id=appointment_id and context='studio' and status='pending' and a.inquiry->>'email'='test@example.invalid') then raise exception 'structured inquiry missing'; end if;
  blocked := false;
  begin
    perform public.submit_business_appointment(request_key,inquiry||jsonb_build_object('needs','Changed test needs'),test_ip);
  exception when others then
    if sqlerrm <> 'appointment_request_mismatch' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'mismatched retry accepted'; end if;
  wholesale := inquiry||jsonb_build_object('context','wholesale','services',jsonb_build_array(),'monthlyKg','25','usage','Espresso','cupping',true);
  manual_id := public.submit_business_appointment(gen_random_uuid(),wholesale,null,'manual',null,'confirmed','Test panel note');
  if exists(select 1 from public.admin_push_jobs where dedupe_key='appointment:'||manual_id::text) then raise exception 'manual appointment pushed'; end if;
  blocked := false;
  begin
    update public.business_appointments set status='confirmed' where id=appointment_id;
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'cross-context double booking accepted'; end if;
  update public.business_appointments set scheduled_time='13:00 - 14:00',status='confirmed' where id=appointment_id and revision=1;
  if not exists(select 1 from public.business_appointments a where id=appointment_id and revision=2 and a.inquiry->>'time'='11:00 - 12:00') then raise exception 'reschedule failed or requested time lost'; end if;
  update public.business_appointments set admin_notes='Stale change' where id=appointment_id and revision=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'stale edit overwrote data'; end if;
  update public.business_appointments set status='completed' where id=appointment_id and revision=2;
  if not exists(select 1 from public.business_appointments where id=appointment_id and revision=3 and status='completed') then raise exception 'completion failed'; end if;
  for i in 1..4 loop
    perform public.submit_business_appointment(gen_random_uuid(),inquiry,test_ip);
  end loop;
  blocked := false;
  begin
    perform public.submit_business_appointment(gen_random_uuid(),inquiry,test_ip);
  exception when others then
    if sqlerrm <> 'appointment_rate_limited' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'rate limit not enforced'; end if;
  blocked := false;
  begin
    perform public.submit_business_appointment(gen_random_uuid(),inquiry||jsonb_build_object('date','2020-01-01'),repeat('c',64));
  exception when others then
    if sqlerrm <> 'invalid_appointment_date' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'past appointment accepted'; end if;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon','public.business_appointments','select')
    or has_table_privilege('authenticated','public.business_appointments','select')
    or has_function_privilege('anon','public.submit_business_appointment(uuid,jsonb,text,text,uuid,text,text)','execute')
    then raise exception 'private appointment data exposed'; end if;
  if not exists(select 1 from net.http_request_queue where convert_from(body,'UTF8')::jsonb->>'source'='business_appointment') then raise exception 'immediate push wake-up did not enqueue'; end if;
end;
$$;
rollback;
select 'passed: persistence, both contexts, retries, mismatches, push deduplication, manual creation, cross-context schedule conflicts, rescheduling, revisions, completion, rate limits, past dates, access control and transactional push wake-up' as appointment_tests;
