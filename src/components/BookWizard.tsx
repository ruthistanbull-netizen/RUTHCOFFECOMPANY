"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useMemo, useState } from "react";

type Booking = {
  name:string; email:string; phone:string; company:string; businessType:string; services:string[]; description:string; date:string; time:string; tasting:boolean|null; tastingType:string; address:string;
};
const empty:Booking={name:"",email:"",phone:"",company:"",businessType:"",services:[],description:"",date:"",time:"",tasting:null,tastingType:"Both",address:""};
const steps=["Contact","Business","Services","Context","Date & Time","Tasting","Review"];
const businessTypes=["Café","Restaurant","Hotel","Office","New Business","Existing Business","Other"];
const services=["Café Opening","Coffee Selection","Espresso Setup","Recipe / Menu","Workflow","Equipment","Training","Wholesale Coffee","Business Optimization"];
const times=["10:00","11:30","13:00","14:30","16:00","17:30"];
export function BookWizard(){
 const [step,setStep]=useState(0); const [form,setForm]=useState<Booking>(empty); const [sent,setSent]=useState(false);
 const canNext=useMemo(()=>{
  if(step===0)return !!(form.name&&form.email&&form.phone);
  if(step===1)return !!form.businessType;
  if(step===2)return form.services.length>0;
  if(step===3)return form.description.length>8;
  if(step===4)return !!(form.date&&form.time);
  if(step===5)return form.tasting!==null && (!form.tasting || !!form.address);
  return true;
 },[step,form]);
 const toggleService=(s:string)=>setForm(f=>({...f,services:f.services.includes(s)?f.services.filter(x=>x!==s):[...f.services,s]}));
 if(sent)return <div className="booking-success"><motion.div initial={{scale:.7,opacity:0}} animate={{scale:1,opacity:1}} className="success-check"><Check/></motion.div><span className="eyebrow">REQUEST RECEIVED</span><h1>Your request is<br/>with us.</h1><p>Our team will review your appointment and contact you with confirmation.{form.tasting ? " Your Ruth Coffee tasting request is included." : ""}</p></div>;
 return <div className="booking-shell"><div className="booking-progress"><span>{String(step+1).padStart(2,"0")} / {String(steps.length).padStart(2,"0")}</span><div><i style={{width:`${((step+1)/steps.length)*100}%`}}/></div><strong>{steps[step]}</strong></div><AnimatePresence mode="wait"><motion.div className="booking-step" key={step} initial={{opacity:0,x:28}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-28}} transition={{duration:.34,ease:[.22,1,.36,1]}}>
 {step===0&&<><span className="eyebrow">LET&apos;S START</span><h2>Who are we<br/>speaking with?</h2><div className="form-grid"><label><span>NAME & SURNAME</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name"/></label><label><span>COMPANY</span><input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Business name"/></label><label><span>EMAIL</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@company.com"/></label><label><span>PHONE</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+90"/></label></div></>}
 {step===1&&<><span className="eyebrow">YOUR BUSINESS</span><h2>What type of<br/>business?</h2><div className="choice-grid">{businessTypes.map(v=><button className={form.businessType===v?"active":""} key={v} onClick={()=>setForm({...form,businessType:v})}>{v}<span>↗</span></button>)}</div></>}
 {step===2&&<><span className="eyebrow">SERVICES</span><h2>How can we<br/>help?</h2><div className="choice-grid multi">{services.map(v=><button className={form.services.includes(v)?"active":""} key={v} onClick={()=>toggleService(v)}>{v}{form.services.includes(v)?<Check size={16}/>:<span>+</span>}</button>)}</div></>}
 {step===3&&<><span className="eyebrow">CONTEXT</span><h2>Tell us about<br/>your business.</h2><label className="big-field"><span>CURRENT SETUP, GOALS, CHALLENGES</span><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Tell us what you are building or what you would like to improve..."/></label></>}
 {step===4&&<><span className="eyebrow">APPOINTMENT</span><h2>Select date<br/>& time.</h2><div className="date-time"><label><span>DATE</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><div><span>AVAILABLE TIMES</span><div className="time-grid">{times.map(t=><button className={form.time===t?"active":""} key={t} onClick={()=>setForm({...form,time:t})}>{t}</button>)}</div></div></div></>}
 {step===5&&<><span className="eyebrow">RUTH TASTING</span><h2>Would you like to<br/>taste Ruth Coffee?</h2><div className="yes-no"><button className={form.tasting===true?"active":""} onClick={()=>setForm({...form,tasting:true})}>YES<span>Add tasting to consultation</span></button><button className={form.tasting===false?"active":""} onClick={()=>setForm({...form,tasting:false})}>NO<span>Consultation only</span></button></div>{form.tasting&&<motion.div className="tasting-fields" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><label><span>TASTING TYPE</span><select value={form.tastingType} onChange={e=>setForm({...form,tastingType:e.target.value})}><option>Both</option><option>Espresso</option><option>Filter</option><option>Not sure</option></select></label><label><span>WHERE SHOULD THE TASTING TAKE PLACE?</span><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Address / venue"/></label></motion.div>}</>}
 {step===6&&<><span className="eyebrow">REVIEW</span><h2>Everything<br/>in one place.</h2><div className="review-list"><div><span>CONTACT</span><strong>{form.name}</strong><small>{form.company || "—"} · {form.email}</small></div><div><span>BUSINESS</span><strong>{form.businessType}</strong><small>{form.services.join(" · ")}</small></div><div><span>APPOINTMENT</span><strong>{form.date} · {form.time}</strong><small>{form.tasting?`Tasting included · ${form.tastingType}`:"No tasting requested"}</small></div></div><p className="booking-note">This frontend currently prepares the booking state locally. Submit will later connect to the Ruth Coffee backend/panel appointment API.</p></>}
 </motion.div></AnimatePresence><div className="booking-nav"><button disabled={step===0} onClick={()=>setStep(s=>Math.max(0,s-1))}><ArrowLeft/> BACK</button>{step<steps.length-1?<button className="next" disabled={!canNext} onClick={()=>setStep(s=>s+1)}>CONTINUE <ArrowRight/></button>:<button className="next" onClick={()=>setSent(true)}>REQUEST APPOINTMENT <ArrowRight/></button>}</div></div>
}
