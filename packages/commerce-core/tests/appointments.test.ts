import test from "node:test";
import assert from "node:assert/strict";
import { appointmentEdit, appointmentNotification, validateAppointmentEdit, type Appointment } from "../src/appointments.ts";
import { initialBusinessInquiry, validateBusinessInquiry } from "../src/business-inquiry.ts";

const now = new Date("2026-10-02T07:30:00Z"); // 10:30 in Istanbul
const id = "01234567-1234-4123-8123-123456789abc";
const inquiry = { ...initialBusinessInquiry("studio"), businessName:"Test Kafe",contactName:"Test Yetkili",email:"test@example.invalid",phone:"+90 555 555 5555",businessType:"Kafe",city:"İstanbul",needs:"Kahve programı için görüşmek istiyoruz.",services:["Kahve Programı"],date:"2026-10-02",time:"11:00 - 12:00",meeting:"online" };
const row:Appointment = { id,source:"storefront",context:"studio",inquiry,business_name:inquiry.businessName,contact_name:inquiry.contactName,scheduled_date:inquiry.date,scheduled_time:inquiry.time,meeting:inquiry.meeting,address:"",status:"pending",admin_notes:"",revision:1,created_at:now.toISOString(),updated_at:now.toISOString() };
test("storefront and manual forms accept the same future Istanbul slot",()=>{
  assert.deepEqual(validateBusinessInquiry(inquiry,now),{});
  assert.ok(validateBusinessInquiry({...inquiry,time:"09:00 - 10:00"},now).time);
  assert.deepEqual(validateBusinessInquiry({...inquiry,context:"wholesale",services:[],monthlyKg:"25",usage:"Espresso"},now),{});
});
test("past appointments can be completed without rewriting requested details",()=>{
  const previous={...row,scheduled_date:"2026-10-01",status:"confirmed" as const};
  assert.deepEqual(validateAppointmentEdit({...appointmentEdit(previous),status:"completed",admin_notes:"Görüşme tamamlandı."},previous,now),{});
  assert.equal(previous.inquiry.date,"2026-10-02");
});
test("confirming or rescheduling into a past slot is rejected",()=>{
  const previous={...row,scheduled_date:"2026-10-01"};
  assert.ok(validateAppointmentEdit({...appointmentEdit(previous),status:"confirmed"},previous,now).scheduled_time);
  assert.ok(validateAppointmentEdit({...appointmentEdit(row),scheduled_time:"09:00 - 10:00"},row,now).scheduled_time);
  assert.deepEqual(validateAppointmentEdit({...appointmentEdit(previous),status:"confirmed",scheduled_date:"2026-10-03"},previous,now),{});
});
test("face-to-face updates require a usable address and bounded notes",()=>{
  assert.ok(validateAppointmentEdit({...appointmentEdit(row),meeting:"in_person"},row,now).address);
  assert.deepEqual(validateAppointmentEdit({...appointmentEdit(row),meeting:"in_person",address:"İstanbul Kadıköy, Test Sokak 10"},row,now),{});
  assert.ok(validateAppointmentEdit({...appointmentEdit(row),admin_notes:"x".repeat(4001)},row,now).admin_notes);
});
test("appointment push links to the exact detail and carries an appointment type",()=>{
  for(const context of ["studio","wholesale"]) {
    const notification=appointmentNotification({appointment_id:id,context,business_name:"Test Kafe",date:"2026-10-03",time:"11:00 - 12:00"});
    assert.equal(notification?.url,`/appointments?appointment=${id}`);
    assert.equal(notification?.type,"appointment");
    assert.match(notification!.body,/Test Kafe.*3 Ekim 2026.*11:00 - 12:00/);
    assert.match(notification!.title,context==="studio"?/ROSTA.Studio/:/Toptan Kahve/);
  }
  assert.equal(appointmentNotification({appointment_id:"../../orders"}),null);
});
